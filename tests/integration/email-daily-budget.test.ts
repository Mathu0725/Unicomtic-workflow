import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const send = vi.hoisted(() => vi.fn());
const syncSheet = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/email/smtp-client", () => ({ sendEmail: send }));
vi.mock("../../src/lib/google/sheets-service", () => ({ googleSheetsService: { syncRecords: syncSheet } }));
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { enqueue, processOutbox, queueSheet } from "../../src/lib/jobs/outbox";
import { emailBudget, EMAIL_DAY_MS, emailSender, reserveEmailDispatch, settleEmailDispatch } from "../../src/lib/email/sending-budget";
import { emailJobStatus } from "../../src/lib/email/job-status";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tic-email-budget-"));
  vi.stubEnv("DATA_DIR", dir); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false");
  send.mockReset(); syncSheet.mockReset(); send.mockResolvedValue({ success: true, provider: "gmail", messageId: "mock-accepted" }); syncSheet.mockResolvedValue({ success: true });
  await transaction(db => { db.integrations.email_daily_limit = 1; db.integrations.google = { email: "sender@gmail.com", refresh_token: "mock", scopes: [], connected_at: new Date().toISOString() }; db.integrations.registration_sheet_id = "admissions"; });
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
it("shares atomic reservations across overlapping workers and preserves the cap after another run", async () => {
  await transaction(db => { for (let n = 0; n < 4; n++) enqueue(db, "email", `job:${n}`, { to: `candidate${n}@example.com`, subject: "Saved", html: "" }); });
  await Promise.all([processOutbox(), processOutbox(), processOutbox()]); await processOutbox();
  const db = await readDatabase();
  expect(send).toHaveBeenCalledTimes(1); expect(emailBudget(db)).toMatchObject({ used: 1, accepted: 1, remaining: 0 });
  expect(db.outbox.filter(job => job.status === "sent")).toHaveLength(1);
  for (const job of db.outbox.filter(job => job.status === "queued")) { expect(job.attempts).toBe(0); expect(emailJobStatus(job).label).toBe("Waiting for daily limit"); }
});
it.each(["temporary", "permanent", "blocked"])("releases an allowance when the provider confirms a %s rejection", async failureKind => {
  await transaction(db => enqueue(db, "email", "reject", { to: "candidate@example.com", subject: "Saved", html: "" }));
  send.mockResolvedValue({ success: false, failureKind, error: "Not accepted", errorCode: "KNOWN_REJECTION" });
  await processOutbox(1);
  expect(emailBudget(await readDatabase())).toMatchObject({ used: 0, remaining: 1 });
});
it("retains uncertain sends in the allowance and never automatically resends them", async () => {
  await transaction(db => { enqueue(db, "email", "uncertain", { to: "candidate@example.com", subject: "Saved", html: "" }); enqueue(db, "email", "later", { to: "later@example.com", subject: "Saved", html: "" }); });
  send.mockResolvedValue({ success: false, uncertain: true, failureKind: "uncertain", error: "Connection lost after send" });
  await processOutbox(); await processOutbox();
  expect(send).toHaveBeenCalledTimes(1); expect(emailBudget(await readDatabase())).toMatchObject({ used: 1, uncertain: 1, canSend: false });
});
it("pauses the sender on a provider daily quota error while Sheets can still progress", async () => {
  await transaction(db => { db.integrations.email_daily_limit = 500; enqueue(db, "email", "quota", { to: "candidate@example.com", subject: "Saved", html: "" }); enqueue(db, "email", "later", { to: "later@example.com", subject: "Saved", html: "" }); });
  send.mockResolvedValue({ success: false, failureKind: "temporary", errorCode: "EMAIL_PROVIDER_DAILY_LIMIT", error: "Daily provider limit reached", retryAfterMs: EMAIL_DAY_MS });
  await processOutbox();
  await transaction(db => queueSheet(db, "admissions", "Registrations", { referenceNo: "REG-001" }));
  await processOutbox();
  const db = await readDatabase(); expect(send).toHaveBeenCalledTimes(1); expect(syncSheet).toHaveBeenCalledTimes(1);
  expect(emailBudget(db)).toMatchObject({ used: 0, paused: true, canSend: false });
  expect(db.outbox.find(job => job.key === "later")).toMatchObject({ status: "queued", attempts: 0 });
  expect(emailJobStatus(db.outbox.find(job => job.key === "quota")!).filter).toBe("failed");
});
it("counts existing accepted jobs, expires usage after 24 hours and shares Gmail/SMTP aliases", async () => {
  const now = Date.now();
  await transaction(db => { const job = enqueue(db, "email", "old", { to: "candidate@example.com", subject: "Saved", html: "" }); job.status = "sent"; job.completed_at = new Date(now).toISOString(); });
  const db = await readDatabase(); expect(emailBudget(db, now)).toMatchObject({ used: 1, canSend: false }); expect(emailBudget(db, now + EMAIL_DAY_MS + 1).used).toBe(0);
  db.integrations.email_provider = "smtp"; db.integrations.smtp = { username: "s.e.n.d.e.r+portal@googlemail.com", host: "smtp.gmail.com" } as any;
  expect(emailSender(db)).toBe("sender@gmail.com"); expect(emailBudget(db, now).used).toBe(1);
});
it("keeps persisted usage when switching accounts and correctly computes availability after lowering the cap", async () => {
  const db = await readDatabase(), now = Date.now(); db.integrations.email_daily_limit = 3;
  for (let n = 0; n < 3; n++) { const job = enqueue(db, "email", `accepted:${n}`, { to: "candidate@example.com" }); expect(reserveEmailDispatch(db, job, now + n * 1000)).toBe(true); job.status = "sent"; settleEmailDispatch(db, job, "accepted", now + n * 1000); }
  db.integrations.email_daily_limit = 1;
  expect(emailBudget(db, now + 4000).nextAvailableAt).toBe(new Date(now + 2000 + EMAIL_DAY_MS).toISOString());
  db.integrations.google!.email = "other@gmail.com"; expect(emailBudget(db, now + 4000).used).toBe(0);
  db.integrations.google!.email = "sender@gmail.com"; expect(emailBudget(db, now + 4000).used).toBe(3);
});
it("recovers an interrupted reserved send as uncertain without releasing its allowance", async () => {
  await transaction(db => { const job = enqueue(db, "email", "interrupted", { to: "candidate@example.com" }); reserveEmailDispatch(db, job, Date.now() - 5000); job.status = "sending"; job.attempts = 1; job.lease_until = new Date(Date.now() - 1000).toISOString(); });
  await processOutbox(); expect(send).not.toHaveBeenCalled(); expect(emailBudget(await readDatabase())).toMatchObject({ used: 1, uncertain: 1 });
});

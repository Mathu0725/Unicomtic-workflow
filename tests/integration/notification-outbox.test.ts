import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const send = vi.hoisted(() => vi.fn());
const syncSheet = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/email/smtp-client", () => ({ sendEmail: send }));
vi.mock("../../src/lib/google/sheets-service", () => ({ googleSheetsService: { syncRecords: syncSheet } }));
import { enqueue, processOutbox, queueSheet } from "../../src/lib/jobs/outbox";
import { readDatabase, transaction } from "../../src/lib/data/repository";
let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tic-outbox-test-"));
    vi.stubEnv("DATA_DIR", dir);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
    vi.stubEnv("SEED_DEMO_DATA", "false");
    send.mockReset();
    syncSheet.mockReset();
    await transaction(db => { db.integrations.registration_sheet_id = "admissions"; db.integrations.application_sheet_id = "admissions"; db.formSubmissions.push({ id: "submission-1", form_id: db.customForms[0].id, reference_no: "REG-1", data: {}, email_sent: false, synced_to_sheet: false, created_at: new Date().toISOString() }); enqueue(db, "email", "confirmation:1", { to: "student@example.com", subject: "Confirmation", html: "Saved", sourceId: "submission-1" }); });
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
it("records Gmail acceptance and message id only after a successful send", async () => {
    send.mockResolvedValue({ success: true, messageId: "gmail-msg-123", provider: "gmail" });
    await processOutbox();
    await processOutbox();
    const db = await readDatabase();
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.outbox[0].provider_id).toBe("gmail-msg-123");
    expect(db.outbox[0].status).toBe("sent");
    expect(db.formSubmissions[0].email_sent).toBe(true);
});
it("preserves failed jobs for backoff and never claims their emails were sent", async () => {
    send.mockResolvedValue({ success: false, error: "Permission denied" });
    await processOutbox();
    await processOutbox();
    const db = await readDatabase();
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.outbox[0].status).toBe("queued");
    expect(db.outbox[0].next_attempt_at).toBeDefined();
    expect(db.formSubmissions[0].email_sent).toBe(false);
});
it("does not automatically resend an uncertain email after a provider timeout", async () => {
    send.mockResolvedValue({ success: false, error: "Timeout", uncertain: true });
    await processOutbox();
    await processOutbox();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await readDatabase()).outbox[0].status).toBe("uncertain");
});
it("does not duplicate an existing notification when enqueue is retried", async () => {
    await transaction(db => enqueue(db, "email", "confirmation:1", { to: "student@example.com", subject: "Confirmation", html: "Saved" }));
    expect((await readDatabase()).outbox).toHaveLength(1);
});
it("exports 100 registration jobs in one provider call and overlapping workers do not resend them", async () => {
    syncSheet.mockResolvedValue({ success: true });
    await transaction(db => {
        db.outbox = [];
        for (let n = 0; n < 100; n++) queueSheet(db, "admissions", "Registrations", { referenceNo: `REG-${n}`, fullName: "Applicant" });
    });
    await Promise.all([processOutbox(120), processOutbox(120)]);
    expect(syncSheet).toHaveBeenCalledTimes(1);
    expect(syncSheet.mock.calls[0][2]).toHaveLength(100);
    expect((await readDatabase()).outbox.every(j => j.status === "sent")).toBe(true);
});
it("honors provider backoff and marks an unexpected mail exception uncertain", async () => {
    send.mockRejectedValue(new Error("Provider disconnected"));
    await processOutbox();
    expect((await readDatabase()).outbox[0].status).toBe("uncertain");
    await transaction(db => {
        db.queueControl = {};
        queueSheet(db, "admissions", "Registrations", { referenceNo: "REG-LIMIT" });
    });
    syncSheet.mockResolvedValue({ success: false, error: "Rate limit", retryAfterMs: 600000 });
    await processOutbox();
    const sheet = (await readDatabase()).outbox.find(j => j.type === "sheet")!;
    expect(sheet.status).toBe("queued");
    expect(Date.parse(sheet.next_attempt_at!)).toBeGreaterThan(Date.now() + 590000);
});
it("blocks a broken sender lane without burning attempts on every queued applicant", async () => {
    send.mockResolvedValue({ success: false, error: "Reconnect Google.", errorCode: "GOOGLE_AUTH_REVOKED", failureKind: "blocked", action: "reconnect_google" });
    await transaction(db => { enqueue(db, "email", "confirmation:2", { to: "second@example.com", subject: "Saved", html: "Saved" }); });
    await processOutbox(); await processOutbox();
    const db = await readDatabase();
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.outbox.every(j => j.status === "blocked")).toBe(true);
    expect(db.outbox[1].attempts).toBe(0);
});
it("fails a permanently rejected recipient without retrying it", async () => {
    send.mockResolvedValue({ success: false, error: "Recipient rejected.", errorCode: "RECIPIENT_REJECTED", failureKind: "permanent" });
    await processOutbox(); await processOutbox();
    expect(send).toHaveBeenCalledTimes(1); expect((await readDatabase()).outbox[0].status).toBe("failed");
});
it("recovers expired leases and isolates malformed Sheet rows from valid exports", async () => {
    syncSheet.mockResolvedValue({ success: true });
    await transaction(db => {
        db.outbox[0].status = "sending"; db.outbox[0].lease_until = new Date(Date.now() - 1000).toISOString();
        enqueue(db, "sheet", "poison", { sheetId: "admissions", sheetName: "Registrations", rows: [{ referenceNo: null }] });
        queueSheet(db, "admissions", "Registrations", { referenceNo: "REG-GOOD" });
    });
    await processOutbox();
    const db = await readDatabase();
    expect(send).not.toHaveBeenCalled(); expect(db.outbox[0].status).toBe("uncertain");
    expect(db.outbox.find(j => j.key === "poison")?.error_code).toBe("INVALID_JOB_DATA");
    expect(db.outbox.find(j => j.type === "sheet" && j.key !== "poison")?.status).toBe("sent");
    expect(syncSheet.mock.calls[0][2]).toEqual([{ referenceNo: "REG-GOOD" }]);
});
it("pauses an older Sheet destination before contacting the provider", async () => {
    await transaction(db => { db.outbox = []; queueSheet(db, "old-destination", "Registrations", { referenceNo: "REG-OLD" }); });
    await processOutbox();
    const job = (await readDatabase()).outbox[0];
    expect(job).toMatchObject({ status: "blocked", attempts: 0, error_code: "SHEET_DESTINATION_CHANGED" });
    expect(syncSheet).not.toHaveBeenCalled();
});

it("upgrades queued legacy form exports to stable submission keys before dispatch", async () => {
    syncSheet.mockResolvedValue({ success: true });
    await transaction(db => { db.outbox = []; queueSheet(db, "admissions", "Registrations", { referenceNo: "REG-1", customAnswer: "Keep answer" }, "submission-1"); });
    await processOutbox();
    expect(syncSheet.mock.calls[0][2][0]).toMatchObject({ referenceNo: "SUB-submission-1", responseReference: "REG-1", submissionId: "submission-1", customAnswer: "Keep answer" });
});

it("does not deliver a stale decision version restored to the queue", async () => {
    await transaction(db => {
        db.outbox = [];
        db.selectionDecisions.push({ id: "decision", campaign_id: "camp-2025", student_id: "student", revision: 3, final_status: "selected", notification_status: "pending", approved_by: "staff", approved_at: new Date().toISOString() });
        enqueue(db, "email", "decision:decision:selected:v1", { decisionId: "decision", to: "student@example.com", subject: "Old offer", html: "Old" });
    });
    await processOutbox();
    expect(send).not.toHaveBeenCalled();
    const db = await readDatabase(); expect(db.outbox[0].error_code).toBe("DECISION_SUPERSEDED"); expect(db.selectionDecisions[0].notification_status).toBe("pending");
});

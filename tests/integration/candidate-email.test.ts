import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
const send = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/email/smtp-client", () => ({ sendEmail: send, verifySmtpConnection: vi.fn(), getDefaultSmtpConfig: vi.fn() }));
vi.mock("../../src/lib/google/sheets-service", () => ({ googleSheetsService: { syncRecords: vi.fn() } }));
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { enqueue } from "../../src/lib/jobs/outbox";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import { GET, POST } from "../../src/app/api/admin/email/candidates/route";
import { POST as dispatch } from "../../src/app/api/admin/email/dispatch/route";
import { GET as history } from "../../src/app/api/admin/notifications/route";
import { POST as limits } from "../../src/app/api/admin/email/limits/route";
import { POST as legacyEmail } from "../../src/app/api/admin/email/route";

let dir: string;
function request(url = "/api/admin/email/candidates", body?: any, role = "admin", key = "candidate-email-test-key-0001") {
  return new NextRequest(`http://localhost:3000${url}`, { method: body ? "POST" : "GET", headers: { cookie: `${SESSION_COOKIE}=${signSession({ email: "admin@example.com", name: "Admin", role })}`, ...(body ? { "content-type": "application/json", "idempotency-key": key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const input = { stage: "registration", recordId: "reg-1", expectedEmail: "candidate@example.com", subject: "Your next step", body: "Hello <candidate>\nவணக்கம் & thanks", clientAttemptId: "ae3fe8f9-dd20-493e-979a-7d5cbfda3e52" };
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tic-candidate-email-"));
  vi.stubEnv("DATA_DIR", dir); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false"); vi.stubEnv("APP_SECRET", "test-only-secret-with-at-least-32-characters");
  send.mockReset(); send.mockResolvedValue({ success: true, provider: "gmail", messageId: "mock-id" });
  await transaction(db => {
    db.students = [{ id: "stu-1", full_name: "Test Candidate", email: "candidate@example.com", district: "Jaffna", nic: "private-identity" } as any, { id: "stu-2", full_name: "Second Candidate", email: "second@example.com", district: "Colombo" } as any];
    db.registrations = [{ id: "reg-1", reference_no: "REG-001", student_id: "stu-1", status: "invited" } as any, { id: "reg-2", reference_no: "REG-002", student_id: "stu-2", status: "applied" } as any];
    db.applications = [{ id: "app-2", application_no: "APP-002", registration_id: "reg-2", student_id: "stu-2", status: "submitted" } as any];
    db.integrations.google = { email: "sender@gmail.com", refresh_token: "mock", scopes: [], connected_at: new Date().toISOString() };
  });
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
it("filters registrations and applications by status, name, email and reference without identity fields", async () => {
  for (const search of ["Test Candidate", "candidate@example.com", "REG-001"]) {
    const data = await (await GET(request(`/api/admin/email/candidates?stage=registration&status=invited&search=${encodeURIComponent(search)}`), {})).json();
    expect(data.total).toBe(1); expect(data.candidates[0]).toMatchObject({ id: "reg-1", stage: "registration" }); expect(JSON.stringify(data)).not.toContain("private-identity");
  }
  const data = await (await GET(request("/api/admin/email/candidates?stage=application&status=submitted&search=REG-002"), {})).json();
  expect(data.candidates).toHaveLength(1); expect(data.candidates[0]).toMatchObject({ id: "app-2", reference: "APP-002", registrationReference: "REG-002" });
});
it.each(["entrance_staff", "examiner", "unknown"])("forbids the %s role from candidate mail, limits and dispatch", async role => {
  expect((await GET(request(undefined, undefined, role), {})).status).toBe(403);
  expect((await POST(request(undefined, input, role), {})).status).toBe(403);
  expect((await limits(request("/api/admin/email/limits", { limit: 1 }, role), {})).status).toBe(403);
  expect((await dispatch(request("/api/admin/email/dispatch", { jobId: "x" }, role), {})).status).toBe(403);
});
it("queues exactly one durable candidate message on a repeated request and escapes HTML", async () => {
  const first = await (await POST(request(undefined, input), {})).json();
  const replay = await POST(request(undefined, input), {});
  expect(replay.headers.get("Idempotency-Replayed")).toBe("true"); expect((await replay.json()).jobId).toBe(first.jobId);
  const db = await readDatabase(); expect(db.outbox).toHaveLength(1); expect(send).not.toHaveBeenCalled();
  expect(db.outbox[0].payload).toMatchObject({ to: "candidate@example.com", html: expect.stringContaining("&lt;candidate&gt;<br />வணக்கம் &amp; thanks"), candidateMessage: { recordId: "reg-1", stage: "registration" } });
  expect(db.auditLogs.filter(log => log.action === "CANDIDATE_EMAIL_QUEUED")).toHaveLength(1);
  expect(JSON.stringify(db.auditLogs)).not.toContain(input.body);
  expect((await POST(request(undefined, { ...input, body: "Changed content" }), {})).status).toBe(409);
});
it("rejects missing retry keys, forged recipients, changed contacts and injected subject headers", async () => {
  const noKey = request(undefined, input); noKey.headers.delete("idempotency-key");
  expect((await POST(noKey, {})).status).toBe(400);
  expect((await POST(request(undefined, { ...input, to: "attacker@example.com" }), {})).status).toBe(400);
  expect((await POST(request(undefined, { ...input, expectedEmail: "changed@example.com" }), {})).status).toBe(409);
  expect((await POST(request(undefined, { ...input, subject: "Hi\r\nBcc: other@example.com" }), {})).status).toBe(400);
  expect((await readDatabase()).outbox).toHaveLength(0);
});
it("dispatches only the selected email and reports confirmed provider failure", async () => {
  await transaction(db => enqueue(db, "email", "unrelated", { to: "untouched@example.com", subject: "Unrelated", html: "" }));
  const queued = await (await POST(request(undefined, input), {})).json();
  send.mockResolvedValue({ success: false, failureKind: "permanent", errorCode: "RECIPIENT_REJECTED", error: "Recipient rejected." });
  const result = await (await dispatch(request("/api/admin/email/dispatch", { jobId: queued.jobId }), {})).json();
  expect(result).toMatchObject({ status: "failed", message: expect.stringContaining("Recipient rejected") });
  expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0].to).toBe("candidate@example.com");
  expect((await readDatabase()).outbox.find(job => job.key === "unrelated")).toMatchObject({ status: "queued", attempts: 0 });
});
it("filters delivery history before pagination and includes legacy form confirmations", async () => {
  await transaction(db => {
    db.formSubmissions.push({ id: "old-sub", form_id: "form", registration_id: "reg-1", reference_no: "REG-001", data: {}, email_sent: false, synced_to_sheet: false, created_at: new Date().toISOString() });
    const old = enqueue(db, "email", "submission:old-sub:applicant", { to: "candidate@example.com", subject: "Old confirmation", html: "" }); old.status = "failed"; old.error = "Invalid recipient";
    for (let n = 0; n < 300; n++) enqueue(db, "email", `unrelated:${n}`, { to: "other@example.com", subject: "Other mail", html: "" });
  });
  const data = await (await history(request("/api/admin/notifications?stage=registration&status=failed&search=REG-001&type=email"), {})).json();
  expect(data.total).toBe(1); expect(data.jobs[0].candidate).toMatchObject({ id: "reg-1", name: "Test Candidate" });
});
it("does not send a queued message to an outdated candidate contact", async () => {
  const queued = await (await POST(request(undefined, input), {})).json();
  await transaction(db => { db.students[0].email = "updated@example.com"; });
  const result = await (await dispatch(request("/api/admin/email/dispatch", { jobId: queued.jobId }), {})).json();
  expect(result.status).toBe("failed"); expect(send).not.toHaveBeenCalled();
  expect((await readDatabase()).outbox[0].error_code).toBe("CANDIDATE_CONTACT_CHANGED");
});
it("enforces a 1–500 cap and saving limits does not reset existing usage", async () => {
  for (const limit of [0, 501, 1.5, "100"]) expect((await limits(request("/api/admin/email/limits", { limit }), {})).status).toBe(400);
  await transaction(db => { const job = enqueue(db, "email", "sent", { to: "done@example.com", subject: "Done", html: "" }); job.status = "sent"; job.completed_at = new Date().toISOString(); });
  const data = await (await limits(request("/api/admin/email/limits", { limit: 1 }), {})).json();
  expect(data.budget).toMatchObject({ limit: 1, used: 1, remaining: 0, canSend: false });
});
it("rejects the legacy SMTP direct-send bypass", async () => {
  expect((await legacyEmail(request("/api/admin/email", { action: "test_smtp", testRecipient: "test@example.com" }), {})).status).toBe(400);
  expect(send).not.toHaveBeenCalled();
});

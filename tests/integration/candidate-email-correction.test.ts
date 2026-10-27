import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
const send = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/email/smtp-client", () => ({ sendEmail: send }));
vi.mock("../../src/lib/google/sheets-service", () => ({ googleSheetsService: { syncRecords: vi.fn(), spreadsheetId: (value: string) => value } }));
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { enqueue, queueSheet } from "../../src/lib/jobs/outbox";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import { PATCH } from "../../src/app/api/admin/candidates/email/route";
import { POST as notifications } from "../../src/app/api/admin/notifications/route";
import { GET as candidates } from "../../src/app/api/admin/email/candidates/route";
import { GET as responses } from "../../src/app/api/admin/forms/[id]/responses/route";
import { POST as submit } from "../../src/app/api/forms/[slug]/route";
import { POST as registration } from "../../src/app/api/registrations/route";
import { canonicalStudent } from "../../src/lib/admissions/service";

let dir: string;
function request(url: string, body?: any, role = "admin", method = "PATCH") {
  return new NextRequest(`http://localhost:3000${url}`, { method: body ? method : "GET", headers: { ...(role ? { cookie: `${SESSION_COOKIE}=${signSession({ email: "admin@example.com", name: "Admin", role })}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const correction = { studentId: "stu-1", expectedEmail: "candidate@example.con", email: "candidate@example.com" };
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tic-email-correction-"));
  vi.stubEnv("DATA_DIR", dir); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false"); vi.stubEnv("APP_SECRET", "test-only-secret-with-at-least-32-characters");
  send.mockReset();
  await transaction(db => {
    db.students = [{ id: "stu-1", full_name: "Test Candidate", email: correction.expectedEmail, district: "Jaffna" } as any, { id: "stu-2", full_name: "Other Candidate", email: "other@example.com" } as any];
    db.registrations = [{ id: "reg-1", reference_no: "REG-001", student_id: "stu-1", status: "applied" } as any];
    db.applications = [{ id: "app-1", application_no: "APP-001", registration_id: "reg-1", student_id: "stu-1", status: "submitted" } as any];
    db.customForms[0].fields = [{ id: "mainEmail", type: "email", systemKey: "email", label: "Email", required: true }, { id: "guardianEmail", type: "email", label: "Guardian email", required: false }];
    db.formSubmissions.push({ id: "sub-1", form_id: db.customForms[0].id, reference_no: "REG-001", student_id: "stu-1", registration_id: "reg-1", data: { mainEmail: correction.expectedEmail, email: correction.expectedEmail, guardianEmail: "guardian@example.com" }, synced_to_sheet: true, email_sent: true, created_at: new Date().toISOString() });
    db.integrations.registration_sheet_id = "current-sheet";
    enqueue(db, "email", "submission:sub-1:applicant", { to: correction.expectedEmail, subject: "Confirmation", html: "", sourceId: "sub-1" });
    enqueue(db, "email", "submission:sub-1:admin:admin@example.com", { to: "admin@example.com", subject: "Admin alert", html: "", sourceId: "sub-1" });
    enqueue(db, "sheet", "old-export", { sheetId: "current-sheet", sheetName: "Registrations", sourceId: "sub-1", rows: [{ referenceNo: "REG-001", email: correction.expectedEmail }] });
  });
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
it.each(["", "entrance_staff", "examiner"])("requires an authorized admin to correct contacts (%s)", async role => {
  expect((await PATCH(request("/api/admin/candidates/email", correction, role), {})).status).toBe(role ? 403 : 401);
  expect((await readDatabase()).students[0].email).toBe(correction.expectedEmail);
});
it("updates one shared identity, mapped answers and candidate lists, with an audit trail and no mail send", async () => {
  const result = await (await PATCH(request("/api/admin/candidates/email", { ...correction, email: " CANDIDATE@EXAMPLE.COM " }), {})).json();
  expect(result).toMatchObject({ success: true, email: correction.email, pausedEmails: 1, pausedExports: 1 });
  const db = await readDatabase(); expect(db.students[0].email).toBe(correction.email); expect(db.students).toHaveLength(2);
  expect(db.formSubmissions[0]).toMatchObject({ synced_to_sheet: false, data: { mainEmail: correction.email, email: correction.email, guardianEmail: "guardian@example.com" } });
  expect(db.outbox[0]).toMatchObject({ status: "blocked", error_code: "CANDIDATE_CONTACT_CHANGED", payload: { to: correction.expectedEmail } });
  expect(db.outbox[1].status).toBe("queued"); expect(db.outbox[2]).toMatchObject({ status: "blocked", error_code: "CANDIDATE_EXPORT_CHANGED" });
  expect(db.auditLogs.at(-1)).toMatchObject({ action: "CANDIDATE_EMAIL_CORRECTED", user_email: "admin@example.com", changes: { previousEmail: correction.expectedEmail, email: correction.email } });
  for (const stage of ["registration", "application"]) {
    const data = await (await candidates(request(`/api/admin/email/candidates?stage=${stage}`), {})).json();
    expect(data.candidates[0].email).toBe(correction.email);
  }
  expect(send).not.toHaveBeenCalled();
  const replay = await PATCH(request("/api/admin/candidates/email", correction), {});
  expect(replay.status).toBe(200); expect((await readDatabase()).auditLogs.filter(log => log.action === "CANDIDATE_EMAIL_CORRECTED")).toHaveLength(1);
});
it("rejects bad domains, duplicate identities, forged fields and stale edits without partial writes", async () => {
  for (const email of ["bad", "candidate@example.con", "candidate@example.comm"]) expect((await PATCH(request("/api/admin/candidates/email", { ...correction, email }), {})).status).toBe(400);
  expect((await PATCH(request("/api/admin/candidates/email", { ...correction, email: "other@example.com" }), {})).status).toBe(409);
  expect((await PATCH(request("/api/admin/candidates/email", { ...correction, expectedEmail: "stale@example.com" }), {})).status).toBe(409);
  expect((await PATCH(request("/api/admin/candidates/email", { ...correction, role: "super_admin" }), {})).status).toBe(400);
  expect((await readDatabase()).students[0].email).toBe(correction.expectedEmail);
});
it("allows only one of two concurrent corrections and preserves the winning address", async () => {
  const results = await Promise.all([PATCH(request("/api/admin/candidates/email", correction), {}), PATCH(request("/api/admin/candidates/email", { ...correction, email: "another@example.com" }), {})]);
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  expect((await readDatabase()).auditLogs.filter(log => log.action === "CANDIDATE_EMAIL_CORRECTED")).toHaveLength(1);
});
it("refuses a correction while an affected job is already sending", async () => {
  await transaction(db => { db.outbox[0].status = "sending"; });
  expect((await PATCH(request("/api/admin/candidates/email", correction), {})).status).toBe(409);
  expect((await readDatabase()).students[0].email).toBe(correction.expectedEmail);
});
it("preserves accepted/uncertain delivery history and blocks retrying old-address uncertain jobs", async () => {
  await transaction(db => {
    db.outbox[0].status = "uncertain";
    const sent = enqueue(db, "email", "submission:sub-1:old-sent", { to: correction.expectedEmail, sourceId: "sub-1" }); sent.status = "sent"; sent.provider_id = "accepted-old";
  });
  await PATCH(request("/api/admin/candidates/email", correction), {});
  const db = await readDatabase(); expect(db.outbox[0]).toMatchObject({ status: "uncertain", error_code: "CANDIDATE_CONTACT_CHANGED" });
  expect(db.outbox.at(-1)).toMatchObject({ status: "sent", provider_id: "accepted-old", payload: { to: correction.expectedEmail } });
  expect((await notifications(request("/api/admin/notifications", { action: "retry", jobId: db.outbox[0].id, confirmProviderChecked: true }, "admin", "POST"), {})).status).toBe(409);
  expect(send).not.toHaveBeenCalled();
});
it("marks an old accepted Sheet row out of date after an email correction", async () => {
  await transaction(db => { db.outbox[2].status = "sent"; });
  await PATCH(request("/api/admin/candidates/email", correction), {});
  const db = await readDatabase();
  const data = await (await responses(request(`/api/admin/forms/${db.customForms[0].id}/responses`), { params: { id: db.customForms[0].id } })).json();
  expect(data.submissions[0].synced_to_sheet).toBe(false);
});
it("uses the latest accepted Sheet row when an older historical export has a matching email", async () => {
  await transaction(db => {
    db.outbox[2].status = "sent"; db.outbox[2].completed_at = new Date(Date.now() - 10000).toISOString();
    const latest = enqueue(db, "sheet", "later-export", { sheetId: "current-sheet", sheetName: "Registrations", sourceId: "sub-1", rows: [{ referenceNo: "REG-001", email: "different@example.com" }] }); latest.status = "sent"; latest.completed_at = new Date().toISOString();
  });
  const db = await readDatabase();
  const data = await (await responses(request(`/api/admin/forms/${db.customForms[0].id}/responses`), { params: { id: db.customForms[0].id } })).json();
  expect(data.submissions[0].synced_to_sheet).toBe(false);
});
it("allows fresh corrected exports without releasing the frozen old-address row", async () => {
  await PATCH(request("/api/admin/candidates/email", correction), {});
  await transaction(db => {
    const fresh = queueSheet(db, "current-sheet", "Registrations", { referenceNo: "REG-001", email: correction.email }, "sub-1");
    const other = queueSheet(db, "current-sheet", "Registrations", { referenceNo: "REG-002", email: "other@example.com" });
    expect(fresh.status).toBe("queued"); expect(other.status).toBe("queued");
  });
  expect((await readDatabase()).outbox.find(job => job.key === "old-export")).toMatchObject({ status: "blocked", error_code: "CANDIDATE_EXPORT_CHANGED" });
});
it("rejects .con through the public custom-form API before creating records or messages", async () => {
  await transaction(db => {
    db.customForms[0].fields = [{ id: "contact", systemKey: "email", type: "text", label: "Email", required: true }];
  });
  const db = await readDatabase();
  const response = await submit(request(`/api/forms/${db.customForms[0].slug}`, { data: { contact: "bad@example.con" }, expectedFormVersion: db.customForms[0].updated_at }, "", "POST"), { params: { slug: db.customForms[0].slug } });
  const data = await response.json(); expect(response.status).toBe(400); expect(data.fieldErrors.contact[0]).toContain(".con");
  expect((await readDatabase()).students).toHaveLength(2); expect((await readDatabase()).outbox).toHaveLength(3);
});
it("rejects .con through legacy registration and canonical identity validation too", async () => {
  const response = await registration(request("/api/registrations", { email: "bad@example.con" }, "", "POST"), {});
  expect((await response.json()).fieldErrors.email[0]).toContain(".con");
  await expect(transaction(() => canonicalStudent({ email: "bad@example.con" }))).rejects.toMatchObject({ status: 400, message: expect.stringContaining(".con") });
});

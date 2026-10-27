import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
const send = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/email/smtp-client", () => ({ sendEmail: send }));
import { transaction, readDatabase } from "../../src/lib/data/repository";
import type { DatabaseStore, Registration } from "../../src/lib/data/store";
import { SESSION_COOKIE, signSession } from "../../src/lib/security/session";
import { GET, POST } from "../../src/app/api/admin/reminders/route";
import { POST as notifications } from "../../src/app/api/admin/notifications/route";
import { processOutbox } from "../../src/lib/jobs/outbox";
import { reminderCohorts, reminderDeliveryState } from "../../src/lib/reminders/eligibility";
import { queueReminders, reminderToken } from "../../src/lib/reminders/service";
import { reminderCopy, type ReminderKind } from "../../src/lib/reminders/templates";
let dir: string;
function addStudent(db: DatabaseStore, id: string, campaign = "intake-a") {
    db.students.push({ id, full_name: `Student ${id}`, name_with_initials: id, email: `${id}@example.com`, phone: "0771234567", nic: `NIC-${id}`, nic_last_four: id, gender: "Other", dob: "2000-01-01", address: "Test address", district: "Colombo", province: "Western", created_at: new Date().toISOString() });
    const reg: Registration = { id: `reg-${id}-${campaign}`, reference_no: `REG-${id}`, student_id: id, campaign_id: campaign, terms_accepted: true, terms_version: "1", terms_accepted_at: new Date().toISOString(), source: "test", status: "registered", created_at: new Date().toISOString() };
    db.registrations.push(reg); return reg;
}
function addApplication(db: DatabaseStore, reg: Registration, status: "started" | "submitted" | "withdrawn" | "rejected" = "submitted") {
    db.applications.push({ id: `app-${reg.id}`, application_no: `APP-${reg.id}`, student_id: reg.student_id, campaign_id: reg.campaign_id, registration_id: reg.id, status, submitted_at: new Date().toISOString(), created_at: new Date().toISOString(), statement_of_purpose: "Test", ol_results: { year: "2020", index_no: "", maths: "A", english: "A", science: "A" }, al_results: { stream: "", year: "", index_no: "", summary: "" }, emergency_contact: { name: "", relation: "", phone: "" } });
}
function addBooking(db: DatabaseStore, reg: Registration, id: string, status?: "absent" | "attended" | "late" | "excused", future = false) {
    const time = Date.now() + (future ? 2 : -2) * 86400000;
    db.workshops.push({ id, campaign_id: reg.campaign_id, title: `Workshop ${id}`, description: "", venue: "Test venue", address: "Test address", google_maps_url: "", start_time: new Date(time).toISOString(), end_time: new Date(time + 3600000).toISOString(), reminder_schedule: { days_before: [] }, is_active: true, capacity: 20, created_at: new Date().toISOString() });
    const booking = { id: `booking-${id}-${reg.id}`, student_id: reg.student_id, registration_id: reg.id, workshop_id: id, status: "confirmed" as const, created_at: new Date().toISOString() };
    db.workshopBookings.push(booking);
    if (status) db.attendance.push({ id: `attendance-${id}-${reg.id}`, student_id: reg.student_id, workshop_id: id, status, student_exam_id: "", marked_by: "tester", marked_at: new Date().toISOString(), verification_method: "manual" });
    return booking;
}
function request(body?: unknown, role = "admin", query = "") {
    return new NextRequest(`http://localhost/api/admin/reminders${query}`, { method: body === undefined ? "GET" : "POST", headers: { cookie: `${SESSION_COOKIE}=${signSession({ email: "admin@example.com", name: "Tester", role })}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function preview(kind: ReminderKind = "application_pending") {
    const response = await GET(request(undefined, "admin", `?kind=${kind}`), undefined); expect(response.status).toBe(200); return response.json();
}
function payload(data: any, kind: ReminderKind = "application_pending") {
    return { kind, expiresAt: data.expiresAt, recipients: data.recipients.filter((r: any) => r.canQueue).map((r: any) => ({ id: r.id, token: r.token })), subject: reminderCopy[kind].subject, body: reminderCopy[kind].body };
}
beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tic-reminders-"));
    vi.stubEnv("DATA_DIR", dir); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false"); vi.stubEnv("APP_SECRET", "test-only-reminder-secret-at-least-32-characters");
    send.mockReset(); send.mockResolvedValue({ success: true, provider: "gmail", messageId: "test-message" });
    await transaction(db => { const base = db.campaigns[0]; db.campaigns = [{ ...base, id: "intake-a", title: "Intake A", is_active: true }, { ...base, id: "intake-b", title: "Intake B", is_active: true }]; db.outbox = []; });
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
it("identifies incomplete applications and unbooked applicants in the correct intake", async () => {
    await transaction(db => {
        addStudent(db, "registration"); addApplication(db, addStudent(db, "draft"), "started");
        addApplication(db, addStudent(db, "applicant"));
        const other = addStudent(db, "cross-intake"); addApplication(db, other);
        db.registrations.push({ ...other, id: "other-reg", campaign_id: "intake-b" }); addBooking(db, db.registrations.at(-1)!, "other-workshop", undefined, true);
        addStudent(db, "cancelled").status = "cancelled"; addApplication(db, addStudent(db, "withdrawn"), "withdrawn"); addApplication(db, addStudent(db, "rejected"), "rejected");
    });
    const rows = reminderCohorts(await readDatabase()).candidates;
    expect(rows.filter(r => r.kind === "application_pending").map(r => r.studentId).sort()).toEqual(["cross-intake", "draft", "registration"]);
    expect(rows.filter(r => r.kind === "workshop_unbooked").map(r => r.studentId).sort()).toEqual(["applicant", "cross-intake"]);
});
it("only identifies confirmed absent bookings after the workshop ends", async () => {
    await transaction(db => {
        for (const status of ["absent", "attended", "late", "excused", undefined] as const) { const reg = addStudent(db, status || "unmarked"); addApplication(db, reg); addBooking(db, reg, status || "unmarked", status); }
        const future = addStudent(db, "future"); addApplication(db, future); addBooking(db, future, "future", "absent", true);
        const rebooked = addStudent(db, "rebooked"); addApplication(db, rebooked); addBooking(db, rebooked, "missed", "absent"); addBooking(db, rebooked, "rescheduled", undefined, true);
    });
    const result = reminderCohorts(await readDatabase());
    expect(result.candidates.filter(r => r.kind === "workshop_missed").map(r => r.studentId)).toEqual(["absent"]);
    expect(result.attendanceReview).toBe(1);
});
it("requires an administrator for recipient data and queueing", async () => {
    expect((await GET(new NextRequest("http://localhost/api/admin/reminders"), undefined)).status).toBe(401);
    expect((await GET(request(undefined, "entrance_staff"), undefined)).status).toBe(403);
    expect((await POST(request({}, "examiner"), undefined)).status).toBe(403);
    expect((await readDatabase()).outbox).toHaveLength(0);
});
it("queues only selected previewed recipients and safely skips duplicate clicks", async () => {
    await transaction(db => { addStudent(db, "one"); addStudent(db, "two"); });
    const body = payload(await preview()); body.recipients = body.recipients.slice(0, 1);
    const first = await POST(request(body), undefined); expect(first.status).toBe(200); expect(await first.json()).toMatchObject({ queued: 1, skipped: 0 });
    const second = await POST(request(body), undefined); expect(await second.json()).toMatchObject({ queued: 0, skipped: 1 });
    const db = await readDatabase(); expect(db.outbox).toHaveLength(1); expect(db.outbox[0].payload.to).toBe("one@example.com"); expect(db.auditLogs.some(a => a.action === "REMINDERS_QUEUED")).toBe(true); expect(send).not.toHaveBeenCalled();
});
it("rejects a stale preview if a selected student completes the next step", async () => {
    await transaction(db => { addStudent(db, "one"); addStudent(db, "two"); }); const body = payload(await preview());
    await transaction(db => addApplication(db, db.registrations[1]));
    expect((await POST(request(body), undefined)).status).toBe(409); expect((await readDatabase()).outbox).toHaveLength(0);
});
it("rejects changed email addresses, tampered tokens and expired previews", async () => {
    await transaction(db => { addStudent(db, "one"); }); const body = payload(await preview());
    await transaction(db => { db.students[0].email = "changed@example.com"; });
    expect((await POST(request(body), undefined)).status).toBe(409);
    const current = payload(await preview()); current.recipients[0].token = "0".repeat(64);
    expect((await POST(request(current), undefined)).status).toBe(409);
    const expired = payload(await preview()); expired.expiresAt = Date.now() - 1;
    expect((await POST(request(expired), undefined)).status).toBe(409); expect((await readDatabase()).outbox).toHaveLength(0);
});
it("rejects duplicate selections, cross-group selections and unsafe links", async () => {
    await transaction(db => { addStudent(db, "one"); }); const body = payload(await preview());
    expect((await POST(request({ ...body, recipients: [...body.recipients, ...body.recipients] }), undefined)).status).toBe(400);
    expect((await POST(request({ ...body, kind: "workshop_unbooked" }), undefined)).status).toBe(409);
    expect((await POST(request({ ...body, actionUrl: "javascript:alert(1)" }), undefined)).status).toBe(400);
    expect((await readDatabase()).outbox).toHaveLength(0);
});
it("escapes personalized HTML and rejects unsupported variables or subject headers", async () => {
    await transaction(db => { addStudent(db, "one"); db.students[0].full_name = '<img src=x onerror="alert(1)">'; });
    const body = payload(await preview());
    expect((await POST(request({ ...body, subject: "Test\r\nBcc: other@example.com" }), undefined)).status).toBe(400);
    expect((await POST(request({ ...body, body: "{{password}}" }), undefined)).status).toBe(400);
    expect((await POST(request(body), undefined)).status).toBe(200);
    const html = (await readDatabase()).outbox[0].payload.html; expect(html).toContain("&lt;img"); expect(html).not.toContain("<img");
});
it("holds repeat reminders for 24 hours and keeps failed/uncertain jobs for review", async () => {
    await transaction(db => { addStudent(db, "one"); }); await POST(request(payload(await preview())), undefined);
    await transaction(db => { db.outbox[0].status = "sent"; db.outbox[0].completed_at = new Date().toISOString(); });
    let db = await readDatabase(); const candidate = reminderCohorts(db).candidates[0]; expect(reminderDeliveryState(db, candidate).canQueue).toBe(false);
    const later = Date.now() + 25 * 3600000, expiresAt = later + 60000;
    await transaction(db => { expect(queueReminders(db, { kind: "application_pending", expiresAt, recipients: [{ id: candidate.id, token: reminderToken(candidate, expiresAt) }], ...reminderCopy.application_pending }, later).queued).toBe(1); });
    await transaction(db => { db.outbox[1].status = "uncertain"; }); db = await readDatabase(); expect(reminderDeliveryState(db, candidate, later + 25 * 3600000).canQueue).toBe(false);
});
it("rejects header breaks introduced through a personalized subject", async () => {
    await transaction(db => { addStudent(db, "one"); db.students[0].full_name = "Name\r\nBcc: unrelated@example.com"; });
    expect((await POST(request({ ...payload(await preview()), subject: "Hello {{name}}" }), undefined)).status).toBe(400);
    expect((await readDatabase()).outbox).toHaveLength(0);
});
it("checks eligibility again before dispatch and never releases an obsolete reminder", async () => {
    await transaction(db => { addStudent(db, "one"); }); await POST(request(payload(await preview())), undefined);
    await transaction(db => addApplication(db, db.registrations[0])); await processOutbox();
    let db = await readDatabase(); expect(send).not.toHaveBeenCalled(); expect(db.outbox[0]).toMatchObject({ status: "blocked", error_code: "REMINDER_SUPERSEDED", attempts: 0 });
    await notifications(request({ action: "release_blocked" }), undefined); db = await readDatabase(); expect(db.outbox[0].status).toBe("blocked");
    expect((await notifications(request({ action: "retry", jobId: db.outbox[0].id, confirmProviderChecked: true }), undefined)).status).toBe(409);
});
it("sends an applicable reminder through the existing outbox with provider tracking", async () => {
    await transaction(db => { addStudent(db, "one"); }); await POST(request(payload(await preview())), undefined);
    await processOutbox(); const job = (await readDatabase()).outbox[0]; expect(send).toHaveBeenCalledTimes(1); expect(job).toMatchObject({ status: "sent", provider_id: "test-message" });
});
it("filters intake counts and attendance review consistently", async () => {
    await transaction(db => { addStudent(db, "one"); const other = addStudent(db, "two", "intake-b"); addBooking(db, other, "unmarked"); });
    const result = await GET(request(undefined, "admin", "?campaignId=intake-a"), undefined), data = await result.json();
    expect(data.recipients.map((r: any) => r.email)).toEqual(["one@example.com"]); expect(data.attendanceReview).toBe(0); expect(data.counts.application_pending).toBe(1);
});
it("uses only an active form for the recipient's intake and blocks a reminder if that form closes", async () => {
    await transaction(db => {
        addStudent(db, "one"); addStudent(db, "two", "intake-b");
        const form = db.customForms.find(f => f.type === "application")!; form.campaign_id = "intake-a"; form.is_active = true;
    });
    const data = await preview(); expect(data.recipients.find((r: any) => r.studentId === "one").actionUrl).toContain("/form/"); expect(data.recipients.find((r: any) => r.studentId === "two").actionUrl).toBe("");
    const body = payload(data); body.recipients = body.recipients.slice(0, 1); await POST(request(body), undefined);
    await transaction(db => { db.customForms.find(f => f.type === "application")!.is_active = false; });
    await processOutbox(); expect(send).not.toHaveBeenCalled(); expect((await readDatabase()).outbox[0].error_code).toBe("REMINDER_SUPERSEDED");
});

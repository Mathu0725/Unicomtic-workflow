import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
import { GET, POST } from "../../src/app/api/admin/email/templates/route";
import { GET as reminderSettings } from "../../src/app/api/admin/reminders/route";
import { GET as candidateDirectory } from "../../src/app/api/admin/email/candidates/route";
import { POST as accessRequest } from "../../src/app/api/candidate-access/request/route";
import { transaction, readDatabase } from "../../src/lib/data/repository";
import { canonicalStudent, registrationFor, notifySubmission, bookWorkshop } from "../../src/lib/admissions/service";
import { savedTemplate, renderNotification } from "../../src/lib/email/notification-templates";
import { notificationTemplates, templateProblem } from "../../src/lib/email/template-catalog";
import { secureCandidateEmail, candidateSession } from "../../src/lib/security/candidate-access";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";

let dir: string, cookie: string;
const person = { fullName: "Template Student", email: "student@example.com", nic: "200012345601", phone: "0771234501", district: "Jaffna" };
function req(body?: unknown, credentials = cookie, url = "/api/admin/email/templates") {
  return new NextRequest(`http://localhost:3000${url}`, { method: body ? "POST" : "GET", headers: { ...(credentials ? { cookie: credentials } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const save = (id: string, overrides: Record<string, unknown> = {}) => POST(req({ kind: "system", id, expectedVersion: 0, subject: "Hello {{name}} — {{reference}}", body: "வணக்கம் {{name}}. Reference {{reference}}.", ...overrides }), undefined);
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tic-template-test-"));
  vi.stubEnv("DATA_DIR", dir); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false"); vi.stubEnv("APP_SECRET", "test-only-secret-at-least-32-characters"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  cookie = `${SESSION_COOKIE}=${signSession({ email: "admin@example.com", name: "Admin", role: "super_admin" })}`;
  await transaction(db => { const student = canonicalStudent(person); registrationFor(student); });
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

it("lists every automated template plus each form's applicant and staff templates without exposing integration secrets", async () => {
  const response = await GET(req(), undefined), data = await response.json(), db = await readDatabase();
  expect(response.status).toBe(200);
  expect(data.entries).toHaveLength(notificationTemplates.length + db.customForms.length * 2);
  expect(data.entries.some((entry: any) => entry.id === "candidate_access")).toBe(true);
  expect(data.entries.filter((entry: any) => entry.kind === "form").every((entry: any) => entry.expectedUpdatedAt)).toBe(true);
  expect(JSON.stringify(data)).not.toContain("refresh_token");
});
it("restricts template reads and writes to admissions administrators", async () => {
  expect((await GET(req(undefined, ""), undefined)).status).toBe(401);
  const staff = `${SESSION_COOKIE}=${signSession({ email: "staff@example.com", name: "Desk", role: "entrance_staff" })}`;
  expect((await GET(req(undefined, staff), undefined)).status).toBe(403);
  expect((await POST(req({ kind: "system", id: "registration_confirmation", expectedVersion: 0, subject: "Hello", body: "Hello" }, staff), undefined)).status).toBe(403);
  expect((await readDatabase()).emailTemplates).toEqual({});
});
it("saves Tamil templates durably, records an audit and does not send or enqueue mail", async () => {
  expect((await save("registration_confirmation")).status).toBe(200);
  const db = await readDatabase();
  expect(db.emailTemplates.registration_confirmation).toMatchObject({ version: 1, updated_by: "admin@example.com", body: "வணக்கம் {{name}}. Reference {{reference}}." });
  expect(db.auditLogs.at(-1)?.action).toBe("EMAIL_TEMPLATE_UPDATED");
  expect(db.outbox).toHaveLength(0);
});
it("rejects stale saves and does not overwrite another administrator's content", async () => {
  expect((await save("registration_confirmation")).status).toBe(200);
  expect((await save("registration_confirmation", { subject: "Stale edit" })).status).toBe(409);
  expect((await readDatabase()).emailTemplates.registration_confirmation?.subject).toBe("Hello {{name}} — {{reference}}");
});
it.each([
  { subject: "Line one\r\nBcc: someone@example.com" },
  { body: "Unknown {{password}}" }, { body: "Malformed {{name" },
  { actionLabel: "{{name}}" }, { body: "" },
])("rejects unsafe or invalid template fields %j", async edit => {
  expect((await save("registration_confirmation", edit)).status).toBe(400);
  expect((await readDatabase()).emailTemplates).toEqual({});
});
it("uses the saved confirmation for new receipts while keeping queued content immutable", async () => {
  await save("registration_confirmation");
  await transaction(db => notifySubmission(db.students[0], db.registrations[0]));
  let db = await readDatabase(), original = db.outbox[0].payload.html;
  expect(db.outbox[0].payload.subject).toContain("Hello Template Student");
  expect(original).toContain("வணக்கம் Template Student");
  expect(original).toContain("Track your admission progress");
  expect((await save("registration_confirmation", { expectedVersion: 1, subject: "Changed", body: "Updated message" })).status).toBe(200);
  db = await readDatabase(); expect(db.outbox[0].payload.html).toBe(original);
});
it("applies per-form applicant and staff templates, including the formerly ignored staff subject", async () => {
  const initial = await readDatabase(), form = initial.customForms[0];
  const base = { kind: "form", id: form.id, audience: "applicant", expectedUpdatedAt: form.updated_at, subject: "Form confirmation {{reference_no}}", body: "Dear {{fullName}}, saved your form." };
  expect((await POST(req(base), undefined)).status).toBe(200);
  expect((await POST(req({ ...base, body: "Stale" }), undefined)).status).toBe(409);
  const updated = (await readDatabase()).customForms[0];
  expect((await POST(req({ ...base, audience: "admin", expectedUpdatedAt: updated.updated_at, subject: "Staff alert {{fullName}}", body: "{{email}} submitted. Count {{registrationCount}}." }), undefined)).status).toBe(200);
  await transaction(db => {
    db.integrations.admin_notification_email = "staff@example.com";
    db.customForms[0].email_automation.enabled = true; db.customForms[0].email_automation.send_applicant_email = true; db.customForms[0].email_automation.send_admin_notification = true;
    notifySubmission(db.students[0], db.registrations[0], undefined, undefined, db.customForms[0]);
  });
  const jobs = (await readDatabase()).outbox.filter(job => job.type === "email");
  expect(jobs[0].payload.subject).toMatch(/^Form confirmation REG-/);
  expect(jobs[1].payload.subject).toBe("Staff alert Template Student");
  expect(jobs[1].payload.html).toContain("Count 1");
});
it("escapes personalized values and template markup and preserves replacement dollar signs", async () => {
  await save("workshop_booking", { subject: "Seat {{name}}", body: "<script>alert(1)</script> {{name}} {{workshop}}" });
  await transaction(db => {
    const student = db.students[0]; student.full_name = '<img src=x onerror="alert(1)"> $&';
    db.workshops.push({ id: "workshop-test", campaign_id: db.registrations[0].campaign_id, title: "Web & Cloud", start_time: new Date(Date.now()+86400000).toISOString(), end_time: new Date(Date.now()+90000000).toISOString(), venue: "Centre", address: "Jaffna", capacity: 10, reminder_schedule: {days_before:[1]}, is_active:true } as any);
    bookWorkshop("workshop-test", student, db.registrations[0]);
  });
  const job = (await readDatabase()).outbox[0];
  expect(job.payload.html).not.toContain("<script>"); expect(job.payload.html).not.toContain("<img");
  expect(job.payload.html).toContain("&lt;script&gt;"); expect(job.payload.html).toContain("$&"); expect(job.payload.html).toContain("Web &amp; Cloud");
});
it("uses a saved access-link template snapshot and always adds a fresh secure link and expiry", async () => {
  await save("candidate_access", { subject: "Your link {{reference}}", body: "வணக்கம் {{name}}", actionLabel: "Open my portal" });
  const first = await readDatabase(), registration = first.registrations[0];
  expect((await accessRequest(req({ reference: registration.reference_no, email: person.email, purpose: "apply" }, "", "/api/candidate-access/request"), undefined)).status).toBe(200);
  await save("candidate_access", { expectedVersion: 1, subject: "New message", body: "New content" });
  const db = await readDatabase(), payload = db.outbox[0].payload;
  expect(payload.html).not.toContain("#token=");
  const rendered = secureCandidateEmail(db, payload);
  expect(rendered.subject).toBe(`Your link ${registration.reference_no}`);
  expect(rendered.html).toContain("வணக்கம் Template Student"); expect(rendered.html).toContain("Open my portal"); expect(rendered.html).toContain("30 minutes");
  const link = rendered.html.match(/href="([^"]+)"/)![1];
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token")!;
  expect(candidateSession(db, token).registration.id).toBe(registration.id);
});
it("loads saved starting messages into both reminder and candidate composers", async () => {
  await save("application_pending", { subject: "Reminder {{name}}", body: "Please complete your application {{reference}}." });
  await save("candidate_message", { subject: "Message {{name}}", body: "Hello {{name}}." });
  const reminders = await (await reminderSettings(req(undefined,cookie,"/api/admin/reminders"),undefined)).json();
  const candidates = await (await candidateDirectory(req(undefined,cookie,"/api/admin/email/candidates"),undefined)).json();
  expect(reminders.templates.application_pending.subject).toBe("Reminder {{name}}");
  expect(candidates.messageTemplate.subject).toBe("Message {{name}}");
});
it("hydrates existing snapshots without templates and retains all original records", async () => {
  const file = path.join(dir,"platform.json"), before = JSON.parse(await readFile(file,"utf8"));
  delete before.data.emailTemplates; await writeFile(file,JSON.stringify(before));
  const db = await readDatabase(); expect(db.students).toHaveLength(1); expect(db.emailTemplates).toEqual({});
  expect(savedTemplate(db,"workshop_reminder").subject).toBe("Workshop reminder — {{workshop}}");
});
it("has valid defaults for every notification and never interprets replacement text as template syntax", async () => {
  const db = await readDatabase();
  for (const definition of notificationTemplates) expect(templateProblem(definition,definition.variables)).toBe("");
  const rendered = renderNotification(db,"workshop_booking",{name:"$& {{workshop}}",workshop:"Safe workshop",date:"Tomorrow",venue:"Centre",address:"Road",reference:"REG-TEST"});
  expect(rendered.html).toContain("$&amp; {{workshop}}");
});

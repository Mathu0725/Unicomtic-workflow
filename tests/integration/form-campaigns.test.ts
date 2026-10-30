import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET, POST } from "../../src/app/api/admin/email/form-campaigns/route";
import { POST as preview } from "../../src/app/api/admin/email/form-campaigns/preview/route";
import { GET as templates, POST as saveTemplate } from "../../src/app/api/admin/email/reusable-templates/route";
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { canonicalStudent, registrationFor } from "../../src/lib/admissions/service";
import { SESSION_COOKIE, signSession } from "../../src/lib/security/session";

let directory: string, cookie: string, formId: string, responseIds: string[];
const request = (url: string, body?: object, key?: string, credentials = cookie) => new NextRequest(`http://localhost:3000${url}`, {
  method: body ? "POST" : "GET",
  headers: { ...(credentials ? { cookie: credentials } : {}), ...(body ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-form-campaign-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv("APP_SECRET", "form-campaign-test-secret-at-least-32-characters");
  vi.stubEnv("SMTP_USER", "test-sender@example.com");
  cookie = `${SESSION_COOKIE}=${signSession({ email: "admin@example.com", name: "Admin", role: "super_admin" })}`;
  responseIds = [];
  await transaction(db => {
    db.integrations.email_provider = "smtp";
    db.integrations.default_email_account_id = "legacy-smtp";
    const form = db.customForms[0];
    formId = form.id;
    form.fields.push({ id: "greeting", type: "text", label: "Greeting", required: false });
    form.email_automation.applicant_template = "form";
    form.email_automation.applicant_subject = "Hello {{fullName}}";
    form.email_automation.applicant_body_html = "<p>{{greeting}} for {{reference}}</p>";
    for (const number of [1, 2]) {
      const student = canonicalStudent({ fullName: `Student ${number}`, email: `student${number}@example.com`, nic: `2000123456${String(number).padStart(2, "0")}`, phone: `07712345${String(number).padStart(2, "0")}`, district: "Jaffna" });
      const reg = registrationFor(student);
      const id = crypto.randomUUID();
      responseIds.push(id);
      db.formSubmissions.push({ id, form_id: form.id, reference_no: reg.reference_no, data: { greeting: `Welcome ${number}` }, student_id: student.id, registration_id: reg.id, synced_to_sheet: false, email_sent: false, created_at: new Date(Date.now() + number).toISOString() });
    }
  });
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
const input = () => ({ formId, filter: "all", selectionMode: "all", selectedIds: [] as string[], templateId: "form_applicant", accountId: "", scheduledAt: null });

it("lists form response counts and previews each recipient's actual answers", async () => {
  const list = await GET(request(`/api/admin/email/form-campaigns?formId=${formId}`), undefined);
  expect(list.status).toBe(200);
  const listed = await list.json();
  expect(listed.totalResponses).toBe(2);
  expect(listed.matchingResponses).toBe(2);
  expect(listed.rows).toHaveLength(2);
  const result = await preview(request("/api/admin/email/form-campaigns/preview", input()), undefined);
  expect(result.status).toBe(200);
  const data = await result.json();
  expect(data.recipientCount).toBe(2);
  expect(data.preview.map((item: any) => item.subject)).toContain("Hello Student 1");
  expect(data.preview.map((item: any) => item.text).join(" ")).toContain("Welcome 2");
  expect((await readDatabase()).outbox).toHaveLength(0);
});

it("queues a reviewed batch once with response identity and immutable personalized content", async () => {
  const key = crypto.randomUUID();
  const body = { ...input(), expectedRecipientCount: 2, clientAttemptId: key };
  const first = await POST(request("/api/admin/email/form-campaigns", body, key), undefined);
  expect(first.status).toBe(200);
  const repeat = await POST(request("/api/admin/email/form-campaigns", body, key), undefined);
  expect(repeat.status).toBe(200);
  const db = await readDatabase();
  expect(db.outbox).toHaveLength(2);
  expect(new Set(db.outbox.map(job => job.payload.sourceId))).toEqual(new Set(responseIds));
  expect(db.outbox.every(job => job.payload.notificationEvent === "form_campaign" && job.payload.templateId === `form:${formId}:applicant`)).toBe(true);
  expect(db.outbox.map(job => job.payload.html).join(" ")).toContain("Welcome 1");
  expect(db.auditLogs.filter(item => item.action === "FORM_CAMPAIGN_QUEUED")).toHaveLength(1);
  const progress = await GET(request(`/api/admin/email/form-campaigns?batchId=${(await first.json()).batchId}`), undefined);
  const activity = await progress.json();
  expect(activity.progress).toMatchObject({ total: 2, queued: 2, sent: 0 });
  expect(activity.deliveries).toHaveLength(2);
  expect(activity.recent[0].formId).toBe(formId);
  const filtered = await GET(request(`/api/admin/email/form-campaigns?formId=${formId}&filter=not_contacted`), undefined);
  expect((await filtered.json()).matchingResponses).toBe(0);
});

it("blocks missing answers and changed recipient counts before queueing", async () => {
  await transaction(db => { db.formSubmissions.find(item => item.id === responseIds[0])!.data.greeting = ""; });
  const previewResponse = await preview(request("/api/admin/email/form-campaigns/preview", input()), undefined);
  expect(previewResponse.status).toBe(400);
  expect((await previewResponse.json()).message).toContain("greeting");
  expect((await readDatabase()).outbox).toHaveLength(0);
  const key = crypto.randomUUID();
  const send = await POST(request("/api/admin/email/form-campaigns", { ...input(), selectionMode: "selected", selectedIds: [responseIds[1]], expectedRecipientCount: 2, clientAttemptId: key }, key), undefined);
  expect(send.status).toBe(409);
  expect((await readDatabase()).outbox).toHaveLength(0);
});

it("never treats an empty individual selection as send to everyone and keeps scheduled jobs deferred", async () => {
  const emptySelection = await preview(request("/api/admin/email/form-campaigns/preview", { ...input(), selectionMode: "selected" }), undefined);
  expect(emptySelection.status).toBe(400);
  const key = crypto.randomUUID(), scheduledAt = new Date(Date.now() + 3600000).toISOString();
  const queued = await POST(request("/api/admin/email/form-campaigns", { ...input(), selectionMode: "selected", selectedIds: [responseIds[0]], scheduledAt, expectedRecipientCount: 1, clientAttemptId: key }, key), undefined);
  expect(queued.status).toBe(200);
  const db = await readDatabase();
  expect(db.outbox).toHaveLength(1);
  expect(db.outbox[0].status).toBe("queued");
  expect(db.outbox[0].next_attempt_at).toBe(scheduledAt);
  expect(db.outbox[0].payload.scheduledFor).toBe(scheduledAt);
});

it("requires an administrator and a matching retry key", async () => {
  expect((await GET(request("/api/admin/email/form-campaigns", undefined, undefined, ""), undefined)).status).toBe(401);
  const key = crypto.randomUUID();
  expect((await POST(request("/api/admin/email/form-campaigns", { ...input(), expectedRecipientCount: 2, clientAttemptId: key }, crypto.randomUUID()), undefined)).status).toBe(400);
  expect((await readDatabase()).outbox).toHaveLength(0);
});

it("creates and versions a reusable HTML template, uses it in campaign preview, and prevents archived use", async () => {
  const create = await saveTemplate(request("/api/admin/email/reusable-templates", { action: "create", title: "Workshop invitation", formId, subject: "Hi {{name}}", bodyHtml: "<script>alert(1)</script><p>{{greeting}} for {{reference}}</p>" }), undefined);
  expect(create.status).toBe(200);
  const id = (await create.json()).id;
  const listed = await templates(request("/api/admin/email/reusable-templates"), undefined);
  expect((await listed.json()).templates[0].body_html).not.toContain("<script>");
  const reviewed = await preview(request("/api/admin/email/form-campaigns/preview", { ...input(), templateId: `custom:${id}` }), undefined);
  expect(reviewed.status).toBe(200);
  expect((await reviewed.json()).preview[0].text).toContain("Welcome");
  const changed = await saveTemplate(request("/api/admin/email/reusable-templates", { action: "update", id, expectedVersion: 1, title: "Workshop invitation", formId, subject: "Hello {{name}}", bodyHtml: "<p>{{greeting}}</p>" }), undefined);
  expect(changed.status).toBe(200);
  expect((await saveTemplate(request("/api/admin/email/reusable-templates", { action: "archive", id, expectedVersion: 1 }), undefined)).status).toBe(409);
  const copy = await saveTemplate(request("/api/admin/email/reusable-templates", { action: "duplicate", id }), undefined);
  expect(copy.status).toBe(200);
  expect((await saveTemplate(request("/api/admin/email/reusable-templates", { action: "archive", id, expectedVersion: 2 }), undefined)).status).toBe(200);
  const blocked = await preview(request("/api/admin/email/form-campaigns/preview", { ...input(), templateId: `custom:${id}` }), undefined);
  expect(blocked.status).toBe(409);
  expect((await readDatabase()).customEmailTemplates.find(item => item.id === id)?.revisions).toHaveLength(3);
  const globalInvalid = await saveTemplate(request("/api/admin/email/reusable-templates", { action: "create", title: "Not valid globally", formId: "", subject: "Hello", bodyHtml: "<p>{{greeting}}</p>" }), undefined);
  expect(globalInvalid.status).toBe(400);
});

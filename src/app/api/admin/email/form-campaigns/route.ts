import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { getSession } from "@/lib/security/session";
import { emailAccountOptions, defaultEmailAccountId } from "@/lib/email/accounts";
import { manualTemplateIds } from "@/lib/email/manual";
import { savedTemplate } from "@/lib/email/notification-templates";
import { templateDefinition } from "@/lib/email/template-catalog";
import { formCampaignRows, formCampaignSchema, queueFormCampaign } from "@/lib/email/form-campaigns";

export const dynamic = "force-dynamic";

export const GET = route(async req => {
  const db = getDb();
  const formId = req.nextUrl.searchParams.get("formId") || "";
  const batchId = req.nextUrl.searchParams.get("batchId") || "";
  const forms = db.customForms.map(form => ({ id: form.id, title: form.title, type: form.type, total: db.formSubmissions.filter(item => item.form_id === form.id).length }));
  const jobs = batchId ? db.outbox.filter(item => item.payload.formCampaignId === batchId && item.type === "email") : [];
  const summary = (items: typeof db.outbox) => ({ total: items.length, queued: items.filter(item => item.status === "queued").length, processing: items.filter(item => item.status === "sending").length, sent: items.filter(item => item.status === "sent").length, failed: items.filter(item => ["failed", "blocked", "uncertain"].includes(item.status)).length });
  const batches = new Map<string, typeof db.outbox>();
  for (const job of db.outbox) {
    if (job.type !== "email" || !job.payload.formCampaignId) continue;
    const id = String(job.payload.formCampaignId);
    if (!batches.has(id)) batches.set(id, []);
    batches.get(id)!.push(job);
  }
  const recent = [...batches].map(([id, items]) => ({ id, formId: items[0].payload.formId, formTitle: db.customForms.find(form => form.id === items[0].payload.formId)?.title || "Archived form", templateId: items[0].payload.templateId, createdAt: items[0].created_at, ...summary(items) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  const progress = batchId ? summary(jobs) : null;
  const deliveries = batchId ? jobs.slice(0, 500).map(job => ({ id: job.id, sourceId: job.payload.sourceId, to: job.payload.to, reference: job.payload.reference, status: job.status, createdAt: job.created_at, completedAt: job.completed_at, error: job.error, errorCode: job.error_code, attempts: job.attempts, provider: job.provider, providerId: job.provider_id })) : [];
  if (!formId) return NextResponse.json({ success: true, forms, accounts: emailAccountOptions(db), defaultAccountId: defaultEmailAccountId(db), recent, progress, deliveries, moreDeliveries: jobs.length > deliveries.length });
  const filter = req.nextUrl.searchParams.get("filter");
  if (filter && !["all", "not_contacted", "failed"].includes(filter)) throw new RequestError("Choose a valid recipient filter.");
  const { form, responses, eligible } = formCampaignRows(db, formId, (filter || "all") as "all" | "not_contacted" | "failed");
  const page = Math.max(1, Math.min(100000, Number(req.nextUrl.searchParams.get("page")) || 1));
  const rows = eligible.slice((page - 1) * 50, page * 50).map(response => {
    const student = db.students.find(item => item.id === response.student_id);
    return { id: response.id, reference: response.reference_no, name: student?.full_name || String(response.data.fullName || ""), email: student?.email || String(response.data.email || ""), createdAt: response.created_at };
  });
  return NextResponse.json({ success: true, forms, form: { id: form.id, title: form.title, type: form.type }, totalResponses: responses.length, matchingResponses: eligible.length, rows, page, pageSize: 50,
    templates: [{ id: "form_applicant", title: `${form.title} — applicant template`, subject: form.email_automation.applicant_subject }, ...manualTemplateIds.map(id => ({ id, title: templateDefinition(id).title, subject: savedTemplate(db, id).subject })), ...db.customEmailTemplates.filter(item => item.is_active && (!item.form_id || item.form_id === form.id)).map(item => ({ id: `custom:${item.id}`, title: item.title, subject: item.subject }))],
    accounts: emailAccountOptions(db), defaultAccountId: defaultEmailAccountId(db),
    variables: ["name", "email", "reference", "formTitle", "intake", "district", "phone", "registration_id", "application_id", "course_name", "workshop", "workshop_date", ...form.fields.filter(field => !["document", "file", "terms", "section"].includes(field.type)).map(field => field.id)],
    recent, progress, deliveries, moreDeliveries: jobs.length > deliveries.length,
  });
}, true);

export const POST = route(async req => {
  const parsed = formCampaignSchema.safeParse(await req.json());
  if (!parsed.success) throw new RequestError("Select a form, recipients, template and sender. Preview before sending.");
  const key = req.headers.get("idempotency-key");
  if (!key || key !== parsed.data.clientAttemptId) throw new RequestError("A matching send retry key is required.");
  const { batchId, jobs } = queueFormCampaign(getDb(), parsed.data, getSession(req)!.email);
  return NextResponse.json({ success: true, batchId, recipientCount: jobs.length, message: `${jobs.length} email${jobs.length === 1 ? "" : "s"} saved to the delivery queue.` });
}, true, { submission: true, authorize: req => getSession(req)!.email });

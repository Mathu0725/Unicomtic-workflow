import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { getSession } from "@/lib/security/session";
import { notificationTemplateIds, notificationTemplates, htmlEmailText, plainEmailHtml, templateContentLimits, templateProblem, type NotificationTemplateId } from "@/lib/email/template-catalog";
import { savedTemplate } from "@/lib/email/notification-templates";

export const dynamic = "force-dynamic";
const formVariables = ["name", "fullName", "student_name", "email", "reference", "reference_no", "intake", "institution", "title", "formTitle", "district", "submission_date", "submissionType", "registrationCount", "applicationCount"];
const content = { subject: z.string().trim().min(1).max(250), body: z.string().trim().min(1).max(12000), actionLabel: z.string().trim().max(100).optional() };
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("system"), id: z.enum(notificationTemplateIds), expectedVersion: z.number().int().min(0), ...content }).strict(),
  z.object({ kind: z.literal("form"), id: z.string().max(128), audience: z.enum(["applicant", "admin"]), expectedUpdatedAt: z.string().max(100), ...content }).strict(),
]);

export const GET = route(async () => {
  const db = getDb();
  const entries = notificationTemplates.map(definition => ({ ...definition, ...savedTemplate(db, definition.id), key: `system:${definition.id}`, kind: "system", limits: templateContentLimits(definition.id), defaults: { subject: definition.subject, body: definition.body, actionLabel: definition.actionLabel }, updatedAt: db.emailTemplates[definition.id]?.updated_at || null }));
  const forms = db.customForms.flatMap(form => (["applicant", "admin"] as const).map(audience => {
    const defaults = savedTemplate(db, audience === "admin" ? "admin_submission" : form.type === "application" ? "application_confirmation" : form.type === "registration" ? "registration_confirmation" : "form_confirmation");
    const automation = form.email_automation;
    const html = audience === "admin" ? automation.admin_body_html : automation.applicant_body_html;
    return { key: `form:${form.id}:${audience}`, kind: "form", id: form.id, audience, title: `${form.title} — ${audience === "admin" ? "staff alert" : "confirmation"}`, group: "Form templates", description: audience === "admin" ? "Staff notification for this form. Recipients and sending switches are managed in Builder." : "Applicant confirmation for this form. Sending switches are managed in Builder.", subject: (audience === "admin" ? automation.admin_subject : automation.applicant_subject) || defaults.subject, body: html ? htmlEmailText(html) : defaults.body, variables: [...new Set([...formVariables, ...form.fields.map(field => field.id)])], defaults, expectedUpdatedAt: form.updated_at, active: automation.enabled && (audience === "admin" ? automation.send_admin_notification : automation.send_applicant_email), legacyFormatting: Boolean(html && /<[^>]+>/.test(html)), linkNotice: audience === "applicant" ? "Tracking and invited-application links are added automatically. Existing HTML formatting is converted to plain text only when you save here." : "Existing HTML formatting is converted to plain text only when you save here.", builderUrl: `/admin/forms/${form.id}/builder` };
  }));
  return NextResponse.json({ success: true, entries: [...entries, ...forms] });
}, true);

export const POST = route(async req => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) throw new RequestError("Choose a template and enter a subject and message within the limits shown.");
  const input = parsed.data, db = getDb(), updatedBy = getSession(req)!.email;
  if (input.kind === "system") {
    const definition = notificationTemplates.find(template => template.id === input.id)!;
    const problem = templateProblem(input, definition.variables, templateContentLimits(input.id));
    if (problem) throw new RequestError(problem);
    if (input.actionLabel !== undefined && definition.actionLabel === undefined) throw new RequestError("This template does not have an automatic link label.");
    if ((db.emailTemplates[input.id]?.version || 0) !== input.expectedVersion) throw new RequestError("Another administrator changed this template. Reload templates and review before saving again.", 409, { code: "VERSION_CONFLICT" });
    db.emailTemplates[input.id as NotificationTemplateId] = { subject: input.subject, body: input.body, ...(definition.actionLabel !== undefined ? { actionLabel: input.actionLabel || definition.actionLabel } : {}), version: input.expectedVersion + 1, updated_at: new Date().toISOString(), updated_by: updatedBy };
  } else {
    const form = db.customForms.find(form => form.id === input.id);
    if (!form) throw new RequestError("Form not found.", 404);
    const problem = templateProblem(input, [...formVariables, ...form.fields.map(field => field.id)]);
    if (problem) throw new RequestError(problem);
    if (form.updated_at !== input.expectedUpdatedAt) throw new RequestError("This form changed. Reload templates and review before saving again.", 409, { code: "VERSION_CONFLICT" });
    if (input.audience === "applicant") {
      form.email_automation.applicant_subject = input.subject;
      form.email_automation.applicant_body_html = plainEmailHtml(input.body);
    } else {
      form.email_automation.admin_subject = input.subject;
      form.email_automation.admin_body_html = plainEmailHtml(input.body);
    }
    form.updated_at = new Date(Math.max(Date.now(), Date.parse(form.updated_at) + 1 || 0)).toISOString();
  }
  db.auditLogs.push({ id: crypto.randomUUID(), action: "EMAIL_TEMPLATE_UPDATED", entity_name: "email_templates", entity_id: `${input.kind}:${input.id}${input.kind === "form" ? `:${input.audience}` : ""}`, user_email: updatedBy, changes: { ...(input.kind === "system" ? { version: input.expectedVersion + 1 } : { audience: input.audience }) }, created_at: new Date().toISOString() });
  return NextResponse.json({ success: true, message: "Template saved. New messages will use this content; already queued messages keep their saved content." });
}, true, { bodyLimit: 65536 });

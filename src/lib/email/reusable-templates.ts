import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CustomEmailTemplate, DatabaseStore } from "../data/store";
import { RequestError } from "../http";
import { htmlEmailText, templateProblem } from "./template-catalog";
import { sanitizeEmailHtml } from "./sanitize";
import { workshopTemplateVariables } from "../workshops/confirmation";

const content = { title: z.string().trim().min(1).max(120), formId: z.string().max(128).default(""), purpose: z.enum(["general", "workshop"]).optional(), actionLabel: z.string().trim().max(80).optional(), subject: z.string().trim().min(1).max(250), bodyHtml: z.string().trim().min(1).max(12000) };
export const reusableTemplateAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...content }).strict(),
  z.object({ action: z.literal("update"), id: z.string().uuid(), expectedVersion: z.number().int().min(1), ...content }).strict(),
  z.object({ action: z.literal("duplicate"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("archive"), id: z.string().uuid(), expectedVersion: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("restore"), id: z.string().uuid(), expectedVersion: z.number().int().min(1) }).strict(),
]);
export type ReusableTemplateAction = z.infer<typeof reusableTemplateAction>;

const commonVariables = ["name", "fullName", "student_name", "email", "reference", "reference_no", "registration_id", "application_id", "intake", "institution", "title", "formTitle", "form_name", "district", "phone", "submission_date", "course_name", "workshop", "workshop_date"];
export function templateAllowedVariables(db: DatabaseStore, formId?: string) {
  const form = formId ? db.customForms.find(item => item.id === formId) : undefined;
  if (formId && !form) throw new RequestError("Select an existing form.");
  return [...new Set([...commonVariables, ...(form?.fields || []).filter(field => !["document", "file", "terms", "section"].includes(field.type)).map(field => field.id)])];
}
function checkedContent(db: DatabaseStore, input: { formId: string; subject: string; bodyHtml: string; purpose?: string }) {
  if (input.purpose === "workshop" && input.formId) throw new RequestError("Workshop templates are shared by selected workshops. Clear the form restriction.");
  const html = sanitizeEmailHtml(input.bodyHtml);
  const problem = templateProblem({ subject: input.subject, body: html }, input.purpose === "workshop" ? workshopTemplateVariables : templateAllowedVariables(db, input.formId));
  if (problem) throw new RequestError(problem);
  if (!htmlEmailText(html).trim()) throw new RequestError("Enter visible email message content.");
  return html;
}
export function changeReusableTemplate(db: DatabaseStore, input: ReusableTemplateAction, actor: string) {
  const existing = "id" in input ? db.customEmailTemplates.find(item => item.id === input.id) : undefined;
  if ("id" in input && !existing) throw new RequestError("Template not found.", 404);
  if ("expectedVersion" in input && existing!.version !== input.expectedVersion) throw new RequestError("This template changed. Reload it before saving.", 409);
  const now = new Date().toISOString();
  let template: CustomEmailTemplate;
  if (input.action === "create" || input.action === "duplicate") {
    const source = input.action === "duplicate" ? existing! : undefined;
    const formId = input.action === "create" ? input.formId : source?.form_id || "";
    const subject = input.action === "create" ? input.subject : source!.subject;
    const bodyHtml = input.action === "create" ? input.bodyHtml : source!.body_html;
    const purpose = input.action === "create" ? input.purpose : source?.purpose || "general";
    const actionLabel = input.action === "create" ? input.actionLabel : source?.action_label || "Open in Google Maps";
    const html = checkedContent(db, { formId, subject, bodyHtml, purpose });
    template = { id: randomUUID(), title: input.action === "create" ? input.title : `${source!.title} copy`.slice(0, 120), form_id: formId || undefined, subject, body_html: html, is_active: true, version: 1, created_at: now, updated_at: now, updated_by: actor, revisions: [{ version: 1, subject, body_html: html, updated_at: now, updated_by: actor }] };
    template.purpose = purpose;
    template.action_label = actionLabel;
    db.customEmailTemplates.push(template);
  } else {
    template = existing!;
    if (input.action === "update") {
      if (!template.is_active) throw new RequestError("Restore this template before editing it.", 409);
      const html = checkedContent(db, input);
      template.title = input.title;
      template.form_id = input.formId || undefined;
      template.subject = input.subject;
      template.body_html = html;
      template.purpose = input.purpose;
      template.action_label = input.actionLabel;
    } else if (input.action === "archive") {
      if (template.is_active) { template.is_active = false; template.archived_at = now; }
    } else {
      template.is_active = true;
      template.archived_at = undefined;
    }
    template.version++;
    template.updated_at = now;
    template.updated_by = actor;
    template.revisions ||= [];
    template.revisions.push({ version: template.version, subject: template.subject, body_html: template.body_html, updated_at: now, updated_by: actor });
  }
  db.auditLogs.push({ id: randomUUID(), user_email: actor, action: `EMAIL_TEMPLATE_${input.action.toUpperCase()}`, entity_name: "custom_email_template", entity_id: template.id, changes: { version: template.version, formId: template.form_id, active: template.is_active }, created_at: now });
  return template;
}

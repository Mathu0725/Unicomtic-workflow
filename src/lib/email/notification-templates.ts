import { emailWorkflowValues } from "./workflow-settings";
import type { DatabaseStore, Registration, Student } from "../data/store";
import { escapeEmailHtml, personalizeTemplate, plainEmailHtml, templateDefinition, type EmailTemplateContent, type NotificationTemplateId } from "./template-catalog";

export function savedTemplate(db: DatabaseStore, id: NotificationTemplateId): EmailTemplateContent & { version: number } {
  const defaults = templateDefinition(id), saved = db.emailTemplates?.[id];
  return { attachments: saved?.attachments || [], subject: saved?.subject ?? defaults.subject, body: saved?.body ?? defaults.body, actionLabel: saved?.actionLabel ?? defaults.actionLabel, version: saved?.version ?? 0 };
}
export function admissionEmailVariables(db: DatabaseStore, student: Student, registration?: Registration) {
  return { ...emailWorkflowValues(db.settings), utNumber: student.ut_number || registration?.reference_no || "Applicant", name: student.full_name, email: student.email, reference: registration?.reference_no || "", intake: db.campaigns.find(c => c.id === registration?.campaign_id)?.title || "Unicom TIC", institution: db.settings.institutionName || "Unicom TIC" };
}
export function renderNotification(db: DatabaseStore, id: NotificationTemplateId, values: Record<string, unknown>, actionUrl?: string, snapshot?: EmailTemplateContent & { version?: number }) {
  const content = snapshot || savedTemplate(db, id);
  const student = db.students.find(student => student.email.toLowerCase() === String(values.email || "").toLowerCase());
  values = { ...emailWorkflowValues(db.settings), utNumber: student?.ut_number || values.reference || "Applicant", ...values };
  const subject = personalizeTemplate(content.subject, values).replace(/[\r\n]+/g, " ").slice(0, 998);
  const body = personalizeTemplate(content.body, values);
  let html = plainEmailHtml(body), text = body;
  if (actionUrl) {
    const url = new URL(actionUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid notification link.");
    const label = content.actionLabel || templateDefinition(id).actionLabel || "Continue";
    html += `<p><a href="${escapeEmailHtml(url.href)}">${escapeEmailHtml(label)}</a></p>`;
    text += `\n\n${label}: ${url.href}`;
  }
  return { subject, html, text, attachments: content.attachments || [], templateId: id, templateVersion: content.version || 0 };
}

import type { DatabaseStore, Workshop } from "../data/store";
import { RequestError } from "../http";
import { renderNotification, savedTemplate } from "../email/notification-templates";
import { escapeEmailHtml, htmlEmailText, templateProblem, templateVariables } from "../email/template-catalog";
import { renderEmailTemplate } from "../email/template-engine";
import { sanitizeEmailHtml } from "../email/sanitize";
import { workshopTemplateVariables, workshopValues } from "./confirmation";

export function workshopTemplate(db: DatabaseStore, id: string) {
  const template = db.customEmailTemplates.find(t => `custom:${t.id}` === id);
  if (!template || !template.is_active || template.purpose !== "workshop" || template.form_id)
    throw new RequestError("Choose an active workshop email template.");
  return template;
}

export function renderWorkshopEmail(
  db: DatabaseStore, workshop: Workshop, templateId: string,
  identity: Record<string, string | number>, days?: number,
) {
  const values = { ...identity, ...workshopValues(workshop), daysBefore: days || "" };
  if (!templateId.startsWith("custom:")) {
    if (!["workshop_booking", "workshop_reminder", "workshop_update"].includes(templateId))
      throw new RequestError("Choose a workshop email template.");
    const id = templateId as "workshop_booking" | "workshop_reminder" | "workshop_update";
    const content = savedTemplate(db, id);
    const problem = templateProblem(content, workshopTemplateVariables);
    const missing = templateVariables(`${content.subject} ${content.body}`).filter(key => !String(values[key as keyof typeof values] ?? "").trim());
    if (problem || missing.length) throw new RequestError(problem || `Missing values: ${missing.join(", ")}.`);
    return renderNotification(db, id, values, workshop.google_maps_url || undefined);
  }
  const template = workshopTemplate(db, templateId);
  const problem = templateProblem({ subject: template.subject, body: template.body_html }, workshopTemplateVariables);
  const rendered = renderEmailTemplate(template.subject, template.body_html, null, values);
  if (problem || !rendered.isValid) throw new RequestError(problem || `Missing values: ${rendered.missingVariables.join(", ")}.`);
  let html = sanitizeEmailHtml(rendered.bodyHtml);
  if (!htmlEmailText(html).trim()) throw new RequestError("The workshop email message is empty.");
  if (workshop.google_maps_url) html += `<p><a href="${escapeEmailHtml(workshop.google_maps_url)}">${escapeEmailHtml(template.action_label || "Open in Google Maps")}</a></p>`;
  return { subject: rendered.subject, html, text: htmlEmailText(html) + (workshop.google_maps_url ? `\n${workshop.google_maps_url}` : ""), templateId, templateVersion: template.version };
}

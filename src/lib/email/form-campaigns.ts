import { createHash } from "node:crypto";
import { z } from "zod";
import type { DatabaseStore, CustomForm, FormSubmission } from "../data/store";
import { RequestError } from "../http";
import { enqueue } from "../jobs/outbox";
import { candidateEmailSchema } from "../validations/email";
import { defaultEmailAccountId, validateEmailAccount } from "./accounts";
import { manualTemplateIds } from "./manual";
import { savedTemplate } from "./notification-templates";
import { sanitizeEmailHtml } from "./sanitize";
import { htmlEmailText, plainEmailHtml, templateProblem, type NotificationTemplateId } from "./template-catalog";
import { renderEmailTemplate } from "./template-engine";
import { templateAllowedVariables } from "./reusable-templates";

export const formCampaignSchema = z.object({
  formId: z.string().min(1).max(128),
  filter: z.enum(["all", "not_contacted", "failed"]),
  selectionMode: z.enum(["all", "selected"]),
  selectedIds: z.array(z.string().min(1).max(128)).max(500).default([]),
  templateId: z.string().min(1).max(128),
  accountId: z.string().max(128).default(""),
  scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
  expectedRecipientCount: z.number().int().min(1).max(500).optional(),
  clientAttemptId: z.string().uuid().optional(),
}).strict();
export type FormCampaignInput = z.infer<typeof formCampaignSchema>;

const scalar = (value: unknown) => typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
export function formCampaignRows(db: DatabaseStore, formId: string, filter: FormCampaignInput["filter"] = "all") {
  const form = db.customForms.find(item => item.id === formId);
  if (!form) throw new RequestError("Form not found. Refresh the form list.", 404);
  const jobsByResponse = new Map<string, typeof db.outbox>();
  for (const job of db.outbox) {
    if (job.type !== "email" || job.payload.notificationEvent !== "form_campaign" || job.payload.formId !== formId) continue;
    const source = String(job.payload.sourceId || "");
    if (!jobsByResponse.has(source)) jobsByResponse.set(source, []);
    jobsByResponse.get(source)!.push(job);
  }
  const responses = db.formSubmissions.filter(item => item.form_id === formId).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const eligible = responses.filter(response => {
    const jobs = jobsByResponse.get(response.id) || [];
    return filter === "all" || filter === "not_contacted" && !jobs.length || filter === "failed" && jobs.some(job => job.status === "failed");
  });
  return { form, responses, eligible };
}

function recipientValues(db: DatabaseStore, form: CustomForm, response: FormSubmission) {
  const student = db.students.find(item => item.id === response.student_id);
  const registration = db.registrations.find(item => item.id === response.registration_id);
  const application = db.applications.find(item => item.id === response.application_id);
  const workshop = db.workshops.find(item => item.id === response.workshop_id);
  const intake = db.campaigns.find(item => item.id === form.campaign_id || item.id === registration?.campaign_id);
  const answers = Object.fromEntries(form.fields.filter(field => !["document", "file", "terms", "section"].includes(field.type)).map(field => [field.id, scalar(response.data[field.id])]));
  const name = student?.full_name || String(response.data.fullName || "");
  const email = student?.email || String(response.data.email || "");
  return {
    ...answers,
    name, fullName: name, student_name: name, email,
    reference: response.reference_no, reference_no: response.reference_no,
    registration_id: registration?.reference_no, application_id: application?.application_no,
    intake: intake?.title || "Unicom TIC", institution: db.settings.institutionName || "Unicom TIC",
    title: form.title, formTitle: form.title, form_name: form.title,
    district: student?.district || scalar(response.data.district), phone: student?.phone,
    submission_date: response.created_at.slice(0, 10),
    course_name: db.courses.find(item => item.id === application?.course_id)?.name,
    workshop: workshop?.title, workshop_date: workshop?.start_time ? new Date(workshop.start_time).toLocaleString("en-GB", { timeZone: "Asia/Colombo" }) : undefined,
  };
}

function selectedTemplate(db: DatabaseStore, form: CustomForm, id: FormCampaignInput["templateId"]) {
  if (id === "form_applicant") return { subject: form.email_automation.applicant_subject, body: form.email_automation.applicant_body_html, html: true, id: `form:${form.id}:applicant`, version: form.updated_at };
  if (id.startsWith("custom:")) {
    const saved = db.customEmailTemplates.find(item => item.id === id.slice(7));
    if (!saved || !saved.is_active || saved.purpose === "workshop" || saved.form_id && saved.form_id !== form.id) throw new RequestError("This reusable template is unavailable for the selected form.", 409);
    return { subject: saved.subject, body: saved.body_html, html: true, id, version: saved.version };
  }
  if (!manualTemplateIds.some(item => item === id)) throw new RequestError("Choose an available template.");
  const saved = savedTemplate(db, id as NotificationTemplateId);
  return { subject: saved.subject, body: saved.body, html: false, id, version: saved.version };
}

export function prepareFormCampaign(db: DatabaseStore, input: FormCampaignInput) {
  const { form, eligible, responses } = formCampaignRows(db, input.formId, input.filter);
  if (input.selectionMode === "all" && input.selectedIds.length) throw new RequestError("Clear individually selected responses before using all matching responses.");
  const chosen = input.selectionMode === "selected" ? eligible.filter(item => input.selectedIds.includes(item.id)) : eligible;
  if (input.selectionMode === "selected" && chosen.length !== new Set(input.selectedIds).size) throw new RequestError("Selected responses changed. Refresh and preview again.", 409);
  if (!chosen.length) throw new RequestError("No matching responses to email.");
  if (chosen.length > 500) throw new RequestError("One campaign can include up to 500 responses. Narrow the selection or filter.");
  if (input.expectedRecipientCount !== undefined && input.expectedRecipientCount !== chosen.length) throw new RequestError("The recipient count changed. Preview again before sending.", 409);
  const accountId = input.accountId || defaultEmailAccountId(db);
  validateEmailAccount(db, accountId);
  if (input.scheduledAt) {
    const when = Date.parse(input.scheduledAt);
    if (!Number.isFinite(when) || when <= Date.now() || when > Date.now() + 366 * 86400000) throw new RequestError("Choose a future send time within one year.");
  }
  const template = selectedTemplate(db, form, input.templateId);
  const problem = templateProblem({ subject: template.subject, body: template.body }, templateAllowedVariables(db, form.id));
  if (problem) throw new RequestError(problem);
  const messages = chosen.map(response => {
    const values = recipientValues(db, form, response);
    const email = candidateEmailSchema.safeParse(values.email);
    if (!email.success) throw new RequestError(`Response ${response.reference_no} has no valid email. Correct it or exclude this response.`);
    const rendered = renderEmailTemplate(template.subject, template.body, template.html ? null : template.body, values);
    if (!rendered.isValid) throw new RequestError(`Response ${response.reference_no} is missing ${rendered.missingVariables.join(", ")}. Correct it or exclude this response.`);
    const html = template.html ? sanitizeEmailHtml(rendered.bodyHtml) : plainEmailHtml(rendered.bodyText);
    if (!rendered.subject.trim() || !htmlEmailText(html).trim()) throw new RequestError(`Response ${response.reference_no} would receive an empty message.`);
    return {
      responseId: response.id, reference: response.reference_no, to: email.data.toLowerCase(), toName: String(values.name || ""),
      subject: rendered.subject, html,
      text: template.html ? htmlEmailText(html) : rendered.bodyText,
    };
  });
  const sameAddress = new Map<string, string>();
  for (const message of messages) {
    const earlier = sameAddress.get(message.to);
    if (earlier && earlier !== message.responseId) throw new RequestError(`Multiple selected responses use ${message.to}. Select them separately so private details cannot be mixed.`);
    sameAddress.set(message.to, message.responseId);
  }
  return { form, template, accountId, messages, totalResponses: responses.length, matchingResponses: eligible.length };
}

export function queueFormCampaign(db: DatabaseStore, input: FormCampaignInput, actor: string) {
  if (!input.clientAttemptId || input.expectedRecipientCount === undefined) throw new RequestError("Preview and confirm recipients before sending.");
  const prepared = prepareFormCampaign(db, input);
  const batchId = createHash("sha256").update(`form-campaign:${actor}:${input.clientAttemptId}`).digest("hex");
  const jobs = prepared.messages.map(message => {
    const job = enqueue(db, "email", `form-campaign:${batchId}:${message.responseId}`, {
      ...message, sourceId: message.responseId, formId: prepared.form.id,
      formCampaignId: batchId, notificationEvent: "form_campaign",
      scheduledFor: input.scheduledAt,
      templateId: prepared.template.id, templateVersion: prepared.template.version,
      smtpAccountId: prepared.accountId, initiatedBy: actor,
    });
    if (input.scheduledAt && job.status === "queued") job.next_attempt_at ||= input.scheduledAt;
    return job;
  });
  db.auditLogs.push({ id: crypto.randomUUID(), user_email: actor, action: "FORM_CAMPAIGN_QUEUED", entity_name: "form_campaign", entity_id: batchId, changes: { formId: prepared.form.id, recipientCount: jobs.length, templateId: prepared.template.id, accountId: prepared.accountId, scheduledAt: input.scheduledAt }, created_at: new Date().toISOString() });
  return { batchId, jobs };
}

import { reminderCopy, reminderKinds } from "../reminders/templates";

export const notificationTemplateIds = [
  "registration_confirmation", "application_confirmation", "form_confirmation", "admin_submission",
  "application_invitation", "workshop_booking", "workshop_reminder", "workshop_update", "interview_invitation",
  "selection_selected", "selection_waiting_list", "selection_unsuccessful", "candidate_access",
  "application_pending", "workshop_unbooked", "workshop_missed", "candidate_message", "test_notification",
] as const;
export type NotificationTemplateId = typeof notificationTemplateIds[number];
export type EmailTemplateContent = { subject: string; body: string; actionLabel?: string };
export type SavedEmailTemplate = EmailTemplateContent & { version: number; updated_at: string; updated_by: string };
export type TemplateDefinition = EmailTemplateContent & { id: NotificationTemplateId; title: string; group: string; description: string; variables: readonly string[]; linkNotice?: string };

const identity = ["name", "email", "reference", "intake", "institution"];
export const notificationTemplates: TemplateDefinition[] = [
  { id: "registration_confirmation", title: "Registration confirmation", group: "Admissions", description: "Default registration receipt. Forms with their own confirmation use the form template below.", variables: identity,
    subject: "Registration confirmed — {{reference}}", body: "Dear {{name}},\n\nYour registration for {{intake}} has been received.\nYour reference: {{reference}}.\n\n{{institution}} Admissions", actionLabel: "Track your admission progress", linkNotice: "The tracking link is added automatically. Form routing controls the optional follow-up application link." },
  { id: "application_confirmation", title: "Application confirmation", group: "Admissions", description: "Default application receipt. Forms with their own confirmation use the form template below.", variables: identity,
    subject: "Application received — {{reference}}", body: "Dear {{name}},\n\nYour application for {{intake}} has been received.\nYour reference: {{reference}}.\n\n{{institution}} Admissions", actionLabel: "Track your admission progress", linkNotice: "The tracking link is added automatically." },
  { id: "form_confirmation", title: "Other form confirmation", group: "Admissions", description: "Fallback receipt for a workshop RSVP or custom form.", variables: [...identity, "formTitle"],
    subject: "Submission received — {{reference}}", body: "Dear {{name}},\n\nYour response to {{formTitle}} has been received.\nReference: {{reference}}.", actionLabel: "Track your admission progress" },
  { id: "admin_submission", title: "New submission — staff notification", group: "Admissions", description: "Default alert to admissions staff. Form-specific staff templates can override it.", variables: [...identity, "submissionType", "formTitle", "registrationCount", "applicationCount"],
    subject: "New {{submissionType}} — {{name}} [{{reference}}]", body: "{{name}} ({{email}}) submitted {{reference}}.\n\nForm: {{formTitle}}\nTotal applications: {{applicationCount}}\nTotal registrations: {{registrationCount}}" },
  { id: "application_invitation", title: "Application invitation", group: "Admissions", description: "Sent when admissions invites a registered student to apply.", variables: identity,
    subject: "Action Required: Complete Your Unicom TIC Application [{{reference}}]", body: "Dear {{name}},\n\nYou have been selected to proceed with your application for {{intake}}. Please complete the formal application.\n\n{{institution}} Admissions", actionLabel: "Complete your application", linkNotice: "The application link is added automatically and secured at dispatch." },
  { id: "workshop_booking", title: "Workshop booking confirmation", group: "Workshops", description: "Sent when a new workshop seat is confirmed.", variables: [...identity, "workshop", "date", "startTime", "endTime", "venue", "address", "mapsUrl"],
    subject: "Workshop booking confirmed — {{workshop}}", body: "Dear {{name}},\n\nYour workshop seat is confirmed.\n\n{{workshop}}\n{{date}} (Sri Lanka)\n{{venue}}\n{{address}}\n\nReference: {{reference}}. Bring your NIC.", actionLabel: "View location", linkNotice: "A location link is included when the workshop has a Google Maps URL." },
  { id: "workshop_reminder", title: "Scheduled workshop reminder", group: "Workshops", description: "Used by the scheduled queue before a booked workshop.", variables: [...identity, "workshop", "date", "startTime", "endTime", "venue", "address", "mapsUrl", "daysBefore"],
    subject: "Workshop reminder — {{workshop}}", body: "Dear {{name}},\n\nYour workshop {{workshop}} is scheduled for {{date}} (Sri Lanka).\nVenue: {{venue}}\n{{address}}\n\nReference: {{reference}}. Bring your NIC.", actionLabel: "View location" },
  { id: "workshop_update", title: "Workshop details update", group: "Workshops", description: "Review and send current workshop details to booked participants.", variables: [...identity, "workshop", "date", "startTime", "endTime", "venue", "address", "mapsUrl", "daysBefore"],
    subject: "Workshop update — {{workshop}}", body: "Dear {{name}},\n\nPlease check the current details for your workshop.\n\n{{workshop}}\n{{date}} (Sri Lanka)\n{{venue}}\n{{address}}\n\nReference: {{reference}}.", actionLabel: "View location" },
  { id: "interview_invitation", title: "Interview invitation", group: "Assessments", description: "Sent when a candidate is assigned to an interview.", variables: [...identity, "interview", "date", "venue"],
    subject: "Interview Invitation - Unicom TIC Admissions [{{interview}}]", body: "Dear {{name}},\n\nYou are invited for the {{institution}} Admissions Interview.\n\nSession: {{interview}}\nVenue: {{venue}}\nDate & time: {{date}} (Sri Lanka)" },
  { id: "selection_selected", title: "Final result — selected", group: "Assessments", description: "Used when staff queues a selected candidate's final result.", variables: [...identity, "studentId", "rank"],
    subject: "Congratulations! Admission Offer for Unicom TIC Intake", body: "Dear {{name}},\n\nCongratulations! You have been SELECTED for admission to {{institution}}.\nStudent ID: {{studentId}}\n\nPlease check your portal for enrollment deadlines." },
  { id: "selection_waiting_list", title: "Final result — waiting list", group: "Assessments", description: "Used when staff queues a waiting-list result.", variables: [...identity, "studentId", "rank"],
    subject: "Application Update: Waiting List Placement - Unicom TIC", body: "Dear {{name}},\n\nYou have been placed on the Waiting List (Rank: {{rank}}).\nWe will contact you if an enrollment seat becomes available." },
  { id: "selection_unsuccessful", title: "Final result — unsuccessful", group: "Assessments", description: "Used when staff queues an unsuccessful result.", variables: [...identity, "studentId", "rank"],
    subject: "Update Regarding Your Application - Unicom TIC", body: "Dear {{name}},\n\nThank you for participating in the selection process. Due to cohort capacity limits, we are unable to offer you admission for this intake.\n\nWe wish you the very best in your academic journey and welcome you to apply in future intakes." },
  { id: "candidate_access", title: "Secure candidate access link", group: "Access & sender", description: "Sent when a student requests a private application or tracking link.", variables: [...identity, "purpose"],
    subject: "Your secure Unicom TIC access link", body: "Dear {{name}},\n\nUse your private link to {{purpose}}.", actionLabel: "Continue securely", linkNotice: "A fresh private link and the 30-minute expiry notice are always added at dispatch. They cannot be removed from the message." },
  ...reminderKinds.map(id => ({ id, title: reminderCopy[id].title, group: "Student reminders", description: "Saved starting message for the Student Reminders composer. Staff still reviews recipients before sending.", variables: ["name", "intake", "reference", "workshop", "date", "venue"], subject: reminderCopy[id].subject, body: reminderCopy[id].body })),
  { id: "candidate_message", title: "Personal candidate message", group: "Student reminders", description: "Reusable starting message in Email Center. Staff can edit it before sending to a selected candidate.", variables: ["name", "email", "reference", "intake"], subject: "Admissions update — {{reference}}", body: "Dear {{name}},\n\nWe are contacting you about your admission for {{intake}}.\nReference: {{reference}}.\n\nUnicom TIC Admissions" },
  { id: "test_notification", title: "Sender test notification", group: "Access & sender", description: "Used only when staff explicitly sends a test notification.", variables: ["institution"], subject: "Unicom TIC notification test", body: "Your {{institution}} admissions notification connection is working." },
];

export const templateDefinition = (id: NotificationTemplateId) => notificationTemplates.find(template => template.id === id)!;
export function templateVariables(content: string) {
  return [...new Set([...content.matchAll(/\{\{\s*([a-zA-Z][\w-]*)\s*\}\}/g)].map(match => match[1]))];
}
export function templateContentLimits(id: string) {
  return { subject: reminderKinds.some(kind => kind === id) ? 200 : 250, body: reminderKinds.some(kind => kind === id) ? 6000 : id === "candidate_message" ? 10000 : 12000 };
}
export function templateProblem(content: EmailTemplateContent, variables: readonly string[], limits = { subject: 250, body: 12000 }) {
  if (/\/access(?:#|\?)(?:[^\s<>]*&)?token=/i.test(content.subject + content.body)) return "Do not save an expiring access token in a template. Secure access links are generated automatically at dispatch.";
  if (!content.subject.trim() || content.subject.length > limits.subject || /[\r\n]/.test(content.subject)) return `Enter a subject on one line, up to ${limits.subject} characters.`;
  if (!content.body.trim() || content.body.length > limits.body) return `Enter a message up to ${limits.body.toLocaleString("en-US")} characters.`;
  if (content.actionLabel !== undefined && (content.actionLabel.length > 100 || /[\r\n{}]/.test(content.actionLabel))) return "Use a link label up to 100 characters, without variables or line breaks.";
  const combined = content.subject + content.body;
  if (/\{\{|\}\}/.test(combined.replace(/\{\{\s*[a-zA-Z][\w-]*\s*\}\}/g, ""))) return "Use variables in the format {{name}}.";
  const unknown = templateVariables(combined).filter(variable => !variables.includes(variable));
  return unknown.length ? `Unsupported variables: ${unknown.join(", ")}. Choose from the variables shown below.` : "";
}
export function personalizeTemplate(template: string, values: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-zA-Z][\w-]*)\s*\}\}/g, (placeholder, key: string) => Object.hasOwn(values, key) ? String(values[key] ?? "") : placeholder);
}
export const escapeEmailHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
export const plainEmailHtml = (value: string) => `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeEmailHtml(value).replace(/\r?\n/g, "<br />")}</div>`;
export function htmlEmailText(html: string) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "").replace(/<br\s*\/?\s*>|<\/(?:p|div|tr|h[1-6])>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " }[entity]!)).replace(/\n{3,}/g, "\n\n").trim();
}
export const templateExampleValues: Record<string, string> = { name: "Sample Student", fullName: "Sample Student", student_name: "Sample Student", email: "student@example.com", reference: "REG-SAMPLE", reference_no: "REG-SAMPLE", intake: "Unicom TIC Intake", institution: "Unicom TIC", formTitle: "Registration form", title: "Registration form", startTime: "09:00", endTime: "12:00", mapsUrl: "https://maps.google.com/?q=Jaffna", workshop: "Introduction workshop", interview: "Admissions interview", date: "30 October 2026, 09:00", submission_date: "2026-10-27", venue: "Training centre", address: "Jaffna", district: "Jaffna", phone: "0770000000", submissionType: "registration", registrationCount: "25", applicationCount: "12", studentId: "TIC-SAMPLE", rank: "3", daysBefore: "1", purpose: "view your admissions progress" };

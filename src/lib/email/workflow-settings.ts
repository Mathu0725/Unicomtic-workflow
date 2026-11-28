import type { PortalSettings } from "../settings";

export const emailWorkflowFields = [
  ["programme", "Programme name", "text"],
  ["workshopRegistrationUrl", "Workshop registration form link", "url"],
  ["interviewBookingUrl", "Interview availability form link", "url"],
  ["interviewDeadline", "Interview availability deadline (Sri Lanka time)", "text"],
  ["courseStartDate", "Course start date / hard-copy submission date", "text"],
  ["enrollmentUploadUrl", "Enrollment document upload form link", "url"],
  ["enrollmentDeadline", "Enrollment document submission deadline", "text"],
  ["trustFormDeadline", "Blossom Trust Form final deadline", "text"],
  ["documentsEmail", "Address for enrollment documents", "email"],
] as const;
export type EmailWorkflowSettings = Partial<Record<typeof emailWorkflowFields[number][0], string>>;
export const defaultEmailWorkflow: EmailWorkflowSettings = {
  programme: "2027 Software Development 9-Month Diploma Programme",
  enrollmentDeadline: "within 48 hours of receiving this email",
};
export const emailWorkflowVariables = ["programme", "workshopRegistrationUrl", "interviewBookingUrl", "interviewDeadline", "courseStartDate", "enrollmentUploadUrl", "enrollmentDeadline", "trustFormDeadline", "documentsEmail", "contactEmail", "contactPhone", "utNumber"];
export function emailWorkflowValues(settings: PortalSettings) {
  const configured = { ...defaultEmailWorkflow, ...settings.emailWorkflow };
  return {
    ...Object.fromEntries(emailWorkflowFields.map(([key]) => [key, configured[key]?.trim() || (key.endsWith("Url") ? "Please contact admissions for the current form link." : "To be confirmed by admissions")])),
    contactEmail: settings.contactEmail || "Please contact the admissions office",
    contactPhone: settings.phone || "Please contact the admissions office",
    documentsEmail: configured.documentsEmail || settings.contactEmail || "Please contact the admissions office",
  };
}

import { z } from "zod";
import type { DatabaseStore } from "../data/store";
import { RequestError } from "../http";
import { candidateEmailSchema } from "../validations/email";
import { emailCandidates } from "./candidates";
import { validateEmailAccount } from "./accounts";
import {
  personalizeTemplate,
  plainEmailHtml,
  templateProblem,
} from "./template-catalog";
export const manualTemplateIds = [
  "candidate_message",
  "registration_confirmation",
  "application_confirmation",
  "form_confirmation",
] as const;
export const manualVariables = [
  "name",
  "email",
  "reference",
  "reference_no",
  "intake",
  "institution",
  "formTitle",
  "district",
  "phone",
];
export const manualMessageSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            stage: z.enum(["registration", "application"]),
            recordId: z.string().min(1).max(128),
            expectedEmail: candidateEmailSchema,
          })
          .strict(),
      )
      .max(500),
    directRecipients: z.array(candidateEmailSchema).max(500),
    subject: z.string().trim().min(1).max(250),
    body: z.string().trim().min(1).max(10000),
    accountId: z.string().max(128).default(""),
    templateId: z.enum(manualTemplateIds).optional(),
    confirmRecipientCount: z.number().int().min(1).max(500).optional(),
    testRecipient: candidateEmailSchema.optional(),
    clientAttemptId: z.string().uuid(),
  })
  .strict();
export function prepareManualEmail(db: DatabaseStore, raw: unknown) {
  const parsed = manualMessageSchema.safeParse(raw);
  if (!parsed.success)
    throw new RequestError(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(" "),
    );
  const input = parsed.data;
  validateEmailAccount(db, input.accountId);
  const problem = templateProblem(input, manualVariables, {
    subject: 250,
    body: 10000,
  });
  if (problem) throw new RequestError(problem);
  const directories = {
    registration: emailCandidates(db, "registration"),
    application: emailCandidates(db, "application"),
  };
  const recipients = new Map<
    string,
    {
      to: string;
      toName: string;
      reference: string;
      candidateMessage?: Record<string, string | undefined>;
      variables: Record<string, string>;
    }
  >();
  const institution = db.settings.institutionName || "Unicom TIC";
  for (const selection of input.candidates) {
    const candidate = directories[selection.stage].find(
      (candidate) => candidate.id === selection.recordId,
    );
    if (
      !candidate ||
      candidate.email.toLowerCase() !== selection.expectedEmail.toLowerCase()
    )
      throw new RequestError(
        "A selected candidate or email changed. Refresh and review recipients.",
        409,
      );
    const student = db.students.find(
      (student) => student.id === candidate.studentId,
    )!;
    const intake =
      db.campaigns.find((item) => item.id === candidate.campaignId)?.title ||
      "Unicom TIC";
    const formTitle =
      db.customForms.find((form) => candidate.formIds?.includes(form.id))
        ?.title ||
      (candidate.stage === "application" ? "Application" : "Registration");
    const to = candidate.email.trim().toLowerCase();
    if (!recipients.has(to))
      recipients.set(to, {
        to,
        toName: candidate.name,
        reference: candidate.reference,
        candidateMessage: {
          stage: candidate.stage,
          recordId: candidate.id,
          studentId: candidate.studentId,
          registrationId: candidate.registrationId,
          applicationId: candidate.applicationId,
          reference: candidate.reference,
        },
        variables: {
          name: candidate.name,
          email: to,
          reference: candidate.reference,
          reference_no: candidate.reference,
          intake,
          institution,
          formTitle,
          district: candidate.district,
          phone: student.phone || "",
        },
      });
  }
  for (const recipient of input.directRecipients) {
    const to = recipient.trim().toLowerCase();
    if (!recipients.has(to))
      recipients.set(to, {
        to,
        toName: "",
        reference: "",
        variables: { email: to, name: "Applicant", institution },
      });
  }
  if (!recipients.size || recipients.size > 500)
    throw new RequestError("Select between 1 and 500 unique recipients.");
  const messages = [...recipients.values()].map((recipient) => {
    const unresolved = [
      ...(input.subject + input.body).matchAll(
        /\{\{\s*([a-zA-Z][\w-]*)\s*\}\}/g,
      ),
    ]
      .map((match) => match[1])
      .filter((key) => !recipient.variables[key]);
    if (unresolved.length)
      throw new RequestError(
        `A recipient has no value for: ${[...new Set(unresolved)].join(", ")}. Remove those variables or select candidate records with the required details.`,
      );
    const text = personalizeTemplate(input.body, recipient.variables);
    return {
      to: recipient.to,
      toName: recipient.toName,
      reference: recipient.reference,
      candidateMessage: recipient.candidateMessage,
      subject: personalizeTemplate(input.subject, recipient.variables).replace(
        /[\r\n]+/g,
        " ",
      ),
      text,
      html: plainEmailHtml(text),
    };
  });
  return {
    input,
    messages,
    duplicateCount:
      input.candidates.length + input.directRecipients.length - messages.length,
  };
}

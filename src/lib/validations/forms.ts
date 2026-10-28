import { z } from "zod";
import { fieldConfigurationProblem } from "../forms/field-rules";
import { cleanRichText } from "../forms/rich-text";
import { formSlugProblem } from "../forms/public-links";
export const formMessageDisplaySchema = z
  .object({
    popup_enabled: z.boolean(),
    bottom_messages_enabled: z.boolean(),
  })
  .partial()
  .strict();

export const formMessagesSchema = z
  .object({
    popupTitle: z.string().trim().min(1).max(160),
    popupSubtitle: z.string().trim().max(300),
    submitEnglish: z.string().trim().max(1500),
    submitTamil: z.string().trim().max(1500),
    popupNotes: z.string().trim().max(8000),
    autoSaveMessage: z.string().trim().max(1500),
    draftRestoredMessage: z.string().trim().max(1500),
    submitButtonLabel: z.string().trim().min(1).max(100),
    viewInstructionsLabel: z.string().trim().max(100),
    continueButtonLabel: z.string().trim().min(1).max(100),
  })
  .partial()
  .strict();
const fieldSchema = z.object({
  id: z
    .string()
    .max(128)
    .regex(/^[a-zA-Z][\w-]*$/),
  type: z.enum([
    "text",
    "textarea",
    "email",
    "phone",
    "nic",
    "district",
    "select",
    "radio",
    "checkbox",
    "date",
    "number",
    "terms",
    "file",
    "url",
    "time",
    "datetime",
    "section",
  ]),
  label: z.string().trim().min(1).max(1000),
  required: z.boolean(),
  placeholder: z.string().max(2000).optional(),
  helpText: z.string().max(4000).optional(),
  options: z.array(z.string().max(1000)).max(200).optional(),
  defaultValue: z
    .union([
      z.string().max(10000),
      z.number().finite(),
      z.boolean(),
      z.array(z.string().max(1000)).max(200),
    ])
    .optional(),
  systemKey: z
    .enum([
      "fullName",
      "nameWithInitials",
      "nic",
      "email",
      "phone",
      "district",
      "dob",
      "address",
      "gender",
      "whatsapp",
    ])
    .optional(),
  minLength: z.number().int().min(0).max(10000).optional(),
  maxLength: z.number().int().min(1).max(10000).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  minSelections: z.number().int().min(0).max(200).optional(),
  maxSelections: z.number().int().min(1).max(200).optional(),
  width: z.enum(["full", "half"]).optional(),
  unique: z.boolean().optional(),
  visibility: z
    .object({
      field_id: z.string().max(128),
      operator: z.enum([
        "equals",
        "not_equals",
        "contains",
        "empty",
        "not_empty",
        "greater",
        "less",
      ]),
      value: z.string().max(2000).optional(),
    })
    .strict()
    .optional(),
});
const fieldArray = z
  .array(fieldSchema)
  .max(100)
  .refine(
    (fields) => fields.filter((field) => field.type === "file").length <= 10,
    "Use at most 10 document questions per form.",
  )
  .refine(
    (fields) =>
      !fields.some((field) => field.type === "file" && field.systemKey),
    "Document questions cannot be identity fields.",
  )
  .refine(
    (fields) => new Set(fields.map((f) => f.id)).size === fields.length,
    "Field IDs must be unique.",
  );
export const fieldsSchema = fieldArray.superRefine((fields, ctx) => {
  const problem = fieldConfigurationProblem(fields);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});
export const workshopConfigSchema = z.object({
  enabled: z.boolean(),
  required: z.boolean(),
  workshop_ids: z.array(z.string()).max(100),
});
export const sheetsConfigSchema = z.object({
  enabled: z.boolean(),
  disabled: z.boolean().optional(),
  sheet_id: z.string().max(500),
  sheet_name: z.string().min(1).max(100),
  auto_sync: z.boolean(),
  last_synced_at: z.string().nullable().optional(),
});
export const googleFormSchema = z.object({
  enabled: z.boolean(),
  form_url: z.string().url().or(z.literal("")).optional(),
  response_sheet_url: z.string().url().or(z.literal("")).optional(),
  response_sheet_name: z.string().optional(),
  response_mode: z.enum(["webhook", "sheet_sync", "embed"]),
  webhook_secret: z.string().optional(),
  last_synced_at: z.string().nullable().optional(),
  synced_count: z.number().optional(),
});
export const automationSchema = z.object({
  enabled: z.boolean(),
  applicant_account_id: z.string().max(128).optional(),
  applicant_fallback_account_id: z.string().max(128).optional(),
  admin_account_id: z.string().max(128).optional(),
  admin_fallback_account_id: z.string().max(128).optional(),
  applicant_template: z
    .enum([
      "form",
      "registration_confirmation",
      "application_confirmation",
      "form_confirmation",
    ])
    .optional(),
  admin_template: z.enum(["form", "admin_submission"]).optional(),
  invitation_form_id: z.string().max(128).optional(),
  send_applicant_email: z.boolean(),
  applicant_subject: z.string().max(500),
  applicant_body_html: z.string().max(50000),
  send_admin_notification: z.boolean(),
  admin_emails: z.array(z.string().email()).max(20),
  admin_subject: z.string().max(500),
  admin_body_html: z.string().max(50000).optional(),
});

export const formEditableSchema = z
  .object({
    title: z.string().trim().min(3).max(255),
    description: z.string().max(20000),
    description_rich: z.unknown().transform(cleanRichText),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .refine(
        (value) => !formSlugProblem(value),
        "Use 1–100 lowercase letters, numbers and single hyphens.",
      ),
    status: z.enum(["draft", "published", "paused", "closed"]),
    application_mode: z.enum(["open", "invitation"]),
    is_active: z.boolean(),
    fields: fieldsSchema,
    google_form_config: googleFormSchema,
    google_sheets_config: sheetsConfigSchema,
    email_automation: automationSchema,
    confirmation_message: z.string().max(4000),
    redirect_url: z
      .string()
      .url()
      .refine(
        (value) => /^https?:\/\//i.test(value),
        "Use an http or https URL.",
      )
      .or(z.literal("")),
    workshop_config: workshopConfigSchema,
    messages: formMessagesSchema,
    message_display: formMessageDisplaySchema,
    starts_at: z.string().datetime().or(z.literal("")),
    closes_at: z.string().datetime().or(z.literal("")),
    submission_limit: z.number().int().min(0).max(1000000),
  })
  .partial();
export const formDraftSchema = formEditableSchema
  .extend({
    title: z.string().max(255).optional(),
    slug: z.string().max(100).optional(),
    fields: z
      .array(fieldSchema.extend({ label: z.string().max(1000) }))
      .max(100)
      .optional(),
    messages: formMessagesSchema
      .extend({
        popupTitle: z.string().max(160).optional(),
        submitButtonLabel: z.string().max(100).optional(),
        continueButtonLabel: z.string().max(100).optional(),
      })
      .optional(),
    google_sheets_config: sheetsConfigSchema
      .extend({ sheet_name: z.string().max(100) })
      .optional(),
    email_automation: automationSchema
      .extend({ admin_emails: z.array(z.string().max(254)).max(20) })
      .optional(),
  })
  .strict();

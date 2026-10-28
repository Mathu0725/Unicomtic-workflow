import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { audit } from "@/lib/admissions/service";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const db = getDb();
  return NextResponse.json(
    {
      success: true,
      forms: db.customForms.map((form) => ({
        id: form.id,
        title: form.title,
        type: form.type,
        campaignId: form.campaign_id,
        active: form.is_active,
        updatedAt: form.updated_at,
        hasDraft: Boolean(form.editor_draft),
        applicant:
          form.email_automation.enabled &&
          form.email_automation.send_applicant_email
            ? form.email_automation.applicant_template || "form"
            : "off",
        staff:
          form.email_automation.enabled &&
          form.email_automation.send_admin_notification
            ? form.email_automation.admin_template || "form"
            : "off",
        staffEmails: form.email_automation.admin_emails,
        invitationFormId: form.email_automation.invitation_form_id || "",
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, true);

const inputSchema = z
  .object({
    formId: z.string().max(128),
    expectedUpdatedAt: z.string().max(100),
    applicant: z.enum([
      "off",
      "form",
      "registration_confirmation",
      "application_confirmation",
      "form_confirmation",
    ]),
    staff: z.enum(["off", "form", "admin_submission"]),
    staffEmails: z.array(z.string().trim().email()).max(20),
    invitationFormId: z.string().max(128),
  })
  .strict();
export const POST = route(async (req) => {
  const input = inputSchema.parse(await req.json()),
    db = getDb(),
    form = db.customForms.find((form) => form.id === input.formId);
  if (!form) throw new RequestError("Form not found.", 404);
  if (input.expectedUpdatedAt !== form.updated_at || form.editor_draft)
    throw new RequestError(
      "This form changed or has a saved builder draft. Publish or discard its draft, then reload routing before saving.",
      409,
      { code: "VERSION_CONFLICT" },
    );
  if (
    input.invitationFormId &&
    (form.type !== "registration" ||
      !db.customForms.some(
        (target) =>
          target.id === input.invitationFormId &&
          target.type === "application" &&
          target.campaign_id === form.campaign_id,
      ))
  )
    throw new RequestError(
      "Choose an application form from the same intake for the follow-up link.",
    );
  Object.assign(form.email_automation, {
    enabled: input.applicant !== "off" || input.staff !== "off",
    send_applicant_email: input.applicant !== "off",
    applicant_template:
      input.applicant === "off"
        ? form.email_automation.applicant_template
        : input.applicant,
    send_admin_notification: input.staff !== "off",
    admin_template:
      input.staff === "off"
        ? form.email_automation.admin_template
        : input.staff,
    admin_emails: [
      ...new Set(input.staffEmails.map((email) => email.toLowerCase())),
    ],
    invitation_form_id: input.invitationFormId,
  });
  form.updated_at = new Date(
    Math.max(Date.now(), Date.parse(form.updated_at) + 1),
  ).toISOString();
  audit("FORM_EMAIL_ROUTING_UPDATED", "custom_forms", form.id, {
    applicant: input.applicant,
    staff: input.staff,
    invitationFormId: input.invitationFormId,
  });
  return NextResponse.json({
    success: true,
    updatedAt: form.updated_at,
    message:
      "Routing saved for new submissions. Existing queued and sent emails keep their reviewed content.",
  });
}, true);

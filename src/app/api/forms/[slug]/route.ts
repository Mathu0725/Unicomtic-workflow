import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { availableWorkshops, submitCustomForm } from "@/lib/admissions/service";
import { hasDriveAccess } from "@/lib/google/oauth";
import { requireCandidateAccess } from "@/lib/security/candidate-access";
import { documentAnswer } from "@/lib/documents/receipts";
import { findPublicForm } from "@/lib/forms/public-links";
import {
  resolveFormMessageDisplay,
  resolveFormMessages,
} from "@/lib/forms/messages";
import { cleanRichText } from "@/lib/forms/rich-text";
import { formAvailabilityProblem } from "@/lib/forms/field-rules";
import { candidateSessionAllowsForm, formRequiresCandidateAccess } from "@/lib/forms/access";
export const dynamic = "force-dynamic";
export const GET = route(
  async (
    req,
    {
      params,
    }: {
      params: {
        slug: string;
      };
    },
  ) => {
    const form = findPublicForm(getDb(), params.slug);
    if (!form || formAvailabilityProblem(form))
      throw new RequestError("This form is unavailable or closed.", 404);
    const documents = getDb().integrations.drive_documents;
    const documentUploadsReady =
      hasDriveAccess() &&
      documents?.ready &&
      documents.google_email === getDb().integrations.google?.email;
    return NextResponse.json(
      {
        success: true,
        form: {
          id: form.id,
          version: form.updated_at,
          slug: form.slug,
          title: form.title,
          description: form.description,
          description_rich: form.description_rich
            ? cleanRichText(form.description_rich)
            : undefined,
          messages: resolveFormMessages(form.messages),
          message_display: resolveFormMessageDisplay(form.message_display),
          type: form.type,
          application_mode:
            form.type === "application"
              ? form.application_mode || "invitation"
              : undefined,
          fields: form.fields,
          documentUploadsReady: Boolean(documentUploadsReady),
          confirmationMessage: form.confirmation_message,
          workshops: form.workshop_config?.enabled
            ? availableWorkshops(
                form.campaign_id,
                form.workshop_config,
              )
            : [],
          workshopRequired:
            form.workshop_config?.enabled && form.workshop_config.required,
          workshopEnabled: form.workshop_config?.enabled,
          workshopConfig: form.workshop_config ? {
            enabled: form.workshop_config.enabled, required: form.workshop_config.required,
            label: form.workshop_config.label, help_text: form.workshop_config.help_text,
            empty_message: form.workshop_config.empty_message, show_remaining: form.workshop_config.show_remaining,
          } : undefined,
          googleFormConfig: {
            enabled: form.google_form_config?.enabled,
            formUrl: form.google_form_config?.form_url,
            responseMode: form.google_form_config?.response_mode,
          },
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);
export const POST = route(
  async (
    req,
    {
      params,
    }: {
      params: {
        slug: string;
      };
    },
  ) => {
    const form = findPublicForm(getDb(), params.slug);
    if (!form) throw new RequestError("Form not found.", 404);
    const body = await req.json();
    if (
      body.expectedFormVersion &&
      body.expectedFormVersion !== form.updated_at
    )
      throw new RequestError(
        "This form changed. Refresh its questions and workshop availability, then review and accept the declaration again.",
        409,
        { code: "FORM_CHANGED" },
      );
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data))
      throw new RequestError("Invalid submission.");
    const access = formRequiresCandidateAccess(form)
      ? requireCandidateAccess(getDb(), req)
      : undefined;
    if (access) {
      for (const field of form.fields.filter(
        (field) => field.type === "file",
      )) {
        const upload = documentAnswer(form, field, body.data[field.id]);
        if (
          upload &&
          upload.candidate_registration_id !== access.registration.id
        )
          throw new RequestError(
            "Upload your own document using this verified email session.",
            403,
          );
      }
    }
    const result = submitCustomForm(form, body.data, {
      workshopId: body.workshopId,
      verifiedStudentId: access?.student.id,
    });
    if (access && result.submission.student_id !== access.student.id)
      throw new RequestError(
        "Use the details of the candidate verified by this email link.",
        403,
      );
    return NextResponse.json({
      success: true,
      referenceNo: result.submission.reference_no,
      trackingReference: result.trackingReference,
      message:
        "Your response is saved. Email and Google Sheets updates are queued and tracked.",
      confirmationMessage: form.confirmation_message,
      redirectUrl: form.redirect_url || null,
    });
  },
  false,
  {
    submission: true,
    authorize: (req, { params }, db) => {
      const form = findPublicForm(db, params.slug);
      if (form && formRequiresCandidateAccess(form)) {
        const access = requireCandidateAccess(db, req);
        const campaign =
          form.campaign_id ||
          db.campaigns.find((campaign) => campaign.is_active)?.id;
        if (campaign !== access.registration.campaign_id || !candidateSessionAllowsForm(form, access.claims))
          throw new RequestError(
            "Open the secure link sent for this form to continue.",
            403,
          );
        return access.registration.id;
      }
    },
  },
);

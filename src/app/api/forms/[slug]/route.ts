import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { availableWorkshops, submitCustomForm } from "@/lib/admissions/service";
import { hasDriveAccess } from "@/lib/google/oauth";
import { requireCandidateAccess } from "@/lib/security/candidate-access";
import { documentAnswer } from "@/lib/documents/receipts";
import { findPublicForm } from "@/lib/forms/public-links";
export const dynamic = "force-dynamic";
export const GET = route(async (req, { params }: {
    params: {
        slug: string;
    };
}) => {
    const form = findPublicForm(getDb(), params.slug);
    if (!form || !form.is_active)
        throw new RequestError("This form is unavailable or closed.", 404);
    const documents = getDb().integrations.drive_documents;
    const documentUploadsReady = hasDriveAccess() && documents?.ready && documents.google_email === getDb().integrations.google?.email;
    return NextResponse.json({ success: true, form: { id: form.id, version: form.updated_at, slug: form.slug, title: form.title, description: form.description, type: form.type, fields: form.fields, documentUploadsReady: Boolean(documentUploadsReady), confirmationMessage: form.confirmation_message, workshops: form.workshop_config?.enabled ? availableWorkshops(form.campaign_id, form.workshop_config.workshop_ids) : [], workshopRequired: form.workshop_config?.enabled && form.workshop_config.required, workshopEnabled: form.workshop_config?.enabled, googleFormConfig: { enabled: form.google_form_config?.enabled, formUrl: form.google_form_config?.form_url, responseMode: form.google_form_config?.response_mode } } }, { headers: { "Cache-Control": "no-store" } });
});
export const POST = route(async (req, { params }: {
    params: {
        slug: string;
    };
}) => {
    const form = findPublicForm(getDb(), params.slug);
    if (!form)
        throw new RequestError("Form not found.", 404);
    const body = await req.json();
    if (body.expectedFormVersion && body.expectedFormVersion !== form.updated_at) throw new RequestError("This form changed. Refresh its questions and workshop availability, then review and accept the declaration again.", 409, { code: "FORM_CHANGED" });
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data))
        throw new RequestError("Invalid submission.");
    const access = ["application", "workshop_rsvp"].includes(form.type) ? requireCandidateAccess(getDb(), req) : undefined;
    if (access) {
        for (const field of form.fields.filter(field => field.type === "file")) {
            const upload = documentAnswer(form, field, body.data[field.id]);
            if (upload && upload.candidate_registration_id !== access.registration.id) throw new RequestError("Upload your own document using this verified email session.", 403);
        }
    }
    const result = submitCustomForm(form, body.data, { workshopId: body.workshopId, verifiedStudentId: access?.student.id });
    if (["application", "workshop_rsvp"].includes(form.type) && result.submission.student_id !== requireCandidateAccess(getDb(), req).student.id) throw new RequestError("Use the details of the candidate verified by this email link.", 403);
    return NextResponse.json({ success: true, referenceNo: result.submission.reference_no, trackingReference: result.trackingReference, message: "Your response is saved. Email and Google Sheets updates are queued and tracked.", redirectUrl: form.redirect_url || null });
}, false, { submission: true, authorize: (req, { params }, db) => {
    const form = findPublicForm(db, params.slug);
    if (form && ["application", "workshop_rsvp"].includes(form.type)) {
        const access = requireCandidateAccess(db, req);
        const campaign = form.campaign_id || db.campaigns.find(campaign => campaign.is_active)?.id;
        if (campaign !== access.registration.campaign_id) throw new RequestError("This form belongs to a different intake.", 403);
        if (form.type === "application" && !["invited", "applied"].includes(access.registration.status)) throw new RequestError("An application invitation is required. Contact admissions.", 403);
        return access.registration.id;
    }
} });

import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { safeEqual } from "@/lib/security/session";
import { submitCustomForm } from "@/lib/admissions/service";
export const POST = route(async (req, { params }: {
    params: {
        slug: string;
    };
}) => {
    const form = getDb().customForms.find(f => f.slug === params.slug || f.id === params.slug);
    if (!form?.is_active || !form.google_form_config?.enabled)
        throw new RequestError("Google Form integration is disabled.", 404);
    const body = await req.json(), secret = req.headers.get("x-webhook-secret") || body.secret || "";
    if (!form.google_form_config.webhook_secret || !safeEqual(secret, form.google_form_config.webhook_secret))
        throw new RequestError("Invalid webhook secret.", 401);
    if (!body.responseId)
        throw new RequestError("A stable Google responseId is required.");
    const answers = body.answers || {}, normalized: Record<string, any> = {};
    for (const field of form.fields) {
        const value = answers[field.id] ?? answers[field.label] ?? answers[field.systemKey || ""];
        normalized[field.id] = field.type === "terms" ? value === true || ["true", "yes", "agree", field.label.toLowerCase()].includes(String(value).toLowerCase()) : value;
    }
    if (!normalized.email && body.respondentEmail)
        normalized.email = body.respondentEmail;
    const result = submitCustomForm(form, normalized, { externalId: String(body.responseId), workshopId: body.workshopId || answers.workshopId });
    form.google_form_config.last_synced_at = new Date().toISOString();
    form.google_form_config.synced_count = getDb().formSubmissions.filter(s => s.form_id === form.id && s.external_id).length;
    return NextResponse.json({ success: true, reference_no: result.submission.reference_no, duplicate: result.duplicate, notification_status: "queued" });
}, false, { submission: true });

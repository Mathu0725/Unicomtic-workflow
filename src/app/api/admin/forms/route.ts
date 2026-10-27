import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb, CustomForm } from "@/lib/data/store";
import { fieldsSchema, workshopConfigSchema, sheetsConfigSchema } from "@/lib/validations/forms";
import { audit } from "@/lib/admissions/service";
import { uniqueFormSlug } from "@/lib/forms/public-links";
export const dynamic = "force-dynamic";
export const GET = route(async () => NextResponse.json({ success: true, forms: getDb().customForms, total: getDb().customForms.length }), true);
export const POST = route(async (req) => {
    const body = await req.json(), db = getDb(), now = new Date().toISOString();
    if (body.action === "duplicate") {
        const source = db.customForms.find(f => f.id === body.formId);
        if (!source)
            throw new RequestError("Form not found.", 404);
        const form: CustomForm = { ...structuredClone(source), id: randomUUID(), slug: uniqueFormSlug(db.customForms, `${source.slug}-copy`), previous_slugs: [], title: String(body.newTitle || `${source.title} (Copy)`), submissions_count: 0, created_at: now, updated_at: now };
        form.google_form_config = { ...form.google_form_config, enabled: form.google_form_config?.enabled || false, response_mode: form.google_form_config?.response_mode || "webhook", webhook_secret: randomUUID(), synced_count: 0, last_synced_at: undefined };
        db.customForms.unshift(form);
        audit("FORM_DUPLICATED", "custom_forms", form.id, { source: source.id });
        return NextResponse.json({ success: true, form, message: "Form duplicated. Same-intake registration/application duplicate checks still apply." });
    }
    const parsed = z.object({ title: z.string().trim().min(3).max(255), type: z.enum(["registration", "application", "workshop_rsvp", "custom"]).default("registration"), description: z.string().optional(), campaignId: z.string().optional(), google_form_url: z.string().url().optional(), fields: fieldsSchema.optional(), google_sheets_config: sheetsConfigSchema.optional(), workshop_config: workshopConfigSchema.optional() }).safeParse(body);
    if (!parsed.success)
        throw new RequestError(parsed.error.issues[0].message);
    const data = parsed.data, campaign = data.campaignId ? db.campaigns.find(c => c.id === data.campaignId && c.is_active) : db.campaigns.find(c => c.is_active);
    if (!campaign)
        throw new RequestError("An active intake is required.");
    if (data.workshop_config?.workshop_ids.some(id => !db.workshops.some(w => w.id === id && w.campaign_id === campaign.id))) throw new RequestError("Choose workshops from this form's intake.");
    const id = randomUUID(), form: CustomForm = { id, title: data.title, description: data.description || "Please complete your admissions details.", slug: uniqueFormSlug(db.customForms, data.title), type: data.type, campaign_id: campaign.id, is_active: true, fields: data.fields?.length ? data.fields : [{ id: "fullName", type: "text", label: "Full name", required: true }, { id: "nic", type: "nic", label: "NIC number", required: true }, { id: "email", type: "email", label: "Email address", required: true }, { id: "phone", type: "phone", label: "Mobile number", required: true }, { id: "district", type: "district", label: "District", required: true }, ...(data.type === "application" ? [{ id: "statementOfPurpose", type: "textarea" as const, label: "Why would you like to join?", required: true }] : []), { id: "terms", type: "terms", label: "I confirm my details and accept the admissions terms.", required: true }], google_form_config: { enabled: Boolean(data.google_form_url), form_url: data.google_form_url, response_mode: "webhook", webhook_secret: randomUUID() }, google_sheets_config: data.google_sheets_config as any || { enabled: false, sheet_id: "", sheet_name: data.type === "application" ? "Applications" : "Registrations", auto_sync: true }, workshop_config: data.workshop_config || { enabled: false, required: false, workshop_ids: [] }, email_automation: { enabled: true, send_applicant_email: true, applicant_subject: "Submission received [{{reference_no}}]", applicant_body_html: "<p>Dear {{fullName}}, your response has been received.</p>", send_admin_notification: true, admin_emails: [], admin_subject: "New submission: {{fullName}}" }, confirmation_message: "Your response has been recorded.", submissions_count: 0, created_at: now, updated_at: now };
    db.customForms.unshift(form);
    audit("FORM_CREATED", "custom_forms", id, { title: form.title });
    return NextResponse.json({ success: true, form, message: "Form created. Open Builder to configure questions and workshop choices." });
}, true);

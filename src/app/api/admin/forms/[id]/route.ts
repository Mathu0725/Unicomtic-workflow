import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { fieldsSchema, workshopConfigSchema, sheetsConfigSchema, googleFormSchema, automationSchema } from "@/lib/validations/forms";
import { audit } from "@/lib/admissions/service";
export const dynamic = "force-dynamic";
const find = (id: string) => getDb().customForms.find(f => f.id === id || f.slug === id);
export const GET = route(async (req, { params }: {
    params: {
        id: string;
    };
}) => {
    const form = find(params.id);
    if (!form)
        throw new RequestError("Form not found.", 404);
    return NextResponse.json({ success: true, form });
}, true);
export const PATCH = route(async (req, { params }: {
    params: {
        id: string;
    };
}) => {
    const form = find(params.id);
    if (!form)
        throw new RequestError("Form not found.", 404);
    const parsed = z.object({ expectedUpdatedAt: z.string().optional(), title: z.string().trim().min(3).max(255).optional(), description: z.string().optional(), slug: z.string().regex(/^[a-z0-9-]+$/).max(100).optional(), is_active: z.boolean().optional(), fields: fieldsSchema.optional(), google_form_config: googleFormSchema.optional(), google_sheets_config: sheetsConfigSchema.optional(), email_automation: automationSchema.optional(), confirmation_message: z.string().optional(), redirect_url: z.string().url().or(z.literal("")).optional(), workshop_config: workshopConfigSchema.optional() }).safeParse(await req.json());
    if (!parsed.success)
        throw new RequestError(parsed.error.issues[0].message);
    if (parsed.data.slug && getDb().customForms.some(f => f.id !== form.id && f.slug === parsed.data.slug))
        throw new RequestError("That public link is already used.", 409);
    if (parsed.data.workshop_config?.workshop_ids.some(id => !getDb().workshops.some(w => w.id === id && w.campaign_id === form.campaign_id)))
        throw new RequestError("Choose workshops from this form's intake.");
    if (parsed.data.expectedUpdatedAt && parsed.data.expectedUpdatedAt !== form.updated_at) throw new RequestError("This form changed in another session. Reload before saving.", 409, { code: "VERSION_CONFLICT" });
    const { expectedUpdatedAt, ...incoming } = parsed.data as any;
    if (incoming.google_sheets_config && JSON.stringify(incoming.google_sheets_config) !== JSON.stringify(form.google_sheets_config) && getDb().outbox.some(j => j.type === "sheet" && j.status === "sending")) throw new RequestError("An export is running. Wait for it to finish before changing Sheet settings.", 409);
    if (incoming.google_form_config)
        incoming.google_form_config.webhook_secret = form.google_form_config?.webhook_secret || crypto.randomUUID();
    Object.assign(form, incoming, { updated_at: new Date().toISOString() });
    audit("FORM_UPDATED", "custom_forms", form.id, { title: form.title });
    return NextResponse.json({ success: true, form, message: "Form settings saved." });
}, true);
export const DELETE = route(async (req, { params }: {
    params: {
        id: string;
    };
}) => {
    const form = find(params.id);
    if (!form)
        throw new RequestError("Form not found.", 404);
    // Preserve submitted records and their tracking links.
    if (getDb().formSubmissions.some(s => s.form_id === form.id))
        throw new RequestError("This form has responses. Close submissions instead of deleting it.", 409);
    getDb().customForms = getDb().customForms.filter(f => f.id !== form.id);
    audit("FORM_DELETED", "custom_forms", form.id, { title: form.title });
    return NextResponse.json({ success: true, message: "Form deleted." });
}, true);

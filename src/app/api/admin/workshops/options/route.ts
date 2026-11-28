import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb, type Workshop } from "@/lib/data/store";
import { requireWorkshopAdmin } from "@/lib/workshops/management";
import { workshopFormChoices } from "@/lib/workshops/form-attachment";
import { workshopSchema } from "@/lib/validations/workshop";
import { renderWorkshopEmail, workshopTemplate } from "@/lib/workshops/email-content";
import { savedTemplate } from "@/lib/email/notification-templates";
import { plainEmailHtml } from "@/lib/email/template-catalog";
import { changeReusableTemplate } from "@/lib/email/reusable-templates";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const db = getDb();
  return NextResponse.json({ success: true, forms: workshopFormChoices(db), templates: [
    { id: "workshop_booking", title: "Shared workshop booking confirmation" },
    { id: "workshop_update", title: "Shared workshop details update" },
    ...db.customEmailTemplates.filter(t => t.is_active && t.purpose === "workshop" && !t.form_id).map(t => ({ id: `custom:${t.id}`, title: t.title })),
  ] });
}, true, { authorize: requireWorkshopAdmin });

export const POST = route(async req => {
  const actor = requireWorkshopAdmin(req), db = getDb(), body = await req.json();
  if (body.action === "duplicate") {
    const id = String(body.templateId || "");
    let result;
    if (id.startsWith("custom:")) result = changeReusableTemplate(db, { action: "duplicate", id: workshopTemplate(db, id).id }, actor);
    else {
      if (id !== "workshop_booking" && id !== "workshop_update") throw new RequestError("Choose a workshop template.");
      const source = savedTemplate(db, id);
      result = changeReusableTemplate(db, { action: "create", title: "Workshop confirmation copy", formId: "", purpose: "workshop", subject: source.subject, bodyHtml: plainEmailHtml(source.body), actionLabel: source.actionLabel }, actor);
    }
    return NextResponse.json({ success: true, templateId: `custom:${result.id}` });
  }
  if (body.action !== "preview") throw new RequestError("Choose a valid workshop action.");
  const parsed = workshopSchema.safeParse(body.workshop);
  if (!parsed.success) throw new RequestError(parsed.error.issues[0].message);
  const data = parsed.data;
  const w = { title: data.title, start_time: data.startTime, end_time: data.endTime, venue: data.venue, address: data.address, google_maps_url: data.googleMapsUrl || "" } as Workshop;
  const message = renderWorkshopEmail(db, w, data.confirmationTemplate || "workshop_booking", {
    name: "Sample Student", email: "sample@example.com", reference: "REG-SAMPLE",
    intake: db.campaigns.find(c => c.id === data.campaignId)?.title || "Sample intake", institution: db.settings.institutionName || "Unicom TIC",
  });
  return NextResponse.json({ success: true, message });
}, true, { authorize: requireWorkshopAdmin, bodyLimit: 16000 });

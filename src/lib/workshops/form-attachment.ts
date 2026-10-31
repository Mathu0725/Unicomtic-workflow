import { z } from "zod";
import type { DatabaseStore, Workshop } from "../data/store";
import { RequestError } from "../http";
import { stableJson } from "../json";
import { editorValues } from "../forms/editor";
import { formAvailabilityProblem } from "../forms/field-rules";
import { explicitWorkshopConfig } from "./policy";
import { nextVersion, workshopAudit } from "./management";
import { isGoogleMapsUrl } from "./confirmation";

export const workshopAttachmentSchema = z.object({
  formId: z.string().min(1).max(128),
  expectedUpdatedAt: z.string(),
  expectedDraftVersion: z.string().nullable(),
});

export function workshopFormChoices(db: DatabaseStore) {
  return db.customForms.map(f => ({
    id: f.id, title: f.title, slug: f.slug, campaignId: f.campaign_id,
    updatedAt: f.updated_at, draftVersion: f.editor_draft?.version || null,
    status: formAvailabilityProblem(f) || (f.status && f.status !== "published" ? "Form is not published" : "Live"),
  }));
}

export function workshopVisibility(db: DatabaseStore, w: Workshop, formId: string) {
  const f = db.customForms.find(f => f.id === formId);
  if (!f || f.campaign_id !== w.campaign_id) return "Different intake";
  const config = explicitWorkshopConfig(f.workshop_config, db.workshops, f.campaign_id);
  if (!config.workshop_ids.includes(w.id)) return f.editor_draft?.values.workshop_config?.workshop_ids.includes(w.id) ? "Attached in draft — publish in Builder" : "Not attached";
  if (!config.enabled) return "Workshop block disabled";
  if (config.hidden_ids?.includes(w.id)) return "Hidden on this form";
  const closed = formAvailabilityProblem(f);
  if (closed || f.status && f.status !== "published") return closed || "Form is not published";
  if (Date.parse(w.start_time) <= Date.now()) return "Workshop started — no longer listed";
  if (!w.is_active || w.booking_deadline && Date.parse(w.booking_deadline) <= Date.now()) return "Listed — booking closed";
  if (w.capacity && db.workshopBookings.filter(b => b.workshop_id === w.id && b.status === "confirmed").length >= w.capacity) return "Listed — full";
  return "Visible — accepting bookings";
}

/** Only workshop settings are published. All other form draft values are retained. */
export function showWorkshopOnForms(db: DatabaseStore, w: Workshop, inputs: z.infer<typeof workshopAttachmentSchema>[], actor: string) {
  if (!inputs.length) return [];
  if (!isGoogleMapsUrl(w.google_maps_url)) throw new RequestError("Add a valid HTTPS Google Maps share link before showing this workshop on forms.");
  if (new Set(inputs.map(i => i.formId)).size !== inputs.length) throw new RequestError("Select each form once.");
  const changes = inputs.map(input => {
    const form = db.customForms.find(f => f.id === input.formId && f.campaign_id === w.campaign_id);
    if (!form) throw new RequestError("Select forms from the workshop's intake.");
    const draft = form.editor_draft;
    if (form.updated_at !== input.expectedUpdatedAt || (draft?.version || null) !== input.expectedDraftVersion || (draft && draft.base_updated_at !== form.updated_at))
      throw new RequestError(`“${form.title}” changed. Refresh the form list and try again.`, 409);
    const live = !formAvailabilityProblem(form) && (!form.status || form.status === "published");
    const publishedConfig = explicitWorkshopConfig(form.workshop_config, db.workshops, form.campaign_id);
    const draftConfig = explicitWorkshopConfig(draft?.values.workshop_config, db.workshops, form.campaign_id);
    if (live && draft && stableJson(publishedConfig) !== stableJson(draftConfig))
      throw new RequestError(`“${form.title}” has workshop changes in its draft. Review and publish them in Builder first, or save the workshop without attaching.`, 409);
    const config = live ? publishedConfig : draft ? draftConfig : publishedConfig;
    const attached = { ...config, enabled: true, workshop_ids: [...new Set([...config.workshop_ids, w.id])], hidden_ids: config.hidden_ids?.filter(id => id !== w.id) };
    if (attached.workshop_ids.length > 100) throw new RequestError(`“${form.title}” already has 100 workshops. Remove an old attachment first.`);
    return { form, live, attached };
  });
  return changes.map(({ form, live, attached }) => {
    if (live) {
      form.workshop_config = attached;
      form.updated_at = nextVersion(form.updated_at);
      if (form.editor_draft) {
        form.editor_draft.values.workshop_config = structuredClone(attached);
        form.editor_draft.base_updated_at = form.updated_at;
        form.editor_draft.version = nextVersion(form.editor_draft.version);
      }
    } else {
      form.editor_draft = {
        values: { ...structuredClone(form.editor_draft?.values || editorValues(form)), workshop_config: attached },
        version: nextVersion(form.editor_draft?.version || form.updated_at), base_updated_at: form.updated_at,
      };
    }
    workshopAudit(db, actor, live ? "WORKSHOP_PUBLISHED_ON_FORM" : "WORKSHOP_ATTACHED_TO_DRAFT", w.id, { formId: form.id });
    return { id: form.id, title: form.title, slug: form.slug, live };
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { editorValues } from "@/lib/forms/editor";
import { explicitWorkshopConfig } from "@/lib/workshops/policy";
import { showWorkshopOnForms } from "@/lib/workshops/form-attachment";
import {
  requireWorkshopAdmin,
  findWorkshop,
  nextVersion,
  workshopAudit,
} from "@/lib/workshops/management";
export const dynamic = "force-dynamic";
const schema = z.object({
  formId: z.string().min(1),
  expectedUpdatedAt: z.string(),
  expectedDraftVersion: z.string().nullable(),
  mode: z.enum(["draft", "live"]).optional(),
});
export const POST = route(
  async (req, { params }: { params: { id: string } }) => {
    const input = schema.parse(await req.json()),
      db = getDb(),
      w = findWorkshop(db, params.id),
      actor = requireWorkshopAdmin(req);
    if (input.mode === "live") {
      const attachments = showWorkshopOnForms(db, w, [input], actor);
      return NextResponse.json({ success: true, formId: input.formId, message: attachments[0].live ? "Workshop is now visible on this form." : "Attached to draft. Open Builder to review and publish." });
    }
    const f = db.customForms.find(
      (f) => f.id === input.formId && f.campaign_id === w.campaign_id,
    );
    if (!f)
      throw new RequestError("Choose a form from this workshop's intake.");
    if (
      f.updated_at !== input.expectedUpdatedAt ||
      (f.editor_draft?.version || null) !== input.expectedDraftVersion ||
      (f.editor_draft && f.editor_draft.base_updated_at !== f.updated_at)
    )
      throw new RequestError(
        "This form or its draft changed. Reload before attaching.",
        409,
      );
    const values = structuredClone(f.editor_draft?.values || editorValues(f));
    const config = explicitWorkshopConfig(
      values.workshop_config,
      db.workshops,
      f.campaign_id,
    );
    values.workshop_config = {
      ...config,
      enabled: true,
      workshop_ids: [...new Set([...config.workshop_ids, w.id])],
      hidden_ids: config.hidden_ids?.filter((id) => id !== w.id),
    };
    f.editor_draft = {
      values,
      version: nextVersion(f.editor_draft?.version || f.updated_at),
      base_updated_at: f.updated_at,
    };
    workshopAudit(db, actor, "WORKSHOP_ATTACHED_TO_DRAFT", w.id, {
      formId: f.id,
      draftVersion: f.editor_draft.version,
    });
    return NextResponse.json({
      success: true,
      formId: f.id,
      message:
        "Attached to the form draft. Open Builder, preview and publish to show applicants.",
    });
  },
  true,
  { authorize: requireWorkshopAdmin },
);

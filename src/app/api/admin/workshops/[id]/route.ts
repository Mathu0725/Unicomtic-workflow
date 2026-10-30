import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { getSession } from "@/lib/security/session";
import {
  findWorkshop,
  workshopDetail,
  workshopSummary,
} from "@/lib/workshops/management";
export const dynamic = "force-dynamic";
export const GET = route(
  async (req, { params }: { params: { id: string } }) => {
    const db = getDb(),
      w = findWorkshop(db, params.id),
      canManage = ["admin", "super_admin"].includes(getSession(req)!.role);
    return NextResponse.json(
      {
        success: true,
        canManage,
        workshop: workshopDetail(db, w, canManage),
        ...(canManage
          ? {
              googleConnected: Boolean(db.integrations.google),
              defaultSpreadsheetId:
                db.integrations.registration_sheet_id ||
                db.integrations.application_sheet_id ||
                "",
              forms: db.customForms
                .filter((f) => f.campaign_id === w.campaign_id)
                .map((f) => ({
                  id: f.id,
                  title: f.title,
                  updatedAt: f.updated_at,
                  draftVersion: f.editor_draft?.version || null,
                  draftAttached: Boolean(
                    f.editor_draft?.values.workshop_config?.workshop_ids.includes(
                      w.id,
                    ),
                  ),
                })),
              transferTargets: db.workshops
                .filter(
                  (target) =>
                    target.campaign_id === w.campaign_id &&
                    target.id !== w.id &&
                    target.is_active &&
                    Date.parse(target.start_time) > Date.now(),
                )
                .map((target) => workshopSummary(db, target)),
            }
          : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  true,
);

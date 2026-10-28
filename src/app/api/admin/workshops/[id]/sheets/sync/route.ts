import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { requireWorkshopSheetAdmin } from "@/lib/workshops/sheet-access";
import { workshopSheetTarget } from "@/lib/workshops/sheet-config";
import { queueWorkshopBookings } from "@/lib/workshops/sheet-sync";
export const dynamic = "force-dynamic";
export const POST = route(
  async (req, { params }: { params: { id: string } }) => {
    const actor = requireWorkshopSheetAdmin(req),
      key = req.headers.get("idempotency-key");
    if (!key) throw new RequestError("A sync retry key is required.");
    const input = z
        .object({
          expectedVersion: z.string().min(1).max(128),
          clientAttemptId: z.string().uuid(),
        })
        .strict()
        .parse(await req.json()),
      db = getDb(),
      workshop = db.workshops.find((item) => item.id === params.id);
    if (!workshop) throw new RequestError("Workshop not found.", 404);
    const target = workshopSheetTarget(workshop);
    if (!target)
      throw new RequestError(
        "Save and enable this workshop's Google Sheet connection first.",
        409,
      );
    if (target.version !== input.expectedVersion)
      throw new RequestError(
        "The Sheet destination changed. Reload and review it before syncing.",
        409,
      );
    if (!db.integrations.google)
      throw new RequestError(
        "Reconnect Google before syncing workshop bookings.",
        409,
      );
    const queued = queueWorkshopBookings(db, workshop.id, {
      manual: true,
      initiatedBy: actor,
      runId: `resync:${createHash("sha256").update(key).digest("hex")}`,
    });
    db.auditLogs.push({
      id: randomUUID(),
      user_email: actor,
      action: "WORKSHOP_BOOKINGS_EXPORT_QUEUED",
      entity_name: "workshops",
      entity_id: workshop.id,
      changes: { queued, version: target.version },
      created_at: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      queued,
      message: `${queued} workshop booking(s) queued for upsert. Existing booking IDs are updated instead of duplicated.`,
    });
  },
  true,
  { submission: true, authorize: (req) => requireWorkshopSheetAdmin(req) },
);

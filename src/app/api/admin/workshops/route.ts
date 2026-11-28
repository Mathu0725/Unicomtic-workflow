import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { workshopSchema } from "@/lib/validations/workshop";
import { getSession } from "@/lib/security/session";
import { showWorkshopOnForms, workshopAttachmentSchema } from "@/lib/workshops/form-attachment";
import {
  requireWorkshopAdmin,
  saveWorkshop,
  workshopSummary,
  workshopDetail,
  findWorkshop,
  workshopVersion,
  nextVersion,
  workshopAudit,
} from "@/lib/workshops/management";
export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const db = getDb(),
    canManage = ["admin", "super_admin"].includes(getSession(req)!.role);
  return NextResponse.json(
    {
      success: true,
      canManage,
      canManageReminders: canManage,
      canManageSheets: canManage,
      ...(canManage
        ? {
            googleConnected: Boolean(db.integrations.google),
            defaultSpreadsheetId:
              db.integrations.registration_sheet_id ||
              db.integrations.application_sheet_id ||
              "",
          }
        : {}),
      workshops: db.workshops.map((w) =>
        req.nextUrl.searchParams.get("summary") === "1"
          ? workshopSummary(db, w)
          : workshopDetail(db, w, canManage),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, true);
export const POST = route(
  async (req) => {
    const actor = requireWorkshopAdmin(req);
    if (!req.headers.get("idempotency-key"))
      throw new RequestError("A workshop creation retry key is required.");
    const parsed = workshopSchema.extend({ attachments: z.array(workshopAttachmentSchema).max(50).default([]) }).safeParse(await req.json());
    if (!parsed.success) throw new RequestError(parsed.error.issues[0].message);
    const workshop = saveWorkshop(getDb(), parsed.data, actor);
    const attachedForms = showWorkshopOnForms(getDb(), workshop, parsed.data.attachments, actor);
    return NextResponse.json({
      success: true,
      workshop,
      attachedForms,
      message:
        "Workshop created. Attach it to a form draft, then preview and publish.",
    });
  },
  true,
  { submission: true, authorize: requireWorkshopAdmin },
);
export const PATCH = route(
  async (req) => {
    const actor = requireWorkshopAdmin(req),
      body = await req.json(),
      db = getDb();
    const w = findWorkshop(db, z.string().parse(body.id));
    if (typeof body.is_active === "boolean") {
      if (body.expectedVersion !== workshopVersion(w))
        throw new RequestError("Workshop changed. Reload before saving.", 409);
      if (
        body.is_active &&
        (Date.parse(w.start_time) <= Date.now() ||
          (w.booking_deadline && Date.parse(w.booking_deadline) <= Date.now()))
      )
        throw new RequestError(
          "This workshop or booking deadline has passed.",
          409,
        );
      const before = w.is_active;
      w.is_active = body.is_active;
      w.updated_at = nextVersion(workshopVersion(w));
      workshopAudit(db, actor, "WORKSHOP_BOOKINGS_CHANGED", w.id, {
        before,
        after: w.is_active,
      });
    } else {
      const parsed = workshopSchema.safeParse(body);
      if (!parsed.success)
        throw new RequestError(parsed.error.issues[0].message);
      saveWorkshop(db, parsed.data, actor, w, body.expectedVersion);
    }
    return NextResponse.json({
      success: true,
      workshop: w,
      message:
        "Workshop saved. Review and send an update from Reminders & emails if participants need to be notified.",
    });
  },
  true,
  { authorize: requireWorkshopAdmin },
);

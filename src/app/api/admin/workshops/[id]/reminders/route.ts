import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import {
  requireWorkshopAdmin,
  workshopAudit,
} from "@/lib/workshops/management";
import {
  workshopMailPreview,
  queueWorkshopMail,
} from "@/lib/workshops/notifications";
export const dynamic = "force-dynamic";
export const GET = route(
  async (req, { params }: { params: { id: string } }) => {
    const kind = z
      .enum(["manual", "update"])
      .parse(req.nextUrl.searchParams.get("kind") || "manual");
    return NextResponse.json(
      { success: true, ...workshopMailPreview(getDb(), params.id, kind) },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  true,
  { authorize: requireWorkshopAdmin },
);
const schema = z.object({
  kind: z.enum(["manual", "update"]),
  operationId: z.string().uuid(),
  expiresAt: z.number().int(),
  recipients: z
    .array(z.object({ id: z.string().min(1), token: z.string().length(64) }))
    .min(1)
    .max(10000),
});
export const POST = route(
  async (req, { params }: { params: { id: string } }) => {
    if (!req.headers.get("idempotency-key"))
      throw new RequestError("A sending retry key is required.");
    const input = schema.safeParse(await req.json());
    if (!input.success) throw new RequestError(input.error.issues[0].message);
    const actor = requireWorkshopAdmin(req),
      db = getDb(),
      result = queueWorkshopMail(db, params.id, input.data, actor);
    workshopAudit(db, actor, "WORKSHOP_MAIL_QUEUED", params.id, {
      kind: input.data.kind,
      operationId: input.data.operationId,
      ...result,
    });
    return NextResponse.json({
      success: true,
      ...result,
      message: `${result.queued} emails queued for this workshop. Delivery follows your sending allowance.`,
    });
  },
  true,
  { submission: true, authorize: requireWorkshopAdmin },
);

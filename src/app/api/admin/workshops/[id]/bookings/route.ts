import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import {
  changeBooking,
  requireWorkshopAdmin,
} from "@/lib/workshops/management";
export const dynamic = "force-dynamic";
const schema = z.object({
  bookingId: z.string().min(1),
  expectedVersion: z.string().min(1),
  action: z.enum(["cancel", "move"]),
  targetWorkshopId: z.string().optional(),
  reason: z.string().trim().min(3).max(500),
});
export const POST = route(
  async (req, { params }: { params: { id: string } }) => {
    if (!req.headers.get("idempotency-key"))
      throw new RequestError("A booking retry key is required.");
    const input = schema.safeParse(await req.json());
    if (!input.success) throw new RequestError(input.error.issues[0].message);
    const result = changeBooking(
      getDb(),
      params.id,
      input.data,
      requireWorkshopAdmin(req),
    );
    return NextResponse.json({
      success: true,
      ...result,
      message: result.moved
        ? "Booking moved. Both workshop records and Sheet updates are retained."
        : "Booking cancelled. The seat is available again.",
    });
  },
  true,
  { submission: true, authorize: requireWorkshopAdmin },
);

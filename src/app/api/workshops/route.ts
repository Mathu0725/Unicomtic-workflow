import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { availableWorkshops } from "@/lib/admissions/service";
export const dynamic = "force-dynamic";
export const GET = route(async (req) => NextResponse.json({ success: true, workshops: availableWorkshops(req.nextUrl.searchParams.get("campaignId") || undefined) }));

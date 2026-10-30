import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { emailDailyReport } from "@/lib/email/reports";

export const dynamic = "force-dynamic";
export const GET = route(async req => NextResponse.json({ success: true, report: emailDailyReport(getDb(), req.nextUrl.searchParams.get("date") || undefined) }), true);

import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getDb } from "@/lib/data/store";
export const dynamic = "force-dynamic";
export const GET = route(async () => NextResponse.json({ success: true, logs: [...getDb().auditLogs].reverse().slice(0, 500) }), true);

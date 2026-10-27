import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getDb } from "@/lib/data/store";
export const dynamic = "force-dynamic";
export const GET = route(async () => NextResponse.json({ campaigns: getDb().campaigns.filter(c => c.is_active), courses: getDb().courses.filter(c => c.is_active) }));

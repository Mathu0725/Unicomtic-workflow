import { NextResponse } from "next/server";
import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = route(async () => NextResponse.json({ success: true, status: "alive" }), false, { database: false });

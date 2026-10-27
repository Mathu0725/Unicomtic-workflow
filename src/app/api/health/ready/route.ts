import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { readDatabase } from "@/lib/data/repository";
export const dynamic = "force-dynamic";
let checkedAt = 0;
export const GET = route(async () => {
    if (process.env.NODE_ENV === "production" && ((process.env.APP_SECRET?.length || 0) < 32 || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)) throw new RequestError("Required server security configuration is incomplete.", 503, { code: "SERVER_NOT_CONFIGURED" });
    if (Date.now() - checkedAt > 5000) { await readDatabase(); checkedAt = Date.now(); }
    return NextResponse.json({ success: true, status: "ready" });
}, false, { database: false });

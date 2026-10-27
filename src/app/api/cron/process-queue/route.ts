import { NextRequest, NextResponse } from "next/server";
import { readDatabase } from "@/lib/data/repository";
import { runScheduledQueue } from "@/lib/jobs/scheduled-queue";
import { safeEqual } from "@/lib/security/session";
import { route, RequestError } from "@/lib/http";
import { decrypt } from "@/lib/security/secrets";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
const trigger = route(async (req: NextRequest) => {
    if (process.env.NODE_ENV === "production" && (process.env.CRON_SECRET?.length || 0) < 32)
        throw new RequestError("Scheduler security configuration is incomplete.", 503, { code: "WORKER_NOT_CONFIGURED" });
    if (!process.env.CRON_SECRET || !safeEqual(req.headers.get("authorization") || "", `Bearer ${process.env.CRON_SECRET}`))
        throw new RequestError("Unauthorized worker request.", 401, { code: "WORKER_UNAUTHORIZED" });
    if (req.nextUrl.searchParams.get("check") === "1") {
        const db = await readDatabase();
        try {
            if (db.integrations.google?.refresh_token) decrypt(db.integrations.google.refresh_token);
            if (db.integrations.smtp?.password) decrypt(db.integrations.smtp.password);
        } catch { throw new RequestError("Saved provider credentials need the original encryption key.", 503, { code: "INTEGRATION_KEY_UNREADABLE" }); }
        if (db.integrations.google && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET))
            throw new RequestError("Google OAuth configuration is incomplete.", 503, { code: "GOOGLE_NOT_CONFIGURED" });
        return NextResponse.json({ success: true, dispatch: false, status: "ready" });
    }
    return NextResponse.json({ success: true, ...await runScheduledQueue() });
}, false, { database: false });
export const POST = trigger;
export const GET = trigger;
// Next auto-runs GET for HEAD unless it is explicitly handled.
export const HEAD = () => new NextResponse(null, { status: 405, headers: { Allow: "GET, POST" } });

import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { diagnostics, acknowledgeIncident } from "@/lib/observability/logger";
export const dynamic = "force-dynamic";
export const GET = route(async () => {
    const db = getDb(), queued = db.outbox.filter(j => j.status === "queued"), last = db.queueControl.last_worker_at;
    return NextResponse.json({ success: true, ...diagnostics(), worker: {
        lastSeen: last ? new Date(last).toISOString() : null,
        stale: !last || Date.now() - last > 180000,
        running: (db.queueControl.worker_lease?.expires_at || 0) > Date.now(),
        lastCompleted: db.queueControl.last_worker_completed_at ? new Date(db.queueControl.last_worker_completed_at).toISOString() : null,
        lastFailure: db.queueControl.last_worker_error ? { code: db.queueControl.last_worker_error.code, at: new Date(db.queueControl.last_worker_error.at).toISOString() } : null,
    }, queue: { queued: queued.length, sending: db.outbox.filter(j => j.status === "sending").length, blocked: db.outbox.filter(j => j.status === "blocked").length, failed: db.outbox.filter(j => j.status === "failed").length, uncertain: db.outbox.filter(j => j.status === "uncertain").length, oldestQueuedSeconds: queued.length ? Math.max(0, Math.round((Date.now() - Math.min(...queued.map(j => Date.parse(j.created_at)))) / 1000)) : 0 }, integrationStatus: db.outbox.some(j => j.status === "blocked") ? "degraded" : "No blocked jobs detected" });
}, true);
export const POST = route(async req => {
    const input = z.object({ code: z.string().regex(/^[A-Z0-9_]+$/).max(100), route: z.string().max(160).optional() }).parse(await req.json());
    acknowledgeIncident(input.code, input.route);
    return NextResponse.json({ success: true, message: "Incident acknowledged in this server process." });
}, true, { database: false });

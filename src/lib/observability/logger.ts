import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export const requestContext = new AsyncLocalStorage<{ requestId: string; route: string }>();
type Event = { at: string; code: string; requestId?: string; route?: string; status?: number; durationMs?: number; jobId?: string; attempt?: number; occurrences?: number; acknowledged?: boolean; recoveredAt?: string; exceptionType?: string; fingerprint?: string };
// A bounded, process-local incident window. Durable audit records remain in the database.
const recent: Event[] = [];
const timings: number[] = [];
const safeCode = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_./:[\]-]{1,160}$/.test(value) ? value : undefined;
export function recordEvent(code: string, meta: Partial<Event> = {}) {
    const context = requestContext.getStore();
    const event: Event = { at: new Date().toISOString(), code: safeCode(code) || "INTERNAL_ERROR", requestId: context?.requestId, route: context?.route, status: meta.status, durationMs: meta.durationMs, jobId: safeCode(meta.jobId), attempt: meta.attempt };
    if (typeof event.durationMs === "number") { timings.push(event.durationMs); if (timings.length > 300) timings.shift(); }
    if (meta.exceptionType && ["Error", "TypeError", "SyntaxError", "RangeError", "ReferenceError", "AbortError", "TimeoutError"].includes(meta.exceptionType)) event.exceptionType = meta.exceptionType;
    if (meta.fingerprint && /^[a-f0-9]{64}$/.test(meta.fingerprint)) event.fingerprint = meta.fingerprint;
    if (code === "REQUEST_COMPLETED" && (meta.status || 0) < 400) recent.filter(item => !item.jobId && item.route === context?.route).forEach(item => { item.recoveredAt = new Date().toISOString(); });
    // Never accept arbitrary objects, error messages, query strings or request bodies.
    if (code !== "REQUEST_COMPLETED" && ((event.status || 0) >= 400 || event.jobId)) {
        recent.push(event);
        if (recent.length > 200) recent.shift();
        console.warn(JSON.stringify({ event: "admissions_failure", ...event }));
    }
}
export function diagnostics() {
    const cutoff = Date.now() - 24 * 3600000;
    while (recent.length && Date.parse(recent[0].at) < cutoff) recent.shift();
    const groups = new Map<string, Event>();
    for (const item of recent) {
        const key = `${item.route}:${item.code}`;
        const previous = groups.get(key);
        groups.set(key, { ...item, occurrences: (previous?.occurrences || 0) + 1, acknowledged: item.acknowledged });
    }
    const sorted = [...timings].sort((a, b) => a - b);
    return { retention: "Last 200 failures, up to 24 hours, in this server process. Configure host log retention separately.", latency: { samples: sorted.length, p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? null }, incidents: [...groups.values()].reverse() };
}
export function acknowledgeIncident(code: string, route?: string) {
    recent.filter(event => event.code === code && (!route || event.route === route)).forEach(event => { event.acknowledged = true; });
}
export function recoverIncident(jobId: string) { recent.filter(item => item.jobId === jobId).forEach(item => { item.recoveredAt = new Date().toISOString(); }); }
export function errorMetadata(error: unknown): Partial<Event> {
    const value = error instanceof Error ? error : undefined;
    return { exceptionType: value?.name || "Error", fingerprint: createHash("sha256").update(value?.stack || value?.name || "unknown").digest("hex") };
}

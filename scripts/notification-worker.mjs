import nextEnv from "@next/env";
import { setTimeout as delay } from "node:timers/promises";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const base = (process.env.WORKER_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const target = new URL(base);
if (target.username || target.password || target.search || target.hash || target.pathname !== "/" ||
    !(target.protocol === "https:" || target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))) {
    throw new Error("Use an HTTPS worker origin, or HTTP on loopback for local operation.");
}
if (!process.env.CRON_SECRET || /secure_cron_secret_key_2025|your-/.test(process.env.CRON_SECRET)) {
    console.error("Set a real CRON_SECRET in the server environment before starting the worker.");
    process.exit(1);
}
const stop = new AbortController();
process.on("SIGINT", () => stop.abort());
process.on("SIGTERM", () => stop.abort());
console.log("Notification worker started. Dispatching durable jobs with account-wide pacing.");
let consecutiveFailures = 0;
while (!stop.signal.aborted) {
    try {
        const response = await fetch(`${base}/api/cron/process-queue`, {
            method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
            redirect: "error",
            signal: AbortSignal.any([stop.signal, AbortSignal.timeout(115000)]),
        });
        if (response.status === 401) throw new Error("Worker authorization rejected; check the server and worker CRON_SECRET.");
        if (!response.ok) throw new Error(`Queue endpoint returned HTTP ${response.status}. Saved jobs remain queued.`);
        const result = await response.json();
        if (result.success !== true || !Number.isInteger(result.processed)) throw new Error("Queue endpoint returned an unexpected response. Saved jobs remain queued.");
        consecutiveFailures = 0;
        if (result.processed) console.log(JSON.stringify({ sent: result.sent, failed: result.failed, batches: result.batches }));
    } catch (error) {
        if (stop.signal.aborted) break;
        consecutiveFailures++;
        console.error(error.message || "Worker request failed; retrying.");
    }
    try { await delay(Math.min(60000, 2000 * 2 ** Math.min(consecutiveFailures, 5)), undefined, { signal: stop.signal }); } catch { break; }
}
console.log("Notification worker stopped. Unfinished jobs remain durable.");

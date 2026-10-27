import nextEnv from "@next/env";
import { databaseClient, remoteSnapshot } from "./lib/database-tools.mjs";
import { productionChecks, savedCredentialChecks } from "./lib/production-checks.mjs";

nextEnv.loadEnvConfig(process.cwd(), false);
const checks = productionChecks(process.env);
checks.push({ name: "NODE", ok: Number(process.versions.node.split(".")[0]) >= 24, message: "Use Node.js 24 or later; select Node 24.x in Vercel." });
try {
    const { client } = databaseClient();
    const snapshot = await remoteSnapshot(client);
    checks.push({ name: "DATABASE", ok: Boolean(snapshot), message: snapshot ? "Existing admissions snapshot is readable. No data was written." : "Initialize/import the database before opening admissions." });
    if (snapshot) {
        checks.push(savedCredentialChecks(process.env, snapshot.data.integrations));
        if (snapshot.data.integrations?.google) checks.push({ name: "GOOGLE_OAUTH", ok: Boolean(process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.startsWith("your-") && process.env.GOOGLE_CLIENT_SECRET && !process.env.GOOGLE_CLIENT_SECRET.startsWith("your-")), message: "Saved Google connection requires the matching client ID and client secret in the deployment environment." });
    }
} catch {
    checks.push({ name: "DATABASE", ok: false, message: "Could not verify the existing Supabase snapshot. Check the project configuration and network." });
}
if (process.argv.includes("--remote")) {
    if (checks.find(check => check.name === "NEXT_PUBLIC_APP_URL").ok && checks.find(check => check.name === "CRON_SECRET").ok) {
        for (const route of ["/api/health/ready", "/api/cron/process-queue?check=1"]) {
            try {
                const response = await fetch(new URL(route, process.env.NEXT_PUBLIC_APP_URL), {
                    headers: route.includes("cron") ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
                    redirect: "error", signal: AbortSignal.timeout(20000),
                });
                const data = await response.json();
                checks.push({ name: route, ok: response.ok && data.success === true && data.status === "ready" && (!route.includes("cron") || data.dispatch === false), message: "Read-only deployed readiness/authentication check; dispatch is disabled for this request." });
            } catch { checks.push({ name: route, ok: false, message: "Deployed readiness check failed; no dispatch requested." }); }
        }
    } else checks.push({ name: "REMOTE", ok: false, message: "Configure the final HTTPS origin and scheduler secret before checking deployment." });
}
const ready = checks.every(check => check.ok);
console.log(JSON.stringify({ ready, checks }, null, 2));
if (!ready) process.exitCode = 1;

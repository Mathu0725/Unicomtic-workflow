import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function databaseClient() {
    nextEnv.loadEnvConfig(process.cwd());
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const host = new URL(url || "https://invalid.local").hostname;
    if (!/^[a-z]{20}\.supabase\.co$/.test(host) || /mock|dummy|your-project/.test(host) || !key || /dummy|your[_-]/.test(key))
        throw new Error("Configure the real Supabase project URL and server-only service key in .env.local first.");
    const requested = process.argv.indexOf("--project-ref");
    if (requested >= 0 && process.argv[requested + 1] !== host.split(".")[0])
        throw new Error("The requested project does not match .env.local. No data was changed.");
    return { project: host.split(".")[0], client: createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
    }) };
}

export function validSnapshot(snapshot) {
    if (!Number.isSafeInteger(snapshot?.version) || snapshot.version < 0 ||
        !snapshot.data || typeof snapshot.data !== "object" || Array.isArray(snapshot.data) ||
        !["students", "registrations", "campaigns", "customForms", "formSubmissions", "outbox"].every(key => Array.isArray(snapshot.data[key])))
        throw new Error("Snapshot validation failed. Preserve the source; no import should be attempted.");
    return snapshot;
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
}
export const digest = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest("hex");
export const counts = data => Object.fromEntries(Object.entries(data).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));

export async function verifiedBackup(snapshot, label) {
    validSnapshot(snapshot);
    const dir = path.resolve(process.env.DATA_DIR || ".data", "backups");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.json`);
    const bytes = JSON.stringify(snapshot);
    await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
    if (digest(await readFile(file)) !== digest(bytes)) throw new Error("Backup verification failed.");
    await writeFile(`${file}.sha256`, `${digest(bytes)}  ${path.basename(file)}\n`, { flag: "wx", mode: 0o600 });
    return file;
}

export async function remoteSnapshot(client) {
    const { data, error } = await client.from("platform_state").select("version,data,updated_at").eq("id", "admissions").maybeSingle();
    if (error) throw new Error(`Supabase repository read failed (${error.code || "network"}). Check migrations and the server key.`);
    return data ? validSnapshot(data) : null;
}

export function fail(error) {
    // Do not dump provider responses, credentials, or applicant records.
    console.error(error instanceof Error ? error.message : "Database operation failed.");
    process.exitCode = 1;
}

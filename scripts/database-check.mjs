import { createClient } from "@supabase/supabase-js";
import { databaseClient, remoteSnapshot, counts, digest, fail } from "./lib/database-tools.mjs";
try {
    const { client, project } = databaseClient();
    const snapshot = await remoteSnapshot(client);
    if (!snapshot) throw new Error("The database schema exists but admissions has not been initialized. Import the verified local snapshot first.");
    // An invalid version must be rejected without changing the database.
    const sample = { students: [], registrations: [], campaigns: [] };
    const { data, error } = await client.rpc("save_platform_state", { expected_version: -2, next_data: sample });
    if (!error || error.code !== "22023" || data === true) throw new Error("The hardened save function is missing or invalid.");
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!publicKey) throw new Error("Configure the project's public API key before checking browser isolation.");
    const publicClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
    });
    const read = await publicClient.from("platform_state").select("id").limit(1);
    const write = await publicClient.rpc("save_platform_state", { expected_version: -1, next_data: sample });
    if (read.error?.code !== "42501" || write.error?.code !== "42501") throw new Error("Public API isolation was not confirmed. Check keys, grants and function permissions.");
    console.log(JSON.stringify({ connected: true, project, publicReadDenied: true, publicWriteDenied: true, version: snapshot.version, counts: counts(snapshot.data), sha256: digest(snapshot.data), updatedAt: snapshot.updated_at }));
} catch (error) { fail(error); }

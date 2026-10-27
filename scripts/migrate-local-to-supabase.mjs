import { readFile, open, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { databaseClient, validSnapshot, remoteSnapshot, verifiedBackup, counts, digest, fail } from "./lib/database-tools.mjs";

let release;
try {
    if (!process.argv.includes("--project-ref")) throw new Error("Supply --project-ref <project-id> to identify the destination explicitly.");
    const { client, project } = databaseClient();
    const file = path.resolve(process.env.DATA_DIR || ".data", "platform.json");
    const lock = `${file}.lock`;
    const handle = await open(lock, "wx").catch(() => { throw new Error("Local storage is busy. Stop the app/worker before migrating; do not remove an active lock."); });
    release = async () => { await handle.close(); await unlink(lock); };
    await handle.writeFile(JSON.stringify({ pid: process.pid, token: randomUUID() }));
    const local = validSnapshot(JSON.parse(await readFile(file, "utf8")));
    const existing = await remoteSnapshot(client);
    if (existing) {
        if (digest(existing.data) !== digest(local.data)) throw new Error("Supabase already contains different admissions data. Nothing was overwritten. Review both stores before proceeding.");
        console.log(JSON.stringify({ imported: false, alreadyMatches: true, project, counts: counts(existing.data) }));
    } else {
        const backup = await verifiedBackup(local, "before-supabase-import");
        const { data, error } = await client.rpc("save_platform_state", { expected_version: -1, next_data: local.data });
        // Resolve even a lost acknowledgement by rereading the exact original snapshot.
        const saved = await remoteSnapshot(client);
        if (!saved || digest(saved.data) !== digest(local.data))
            throw new Error(`Import is unconfirmed (${error?.code || (data === false ? "conflict" : "verification")}). Keep the app stopped and inspect the destination; do not repeat with changed data.`);
        console.log(JSON.stringify({ imported: true, verified: true, project, backup, counts: counts(saved.data), sha256: digest(saved.data) }));
    }
} catch (error) { fail(error); }
finally { if (release) await release().catch(() => { console.error("Review the migration lock before restarting the app."); process.exitCode = 1; }); }

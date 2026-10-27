import { databaseClient, remoteSnapshot, verifiedBackup, counts, fail } from "./lib/database-tools.mjs";
try {
    const { client, project } = databaseClient();
    const snapshot = await remoteSnapshot(client);
    if (!snapshot) throw new Error("No admissions repository exists to back up.");
    const file = await verifiedBackup(snapshot, "supabase-admissions");
    console.log(JSON.stringify({ verified: true, project, path: file, version: snapshot.version, counts: counts(snapshot.data) }));
} catch (error) { fail(error); }

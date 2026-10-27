import { verifyBackup } from "./lib/backup-verification.mjs";
try {
    const file = process.argv[2];
    if (!file || process.argv.length !== 3) throw new Error("Usage: npm run backup:verify -- <backup.json>");
    console.log(JSON.stringify(await verifyBackup(file)));
} catch {
    console.error("Backup verification failed. Supply one backup JSON file with its matching .sha256 manifest. No live data was changed.");
    process.exitCode = 1;
}

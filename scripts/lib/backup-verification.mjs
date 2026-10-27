import { readFile } from "node:fs/promises";
import path from "node:path";
import { digest, validSnapshot, counts } from "./database-tools.mjs";

export async function verifyBackup(file) {
    const bytes = await readFile(file), manifest = (await readFile(`${file}.sha256`, "utf8")).trim();
    const match = /^([a-f\d]{64})  (.+)$/i.exec(manifest);
    if (!match || match[2] !== path.basename(file) || match[1].toLowerCase() !== digest(bytes))
        throw new Error("Backup checksum or manifest does not match. Preserve the file; do not restore it.");
    const snapshot = validSnapshot(JSON.parse(bytes.toString("utf8")));
    return { verified: true, path: path.resolve(file), version: snapshot.version, bytes: bytes.length, sha256: digest(bytes), counts: counts(snapshot.data) };
}

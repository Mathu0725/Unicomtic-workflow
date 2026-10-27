import { afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { encrypt, decrypt } from "../../src/lib/security/secrets";
import { productionChecks, savedCredentialChecks } from "../../scripts/lib/production-checks.mjs";
import { verifyBackup } from "../../scripts/lib/backup-verification.mjs";

afterEach(() => { vi.unstubAllEnvs(); });
const env = () => ({ APP_SECRET: "random-production-signing-secret-of-32-plus-characters", APP_DATA_KEY: undefined as string | undefined, ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "random-strong-admin-password", CRON_SECRET: "random-production-cron-secret-of-32-plus-characters", NEXT_PUBLIC_APP_URL: "https://admissions.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key", SUPABASE_SERVICE_ROLE_KEY: "server-key", ALLOW_LOCAL_STORAGE: "false", ALLOW_DATABASE_INITIALIZE: "false", SEED_DEMO_DATA: "false" });
it("validates a production environment without exposing its values", () => {
    expect(productionChecks(env()).every(check => check.ok)).toBe(true);
    expect(JSON.stringify(productionChecks(env()))).not.toContain(env().CRON_SECRET);
});
it.each(["http://example.com", "https://localhost", "https://127.0.0.1", "https://user:password@example.com", "https://example.com/path", "https://example.com?key=value"])("rejects an unsafe deployment origin: %s", url => {
    expect(productionChecks({ ...env(), NEXT_PUBLIC_APP_URL: url }).find(check => check.name === "NEXT_PUBLIC_APP_URL")?.ok).toBe(false);
});
it("refuses demo/local initialization and placeholder secrets for deployment", () => {
    const checks = productionChecks({ ...env(), ALLOW_LOCAL_STORAGE: "true", CRON_SECRET: "secure_cron_secret_key_2025", ADMIN_PASSWORD: "your-admin-password" });
    expect(checks.filter(check => !check.ok).map(check => check.name)).toEqual(["ADMIN_PASSWORD", "CRON_SECRET", "STORAGE_MODE"]);
});
it("preserves legacy file-key credentials while changing production session signing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tic-key-migration-")), key = randomBytes(32).toString("hex");
    try {
        vi.stubEnv("DATA_DIR", dir); vi.stubEnv("APP_SECRET", ""); vi.stubEnv("APP_DATA_KEY", undefined);
        await writeFile(path.join(dir, "secret.key"), key);
        const saved = encrypt("private-refresh-token");
        vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_SECRET", env().APP_SECRET); vi.stubEnv("APP_DATA_KEY", key);
        expect(decrypt(saved)).toBe("private-refresh-token");
        expect(savedCredentialChecks({ ...env(), APP_DATA_KEY: key }, { google: { refresh_token: saved } }).ok).toBe(true);
        expect(savedCredentialChecks(env(), { google: { refresh_token: saved } }).ok).toBe(false);
        expect(decrypt(encrypt("new-private-password"))).toBe("new-private-password");
    } finally { await rm(dir, { recursive: true, force: true }); }
});
it("keeps existing APP_SECRET-derived ciphertext compatible and fails closed for an invalid data key", () => {
    vi.stubEnv("APP_SECRET", env().APP_SECRET); vi.stubEnv("APP_DATA_KEY", undefined);
    const saved = encrypt("private-token");
    vi.stubEnv("APP_DATA_KEY", createHash("sha256").update(env().APP_SECRET).digest("hex"));
    expect(decrypt(saved)).toBe("private-token");
    vi.stubEnv("APP_DATA_KEY", "incorrect");
    expect(() => decrypt(saved)).toThrow("APP_DATA_KEY");
    expect(() => encrypt("secret")).toThrow("APP_DATA_KEY");
});
it("verifies a backup and refuses tampering, mismatched manifests and malformed snapshots", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tic-backup-verify-")), file = path.join(dir, "backup.json");
    const data = { version: 3, data: { students: [], registrations: [], campaigns: [], customForms: [], formSubmissions: [], outbox: [] } };
    const save = async (value: unknown, name = "backup.json") => {
        const bytes = JSON.stringify(value); await writeFile(file, bytes);
        await writeFile(`${file}.sha256`, `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`);
    };
    try {
        await save(data); expect(await verifyBackup(file)).toMatchObject({ verified: true, version: 3, counts: { students: 0 } });
        await writeFile(file, "tampered"); await expect(verifyBackup(file)).rejects.toThrow("checksum");
        await save(data, "different.json"); await expect(verifyBackup(file)).rejects.toThrow("manifest");
        await save({ version: 1, data: {} }); await expect(verifyBackup(file)).rejects.toThrow("Snapshot validation");
    } finally { await rm(dir, { recursive: true, force: true }); }
});

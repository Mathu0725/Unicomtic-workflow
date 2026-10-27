import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const failures = vi.hoisted(() => ({ rename: false }));
vi.mock("node:fs/promises", async () => {
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    return { ...actual, rename: async (...args: Parameters<typeof actual.rename>) => { if (failures.rename) throw Object.assign(new Error("private path or disk diagnostic"), { code: "ENOSPC" }); return actual.rename(...args); } };
});
import { readDatabase, transaction } from "../../src/lib/data/repository";
let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tic-write-failure-")); vi.stubEnv("DATA_DIR", dir); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false"); failures.rename = false;
    await transaction(() => {});
});
afterEach(async () => { failures.rename = false; vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
it("keeps the committed snapshot intact and cleans a failed replacement without false success", async () => {
    const before = await readFile(path.join(dir, "platform.json"), "utf8"); failures.rename = true;
    await expect(transaction(db => { db.auditLogs.push({ id: "should-not-commit" } as any); })).rejects.toMatchObject({ code: "STORAGE_FULL", retryable: false });
    expect(await readFile(path.join(dir, "platform.json"), "utf8")).toBe(before);
    expect((await readDatabase()).auditLogs).toHaveLength(0);
    expect((await readdir(dir)).some(name => name.endsWith(".tmp") || name.endsWith(".lock"))).toBe(false);
});

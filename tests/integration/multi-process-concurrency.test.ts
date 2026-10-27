import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fork, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { transaction, readDatabase } from "../../src/lib/data/repository";

let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tic-process-concurrency-"));
    vi.stubEnv("DATA_DIR", dir);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
    vi.stubEnv("SEED_DEMO_DATA", "false");
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

it("keeps capacity and identity checks atomic across four independent Node processes", async () => {
    await transaction(db => {
        const form = db.customForms[0];
        form.fields = [{ id: "fullName", type: "text", label: "Name", required: true }, { id: "nic", type: "nic", label: "NIC", required: true }, { id: "email", type: "email", label: "Email", required: true }, { id: "phone", type: "phone", label: "Phone", required: true }, { id: "terms", type: "terms", label: "Consent", required: true }];
        form.workshop_config = { enabled: true, required: true, workshop_ids: ["limited-workshop"] };
        db.workshops.push({ id: "limited-workshop", campaign_id: "camp-2025", title: "Limited workshop", description: "", venue: "Campus", address: "Campus", google_maps_url: "", start_time: new Date(Date.now() + 5 * 86400000).toISOString(), end_time: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(), capacity: 10, is_active: true, reminder_schedule: { days_before: [3, 1] }, created_at: new Date().toISOString() });
    });
    const children = Array.from({ length: 4 }, () => fork(path.join(process.cwd(), "tests/fixtures/concurrent-submit.cjs"), [], { env: { ...process.env, DATA_DIR: dir }, windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] }));
    let ready = 0;
    try {
        const work = children.map((child, index) => new Promise<string[]>((resolve, reject) => {
            let errors = "", done = false;
            child.stderr?.on("data", value => { errors += value; });
            child.on("message", (message: any) => {
                if (message.ready && ++ready === children.length) children.forEach((worker, index) => worker.send({ offset: index * 15 + 1, count: 15 }));
                if (message.results) { done = true; resolve(message.results); }
            });
            child.on("error", reject);
            child.on("exit", code => { if (!done) reject(new Error(`Submit process exited ${code}: ${errors}`)); });
        }));
        const results = (await Promise.all(work)).flat();
        expect(results.filter(r => r === "accepted")).toHaveLength(10);
        expect(results.filter(r => r === "full")).toHaveLength(50);
        const db = await readDatabase();
        expect(db.students).toHaveLength(10);
        expect(db.registrations).toHaveLength(10);
        expect(db.workshopBookings).toHaveLength(10);
    } finally {
        await Promise.all(children.map(child => new Promise<void>(resolve => {
            if (child.exitCode !== null) return resolve();
            child.once("exit", () => resolve()); child.kill();
        })));
    }
}, 30000);

it("recovers a crashed process's file lock without discarding saved records", async () => {
    await transaction(() => {});
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], { windowsHide: true });
    await new Promise<void>((resolve, reject) => { child.once("exit", () => resolve()); child.once("error", reject); });
    await writeFile(path.join(dir, "platform.json.lock"), JSON.stringify({ pid: child.pid, token: "dead-owner" }));
    await transaction(db => { db.integrations.admin_notification_email = "owner@example.com"; });
    expect((await readDatabase()).integrations.admin_notification_email).toBe("owner@example.com");
});

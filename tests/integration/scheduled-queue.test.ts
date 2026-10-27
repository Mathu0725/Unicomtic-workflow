import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
const dispatch = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/jobs/outbox", async importOriginal => ({ ...await importOriginal<object>(), processOutbox: dispatch }));
import { transaction, readDatabase } from "../../src/lib/data/repository";
import { runScheduledQueue } from "../../src/lib/jobs/scheduled-queue";
import { GET, POST, HEAD } from "../../src/app/api/cron/process-queue/route";
import { AppError } from "../../src/lib/errors/app-error";
import { encrypt } from "../../src/lib/security/secrets";

let dir: string;
const secret = "scheduler-test-secret-of-at-least-32-characters";
const request = (method: string, suffix = "", authorized = true) => new NextRequest(`http://localhost/api/cron/process-queue${suffix}`, { method, headers: authorized ? { Authorization: `Bearer ${secret}` } : {} });
beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tic-scheduler-"));
    vi.stubEnv("DATA_DIR", dir); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false"); vi.stubEnv("CRON_SECRET", secret);
    dispatch.mockReset(); dispatch.mockResolvedValue({ sent: 0, failed: 0, processed: 0, batches: 0 });
    await transaction(() => {});
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

it.each(["GET", "POST"])("refuses unauthenticated %s triggers before dispatch", async method => {
    const response = await (method === "GET" ? GET : POST)(request(method, "", false), undefined);
    expect(response.status).toBe(401); expect(dispatch).not.toHaveBeenCalled();
    expect((await readDatabase()).queueControl.worker_lease).toBeUndefined();
});
it.each(["GET", "POST"])("supports authenticated %s and records a durable completed run", async method => {
    const response = await (method === "GET" ? GET : POST)(request(method), undefined);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(dispatch).toHaveBeenCalledOnce();
    const db = await readDatabase();
    expect(db.queueControl.last_worker_completed_at).toBeGreaterThan(0);
    expect(db.queueControl.worker_lease).toBeUndefined();
});
it("does not dispatch or change the database during readiness checks or HEAD", async () => {
    const before = await readFile(path.join(dir, "platform.json"), "utf8");
    const response = await GET(request("GET", "?check=1"), undefined);
    expect(await response.json()).toMatchObject({ success: true, dispatch: false, status: "ready" });
    expect(HEAD().status).toBe(405); expect(dispatch).not.toHaveBeenCalled();
    expect(await readFile(path.join(dir, "platform.json"), "utf8")).toBe(before);
});
it("checks saved provider decryption on the deployed host without contacting a provider", async () => {
    vi.stubEnv("APP_DATA_KEY", "a".repeat(64)); vi.stubEnv("GOOGLE_CLIENT_ID", "test-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    await transaction(db => { db.integrations.google = { email: "test@example.com", refresh_token: encrypt("private-refresh"), scopes: [], connected_at: new Date().toISOString() }; });
    expect((await GET(request("GET", "?check=1"), undefined)).status).toBe(200);
    vi.stubEnv("APP_DATA_KEY", "b".repeat(64));
    const failed = await GET(request("GET", "?check=1"), undefined);
    expect(failed.status).toBe(503); expect((await failed.json()).code).toBe("INTEGRATION_KEY_UNREADABLE");
    expect(dispatch).not.toHaveBeenCalled();
});
it("reports missing OAuth configuration before starting the scheduler", async () => {
    vi.stubEnv("APP_DATA_KEY", "a".repeat(64)); vi.stubEnv("GOOGLE_CLIENT_ID", ""); vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    await transaction(db => { db.integrations.google = { email: "test@example.com", refresh_token: encrypt("private-refresh"), scopes: [], connected_at: new Date().toISOString() }; });
    const response = await GET(request("GET", "?check=1"), undefined);
    expect(response.status).toBe(503); expect((await response.json()).code).toBe("GOOGLE_NOT_CONFIGURED");
    expect(dispatch).not.toHaveBeenCalled();
});
it("skips overlapping triggers with a persisted lease and releases it when done", async () => {
    let release!: () => void, entered!: () => void;
    const inDispatch = new Promise<void>(resolve => { entered = resolve; });
    dispatch.mockImplementationOnce(async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); return { sent: 1, failed: 0, processed: 1, batches: 1 }; });
    const first = runScheduledQueue();
    await inDispatch;
    expect(await runScheduledQueue()).toMatchObject({ skipped: true, reason: "already_running" });
    expect(dispatch).toHaveBeenCalledOnce();
    release(); await first;
    expect((await readDatabase()).queueControl.worker_lease).toBeUndefined();
});
it("recovers an expired lease after a crashed process", async () => {
    await transaction(db => { db.queueControl.worker_lease = { id: "crashed-worker", expires_at: Date.now() - 1 }; });
    expect(await runScheduledQueue()).toMatchObject({ skipped: false });
    expect(dispatch).toHaveBeenCalledOnce();
    expect((await readDatabase()).queueControl.worker_lease).toBeUndefined();
});
it("does not release a newer worker's lease when an older invocation completes", async () => {
    dispatch.mockImplementationOnce(async () => {
        await transaction(db => { db.queueControl.worker_lease = { id: "new-owner", expires_at: Date.now() + 180000 }; });
        return { sent: 0, failed: 0, processed: 0, batches: 0 };
    });
    await runScheduledQueue();
    expect((await readDatabase()).queueControl.worker_lease?.id).toBe("new-owner");
});
it("keeps only a safe failure code and allows the next scheduled attempt to recover", async () => {
    dispatch.mockRejectedValueOnce(new AppError("DATABASE_UNAVAILABLE", "Private provider detail", 503));
    await expect(runScheduledQueue()).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
    const db = await readDatabase();
    expect(db.queueControl.last_worker_error?.code).toBe("DATABASE_UNAVAILABLE");
    expect(db.queueControl.worker_lease).toBeUndefined();
    expect(JSON.stringify(db.queueControl)).not.toContain("Private provider detail");
    await runScheduledQueue();
    expect((await readDatabase()).queueControl.last_worker_error).toBeUndefined();
});
it("queues one reminder per booking/window across repeated triggers", async () => {
    await transaction(db => {
        db.students.push({ id: "student-1", full_name: "<Candidate>", email: "candidate@example.com" } as any);
        db.workshops.push({ id: "workshop-1", is_active: true, title: "Workshop", start_time: new Date(Date.now() + 60 * 3600000).toISOString(), venue: "<Campus>", address: "Address", reminder_schedule: { days_before: [3, 1] } } as any);
        db.workshopBookings.push({ id: "booking-1", workshop_id: "workshop-1", student_id: "student-1", registration_id: "registration-1", status: "confirmed", created_at: new Date().toISOString() });
    });
    await runScheduledQueue(); await runScheduledQueue();
    const jobs = (await readDatabase()).outbox;
    expect(jobs).toHaveLength(1); expect(jobs[0].payload.html).toContain("&lt;Candidate&gt;");
});

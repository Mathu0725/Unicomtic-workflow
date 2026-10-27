import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
const processJobs = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/jobs/outbox", () => ({ processOutbox: processJobs }));
import { route, RequestError } from "../../src/lib/http";
import { getDb } from "../../src/lib/data/store";
import { readDatabase, transaction } from "../../src/lib/data/repository";

let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tic-http-concurrency-"));
    vi.stubEnv("DATA_DIR", dir);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
    vi.stubEnv("SEED_DEMO_DATA", "false");
    processJobs.mockClear();
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
const request = (data: any, key = "same-submission-retry-key") => new NextRequest("http://localhost/api/forms/test", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(data) });
const handler = route(async req => {
    const body = await req.json(), db = getDb();
    db.auditLogs.push({ id: `accepted-${db.auditLogs.length + 1}`, action: "ACCEPTED", entity_name: "test", entity_id: "test", user_email: "test", changes: body, created_at: new Date().toISOString() });
    return NextResponse.json({ success: true, referenceNo: db.auditLogs[db.auditLogs.length - 1].id });
}, false, { submission: true });

it("returns one durable receipt for 50 overlapping retries without waiting for a provider", async () => {
    const responses = await Promise.all(Array.from({ length: 50 }, () => handler(request({ name: "Applicant" }), undefined)));
    const bodies = await Promise.all(responses.map(r => r.json()));
    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(new Set(bodies.map(b => b.referenceNo)).size).toBe(1);
    expect(responses.filter(r => r.headers.has("Idempotency-Replayed"))).toHaveLength(49);
    const db = await readDatabase();
    expect(db.auditLogs).toHaveLength(1);
    expect(db.submissionReceipts).toHaveLength(1);
    expect(processJobs).not.toHaveBeenCalled();
});
it("rejects a reused key with changed answers and treats JSON property order consistently", async () => {
    await handler(request({ a: 1, b: 2 }), undefined);
    expect((await handler(request({ b: 2, a: 1 }), undefined)).headers.has("Idempotency-Replayed")).toBe(true);
    expect((await handler(request({ a: 3, b: 2 }), undefined)).status).toBe(409);
    expect((await readDatabase()).auditLogs).toHaveLength(1);
});
it("rejects oversized and malformed bodies before writing any records", async () => {
    expect((await handler(request({ answer: "x".repeat(130 * 1024) }), undefined)).status).toBe(413);
    const bad = new NextRequest("http://localhost/api/forms/test", { method: "POST", body: "{" });
    expect((await handler(bad, undefined)).status).toBe(400);
    expect((await readDatabase()).submissionReceipts).toHaveLength(0);
});
it("rolls back rejected mutations and never saves a successful retry receipt for them", async () => {
    const reject = route(async () => { getDb().auditLogs.length = 1; throw new RequestError("Full workshop", 409); }, false, { submission: true });
    expect((await reject(request({}), undefined)).status).toBe(409);
    const db = await readDatabase();
    expect(db.auditLogs).toHaveLength(0);
    expect(db.submissionReceipts).toHaveLength(0);
});
it("serves committed reads while a write transaction is busy", async () => {
    await transaction(() => {});
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>(r => { started = r; });
    const gate = new Promise<void>(r => { release = r; });
    const writing = transaction(async () => { started(); await gate; });
    await entered;
    try {
        const read = route(async () => NextResponse.json({ count: getDb().registrations.length }));
        const response = await Promise.race([read(new NextRequest("http://localhost/api/stats"), undefined), new Promise<null>(r => setTimeout(() => r(null), 500))]);
        expect(response?.status).toBe(200);
    } finally { release(); await writing; }
});

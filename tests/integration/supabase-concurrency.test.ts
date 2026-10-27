import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const state = vi.hoisted(() => ({ version: 0, data: null as any, conflicts: 0, writes: 0, loseConfirmation: false }));
vi.mock("../../src/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { version: state.version, data: structuredClone(state.data) }, error: null }) }) }) }),
        rpc: async (_name: string, args: any) => {
            if (state.conflicts-- > 0) {
                state.version++;
                state.data.auditLogs.push({ id: `other-worker-${state.version}` });
                return { data: false, error: null };
            }
            if (args.expected_version !== state.version) return { data: false, error: null };
            state.data = structuredClone(args.next_data); state.version++; state.writes++;
            if (state.loseConfirmation) { state.loseConfirmation = false; return { data: null, error: { message: "Lost commit acknowledgement" } }; }
            return { data: true, error: null };
        },
    }),
}));
import { initialDatabase } from "../../src/lib/data/repository";
import { getDb } from "../../src/lib/data/store";
import { route } from "../../src/lib/http";
beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://concurrency-test.supabase.co");
    vi.stubEnv("SEED_DEMO_DATA", "false");
    state.version = 0; state.data = initialDatabase(); state.conflicts = 2; state.writes = 0; state.loseConfirmation = false;
});
afterEach(() => vi.unstubAllEnvs());
it("replays a submission on a fresh snapshot after CAS conflicts without losing other workers' commits", async () => {
    let attempts = 0;
    const submit = route(async req => {
        const body = await req.json(); attempts++;
        getDb().auditLogs.push({ id: "our-accepted-submission", changes: body } as any);
        return NextResponse.json({ success: true, referenceNo: "REG-RETRY" });
    }, false, { submission: true });
    const request = () => new NextRequest("http://localhost/api/registrations", { method: "POST", headers: { "Idempotency-Key": "retryable-client-request-key" }, body: JSON.stringify({ name: "Applicant" }) });
    expect((await submit(request(), undefined)).status).toBe(200);
    expect(attempts).toBe(3);
    expect(state.data.auditLogs.map((l: any) => l.id)).toEqual(["other-worker-1", "other-worker-2", "our-accepted-submission"]);
    expect(state.data.submissionReceipts).toHaveLength(1);
    expect((await submit(request(), undefined)).headers.has("Idempotency-Replayed")).toBe(true);
    expect(state.writes).toBe(1);
});
it("returns a retryable 503 when bounded conflict retries are exhausted", async () => {
    state.conflicts = 100;
    const submit = route(async () => { getDb().auditLogs.push({ id: "conflicting-write" } as any); return NextResponse.json({ success: true }); }, false, { submission: true });
    const response = await submit(new NextRequest("http://localhost/api/registrations", { method: "POST", body: "{}" }), undefined);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("2");
    expect((await response.json()).retryable).toBe(true);
    expect(state.writes).toBe(0);
});
it("resolves a lost database commit acknowledgement with the durable receipt instead of writing twice", async () => {
    state.conflicts = 0; state.loseConfirmation = true;
    const submit = route(async () => { getDb().auditLogs.push({ id: "accepted-once" } as any); return NextResponse.json({ success: true, referenceNo: "REG-UNKNOWN-COMMIT" }); }, false, { submission: true });
    const request = () => new NextRequest("http://localhost/api/registrations", { method: "POST", headers: { "Idempotency-Key": "lost-commit-retry-key" }, body: "{}" });
    const unknown = await submit(request(), undefined);
    expect(unknown.status).toBe(503); expect((await unknown.json()).code).toBe("COMMIT_UNCONFIRMED");
    const recovered = await submit(request(), undefined);
    expect(recovered.status).toBe(200); expect(recovered.headers.has("Idempotency-Replayed")).toBe(true);
    expect(state.writes).toBe(1); expect(state.data.auditLogs.filter((r: any) => r.id === "accepted-once")).toHaveLength(1);
});

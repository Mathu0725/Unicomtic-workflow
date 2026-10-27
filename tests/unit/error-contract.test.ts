import { afterEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "../../src/lib/errors/app-error";
import { route } from "../../src/lib/http";
import { diagnostics, recordEvent, requestContext } from "../../src/lib/observability/logger";
afterEach(() => vi.restoreAllMocks());
const request = () => new NextRequest("http://localhost/api/testing?token=private");
it("hides unknown exception details and correlates the safe response with a support reference", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = route(async () => { throw new Error("password=do-not-leak C:/private/customer@example.com"); }, false, { database: false });
    const response = await handler(request(), undefined), body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ code: "INTERNAL_ERROR", retryable: false });
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(body) + JSON.stringify(log.mock.calls)).not.toMatch(/do-not-leak|customer@example|token=private/);
});
it("keeps expected field errors and repairs older returned failures", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const validate = route(async () => { z.object({ email: z.string().email() }).parse({ email: "wrong" }); return NextResponse.json({ success: true }); }, false, { database: false });
    const body = await (await validate(request(), undefined)).json();
    expect(body.code).toBe("VALIDATION_FAILED"); expect(body.fieldErrors.email).toHaveLength(1);
    const legacy = route(async () => NextResponse.json({ message: "SQL password secret", details: "internal" }, { status: 500 }), false, { database: false });
    expect(JSON.stringify(await (await legacy(request(), undefined)).json())).not.toContain("secret");
});
it("distinguishes authentication, configuration and malformed request bodies", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const denied = route(async () => NextResponse.json({ success: true }), true, { database: false });
    expect((await (await denied(request(), undefined)).json()).code).toBe("SESSION_REQUIRED");
    const handler = route(async () => { throw new AppError("NEEDS_REPAIR", "Repair the connection.", 503, {}, false); }, false, { database: false });
    expect((await (await handler(request(), undefined)).json()).retryable).toBe(false);
    const bad = new NextRequest("http://localhost/api/testing", { method: "POST", body: "{" });
    expect((await (await handler(bad, undefined)).json()).code).toBe("MALFORMED_JSON");
});
it("logs only an allowlisted incident envelope even when unsafe fields are supplied", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    requestContext.run({ requestId: "safe-reference", route: "/api/test" }, () => recordEvent("TEST_REDACTION", { status: 503, password: "private-password", message: "private-user@example.com", jobId: "job-safe" } as any));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-password|private-user/);
    expect(diagnostics().incidents.some(i => i.code === "TEST_REDACTION")).toBe(true);
});
it("accepts an empty incoming POST stream for bodyless worker and sync triggers", async () => {
    const trigger = route(async () => NextResponse.json({ success: true }), false, { database: false });
    const incoming = new NextRequest("http://localhost/api/cron/process-queue", { method: "POST", body: new ReadableStream({ start(controller) { controller.close(); } }), duplex: "half" } as any);
    expect((await trigger(incoming, undefined)).status).toBe(200);
    const requiresJson = route(async req => { await req.json(); return NextResponse.json({ success: true }); }, false, { database: false });
    const empty = new NextRequest("http://localhost/api/test", { method: "POST" });
    expect((await requiresJson(empty, undefined)).status).toBe(400);
});

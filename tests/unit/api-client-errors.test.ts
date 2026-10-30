import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError, fetchWithTimeout, retryAfterMs } from "../../src/lib/client/api";
afterEach(() => vi.unstubAllGlobals());
it("retries an unreadable read-only response once and reports a load error without implying a save", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("<html>Proxy token=secret</html>", { status: 502 }));
    vi.stubGlobal("fetch", fetch);
    await expect(api("/api/test", undefined, "GET")).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502, message: expect.stringContaining("No changes were saved") });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe("/api/test");
});
it("recovers a template read after one transient HTML gateway response", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("<html>Temporary gateway</html>", { status: 502 })).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, entries: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(api("/api/admin/email/templates", undefined, "GET")).resolves.toMatchObject({ success: true, entries: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not retry an unreadable mutation response", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("<html>Gateway</html>", { status: 502 }));
    vi.stubGlobal("fetch", fetch);
    await expect(api("/api/test", {})).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(fetch).toHaveBeenCalledTimes(1);
});
it("preserves structured validation and support references", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, message: "Correct email.", code: "VALIDATION_FAILED", fieldErrors: { email: ["Invalid email"] }, requestId: "support-1" }), { status: 400 })));
    await expect(api("/api/test", {})).rejects.toMatchObject({ status: 400, fields: { email: ["Invalid email"] }, requestId: "support-1" });
});
it("distinguishes a timeout from caller cancellation and does not retry unsafe mutations", async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")); vi.stubGlobal("fetch", fetch);
    await expect(api("/api/test", {})).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" }); expect(fetch).toHaveBeenCalledTimes(1);
    const controller = new AbortController(); controller.abort();
    const aborted = new DOMException("cancelled", "AbortError"); fetch.mockRejectedValue(aborted);
    await expect(fetchWithTimeout("/api/test", { signal: controller.signal })).rejects.toBe(aborted);
});
it("reads both Retry-After formats safely", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs("Thu, 01 Jan 2026 00:00:05 GMT", Date.parse("2026-01-01T00:00:00Z"))).toBe(5000);
    expect(retryAfterMs("invalid")).toBe(0);
});

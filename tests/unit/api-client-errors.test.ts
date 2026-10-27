import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError, fetchWithTimeout, retryAfterMs } from "../../src/lib/client/api";
afterEach(() => vi.unstubAllGlobals());
it("turns HTML gateways and empty responses into a safe transport error", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("<html>Proxy token=secret</html>", { status: 502 })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await expect(api("/api/test")).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    await expect(api("/api/test")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
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

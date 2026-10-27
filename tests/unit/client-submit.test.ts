import { afterEach, expect, it, vi } from "vitest";
import { submitRequest, pendingPayload } from "../../src/lib/client/submit";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("reuses one submission key through network failure and a busy-server response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(new Response("{}", { status: 503, headers: { "retry-after": "2" } })).mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const pending = submitRequest("/api/forms/client-retry-test", { email: "applicant@example.com" });
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(new Set(fetch.mock.calls.map(call => call[1].headers["Idempotency-Key"])).size).toBe(1);
});
it("does not retry a genuine duplicate/validation rejection", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(8) });
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    expect((await submitRequest("/api/forms/client-duplicate-test", { name: "Applicant" })).status).toBe(409);
    expect(fetch).toHaveBeenCalledTimes(1);
});
it("holds an unknown submission's original payload and key until it is resolved", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(9) });
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"success":false,"retryable":false}', { status: 503 })).mockResolvedValue(new Response('{"success":true,"referenceNo":"REG-RECOVERED"}'));
    vi.stubGlobal("fetch", fetch);
    const url = "/api/forms/unknown-outcome", original = { fullName: "Applicant One" };
    await submitRequest(url, original);
    await expect(submitRequest(url, { fullName: "Changed Answer" })).rejects.toMatchObject({ code: "SUBMISSION_UNRESOLVED" });
    expect(pendingPayload(url)).toEqual(original);
    await submitRequest(url, pendingPayload(url));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(fetch.mock.calls[1][1].headers["Idempotency-Key"]);
    expect(pendingPayload(url)).toBeUndefined();
});
it("keeps recovery available when a proxy returns HTML with HTTP 200", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(10) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>gateway page</html>")));
    const url = "/api/forms/html-success-unknown", original = { fullName: "Applicant" };
    await submitRequest(url, original);
    expect(pendingPayload(url)).toEqual(original);
});

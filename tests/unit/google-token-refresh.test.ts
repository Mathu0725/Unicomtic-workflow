import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../src/lib/data/store", () => ({
  getDb: () => ({ integrations: { google: { refresh_token: "encrypted-test-token" } } }),
}));
vi.mock("../../src/lib/security/secrets", () => ({ decrypt: () => "test-refresh-token" }));

import { clearGoogleTokenCache, GOOGLE_DRIVE_SCOPE, googleAccessToken } from "../../src/lib/google/oauth";

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  clearGoogleTokenCache();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); clearGoogleTokenCache(); });

it("reports a Google token timeout as a retryable connection failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
  await expect(googleAccessToken()).rejects.toMatchObject({
    code: "GOOGLE_TOKEN_UNAVAILABLE", status: 503, retryable: true, action: "retry",
  });
});

it("still reports revoked authorization separately", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));
  await expect(googleAccessToken()).rejects.toMatchObject({ code: "GOOGLE_AUTH_REVOKED", action: "reconnect_google" });
});

it("requests and caches a separate Drive-only token for Picker", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "server-token", expires_in: 3600 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "drive-token", expires_in: 3600, scope: GOOGLE_DRIVE_SCOPE })));
  vi.stubGlobal("fetch", fetcher);
  expect(await googleAccessToken()).toBe("server-token");
  expect(await googleAccessToken(GOOGLE_DRIVE_SCOPE)).toBe("drive-token");
  expect(await googleAccessToken(GOOGLE_DRIVE_SCOPE)).toBe("drive-token");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((fetcher.mock.calls[1][1].body as URLSearchParams).get("scope")).toBe(GOOGLE_DRIVE_SCOPE);
});

it.each([undefined, `${GOOGLE_DRIVE_SCOPE} https://www.googleapis.com/auth/gmail.send`])(
  "refuses a Picker token when Google does not confirm Drive-only scope: %s",
  async scope => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "unsafe-token", expires_in: 3600, scope }))));
    await expect(googleAccessToken(GOOGLE_DRIVE_SCOPE)).rejects.toMatchObject({ code: "GOOGLE_PICKER_SCOPE_INVALID" });
  },
);


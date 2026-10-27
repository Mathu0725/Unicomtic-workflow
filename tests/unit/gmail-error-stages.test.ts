import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DatabaseStore, databaseContext } from "../../src/lib/data/store";
import { encrypt } from "../../src/lib/security/secrets";
import { sendEmail } from "../../src/lib/email/smtp-client";
let db: DatabaseStore;
const payload = { to: "applicant@example.com", subject: "Confirmation", html: "Saved" };
beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-only-client-secret"); vi.stubEnv("APP_SECRET", "test-only-secret-with-at-least-32-characters");
    db = new DatabaseStore(); db.integrations.google = { email: "sender@example.com", refresh_token: encrypt("test-refresh"), connected_at: new Date().toISOString(), scopes: [] };
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("blocks a revoked token before any message send", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"error":"invalid_grant","error_description":"private-provider-detail"}', { status: 400 })); vi.stubGlobal("fetch", fetch);
    const result = await databaseContext.run(db, () => sendEmail(payload));
    expect(result).toMatchObject({ success: false, failureKind: "blocked", errorCode: "GOOGLE_AUTH_REVOKED", uncertain: false });
    expect(fetch).toHaveBeenCalledTimes(1); expect(result.error).not.toContain("private-provider-detail");
});
it("does not mark a token-refresh outage as an uncertain email send", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await databaseContext.run(db, () => sendEmail(payload))).toMatchObject({ failureKind: "temporary", uncertain: false });
});
it("marks a network interruption at the send endpoint uncertain", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"access_token":"test-token","expires_in":3600}')).mockRejectedValueOnce(new TypeError("fetch failed")); vi.stubGlobal("fetch", fetch);
    expect(await databaseContext.run(db, () => sendEmail(payload))).toMatchObject({ failureKind: "uncertain", uncertain: true });
    expect(fetch.mock.calls[1][0]).toContain("messages/send");
});
it("backs off a quota error without exposing the provider body", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"access_token":"test-token","expires_in":3600}')).mockResolvedValueOnce(new Response('{"error":{"message":"private quota detail","errors":[{"reason":"userRateLimitExceeded"}]}}', { status: 403, headers: { "Retry-After": "600" } })); vi.stubGlobal("fetch", fetch);
    const result = await databaseContext.run(db, () => sendEmail(payload));
    expect(result).toMatchObject({ failureKind: "temporary", errorCode: "GOOGLE_RATE_LIMITED", retryAfterMs: 600000, uncertain: false });
    expect(result.error).not.toContain("private quota detail");
});
it("recognizes Gmail's mail sending daily limit and pauses for 24 hours", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"access_token":"test-token","expires_in":3600}')).mockResolvedValueOnce(new Response('{"error":{"message":"User-rate limit exceeded. (Mail sending)","errors":[{"reason":"userRateLimitExceeded"}]}}', { status: 429, headers: { "Retry-After": "600" } })); vi.stubGlobal("fetch", fetch);
    const result = await databaseContext.run(db, () => sendEmail(payload));
    expect(result).toMatchObject({ failureKind: "temporary", errorCode: "EMAIL_PROVIDER_DAILY_LIMIT", retryAfterMs: 86400000, uncertain: false });
});
it("rejects a .con recipient before contacting the mail provider", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await databaseContext.run(db, () => sendEmail({ ...payload, to: "candidate@example.con" }))).toMatchObject({ success: false, failureKind: "permanent", errorCode: "INVALID_EMAIL_JOB", error: expect.stringContaining(".con") });
    expect(fetch).not.toHaveBeenCalled();
});

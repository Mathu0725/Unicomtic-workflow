import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const exchange = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/google/oauth", async () => {
    const actual = await vi.importActual<typeof import("../../src/lib/google/oauth")>("../../src/lib/google/oauth");
    return { ...actual, exchangeGoogleCode: exchange };
});

import { GET as startConnection } from "../../src/app/api/auth/google/route";
import { GET as finishConnection } from "../../src/app/api/auth/google/callback/route";
import { GOOGLE_SCOPES, GOOGLE_DRIVE_SCOPE } from "../../src/lib/google/oauth";
import { encrypt, decrypt } from "../../src/lib/security/secrets";
import { signSession, SESSION_COOKIE, type StaffUser } from "../../src/lib/security/session";
import { transaction, readDatabase } from "../../src/lib/data/repository";

let directory: string;
const staff = { email: "staff@example.com", name: "Test administrator", role: "super_admin" };
const googleEmail = "sheets-owner@example.com";

function request(url: string, user?: StaffUser, pending?: string) {
    const cookies = [user && `${SESSION_COOKIE}=${signSession(user)}`, pending && `google_oauth_state=${pending}`].filter(Boolean).join("; ");
    return new NextRequest(`http://localhost${url}`, { headers: cookies ? { cookie: cookies } : {} });
}
function pending(overrides: Record<string, unknown> = {}) {
    return encrypt(JSON.stringify({ intent: "connect", state: "test-oauth-state", verifier: "test-pkce-verifier", staffEmail: staff.email, expires: Date.now() + 600000, ...overrides }));
}
function callback(user: StaffUser | undefined = staff, overrides: Record<string, unknown> = {}) {
    return finishConnection(request("/api/auth/google/callback?state=test-oauth-state&code=test-code", user, pending(overrides)), undefined);
}
function location(response: Response) { return new URL(response.headers.get("location")!); }

beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "tic-google-connection-"));
    vi.stubEnv("DATA_DIR", directory);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
    vi.stubEnv("SEED_DEMO_DATA", "false");
    vi.stubEnv("APP_SECRET", "test-secret-with-at-least-32-characters");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    exchange.mockReset();
    exchange.mockResolvedValue({ access_token: "test-access-token", refresh_token: "test-refresh-token", scope: GOOGLE_SCOPES.join(" ") });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ email: googleEmail, email_verified: true }))));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await transaction(db => {
        db.integrations.google = { email: "original-owner@example.com", refresh_token: encrypt("original-refresh-token"), connected_at: new Date().toISOString(), scopes: GOOGLE_SCOPES };
    });
});
afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
});

it.each(["", "?intent=login"])("requires staff login before starting Google authorization (%s)", async suffix => {
    const response = await startConnection(request(`/api/auth/google${suffix}`), undefined);
    expect(location(response).pathname).toBe("/login");
    expect(location(response).searchParams.get("returnTo")).toBe("/admin/google-integrations");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});

it("denies Google connection management to a non-administrator staff role", async () => {
    const response = await startConnection(request("/api/auth/google", { ...staff, role: "examiner" }), undefined);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN");
    expect(fetch).not.toHaveBeenCalled();
});

it("starts a staff-bound connection with Gmail/Sheets scopes and PKCE", async () => {
    const response = await startConnection(request("/api/auth/google", staff), undefined);
    const url = location(response);
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SCOPES.join(" "));
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const encrypted = response.headers.get("set-cookie")!.match(/google_oauth_state=([^;]+)/)![1];
    expect(JSON.parse(decrypt(decodeURIComponent(encrypted)))).toMatchObject({ intent: "connect", staffEmail: staff.email, state: url.searchParams.get("state") });
});

it.each(["https://www.uticx.com", "https://unicomtic-workflow.vercel.app"])("moves authorization from %s to the callback host before setting cookies", async origin => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://uticx.com");
    const response = await startConnection(new NextRequest(`${origin}/api/auth/google?drive=1&returnTo=https://unexpected.example`, { headers: { cookie: `${SESSION_COOKIE}=${signSession(staff)}` } }), undefined);
    expect(location(response).href).toBe("https://uticx.com/api/auth/google?drive=1");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});

it("requires a fresh staff login on the canonical host instead of sharing alias cookies", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://uticx.com");
    const response = await startConnection(new NextRequest("https://uticx.com/api/auth/google?drive=1"), undefined);
    expect(location(response).origin).toBe("https://uticx.com");
    expect(location(response).pathname).toBe("/login");
    expect(response.headers.get("set-cookie")).toBeNull();
});

it("starts Google consent on the same canonical origin as its host-only state cookie", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://uticx.com");
    const response = await startConnection(new NextRequest("https://uticx.com/api/auth/google", { headers: { cookie: `${SESSION_COOKIE}=${signSession(staff)}` } }), undefined);
    expect(location(response).hostname).toBe("accounts.google.com");
    expect(location(response).searchParams.get("redirect_uri")).toBe("https://uticx.com/api/auth/google/callback");
    expect(response.headers.get("set-cookie")).toContain("google_oauth_state=");
    expect(response.headers.get("set-cookie")).not.toMatch(/;\s*domain=/i);
});

it("rejects a callback missing its host-bound state cookie without replacing the saved connection", async () => {
    const response = await finishConnection(request("/api/auth/google/callback?state=old-state&code=old-code", staff), undefined);
    expect(location(response).searchParams.get("error")).toBe("OAUTH_EXPIRED");
    expect(exchange).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect((await readDatabase()).integrations.google?.email).toBe("original-owner@example.com");
});

it("requests only app-specific Drive access when connecting student documents", async () => {
    const response = await startConnection(request("/api/auth/google?drive=1", staff), undefined);
    const scopes = location(response).searchParams.get("scope")!.split(" ");
    expect(scopes).toContain(GOOGLE_DRIVE_SCOPE);
    expect(scopes).not.toContain("https://www.googleapis.com/auth/drive");
    expect(location(response).searchParams.get("include_granted_scopes")).toBe("true");
});

it("preserves the old connection if the Drive-specific consent is missing", async () => {
    const response = await callback(staff, { drive: true });
    expect(location(response).searchParams.get("error")).toBe("GOOGLE_DRIVE_SCOPE_MISSING");
    expect((await readDatabase()).integrations.google?.email).toBe("original-owner@example.com");
});

it("saves granted Drive access without changing the staff session", async () => {
    exchange.mockResolvedValue({ access_token: "test-access-token", refresh_token: "test-refresh-token", scope: [...GOOGLE_SCOPES, GOOGLE_DRIVE_SCOPE].join(" ") });
    const response = await callback(staff, { drive: true });
    expect(location(response).searchParams.get("connected")).toBe("drive");
    expect((await readDatabase()).integrations.google?.scopes).toContain(GOOGLE_DRIVE_SCOPE);
    expect(response.headers.get("set-cookie")).not.toContain(`${SESSION_COOKIE}=`);
});

it("sends retired Google portal-login links to the signed-in integrations page", async () => {
    const response = await startConnection(request("/api/auth/google?intent=login", staff), undefined);
    expect(location(response).pathname).toBe("/admin/google-integrations");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
});

it("rejects callbacks without a current staff session before contacting Google", async () => {
    const response = await finishConnection(request("/api/auth/google/callback?state=test-oauth-state&code=test-code", undefined, pending()), undefined);
    expect(location(response).pathname).toBe("/login");
    expect(location(response).searchParams.get("error")).toBe("SESSION_REQUIRED");
    expect(exchange).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).not.toContain(`${SESSION_COOKIE}=`);
});

it("rejects pending Google portal-login callbacks without granting staff access", async () => {
    const response = await callback(staff, { intent: "login" });
    expect(location(response).searchParams.get("error")).toBe("GOOGLE_CONNECTION_ONLY");
    expect(exchange).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).not.toContain(`${SESSION_COOKIE}=`);
});

it("denies a non-administrator callback before it can replace the Google connection", async () => {
    const response = await callback({ ...staff, role: "examiner" });
    expect(location(response).searchParams.get("error")).toBe("FORBIDDEN");
    expect(exchange).not.toHaveBeenCalled();
    expect((await readDatabase()).integrations.google?.email).toBe("original-owner@example.com");
});

it.each([
    { state: "wrong-state" },
    { expires: Date.now() - 1000 },
    { staffEmail: "different-staff@example.com" },
])("rejects expired, mismatched or different-staff authorization (%j)", async overrides => {
    const response = await callback(staff, overrides);
    expect(location(response).searchParams.get("error")).toBe("OAUTH_STATE_INVALID");
    expect(exchange).not.toHaveBeenCalled();
    expect((await readDatabase()).integrations.google?.email).toBe("original-owner@example.com");
});

it("saves the approved Google connection without creating or replacing a staff session", async () => {
    const response = await callback();
    expect(location(response).pathname).toBe("/admin/google-integrations");
    expect(location(response).searchParams.get("connected")).toBe("1");
    const connection = (await readDatabase()).integrations.google!;
    expect(connection.email).toBe(googleEmail);
    expect(decrypt(connection.refresh_token)).toBe("test-refresh-token");
    expect(response.headers.get("set-cookie")).not.toContain(`${SESSION_COOKIE}=`);
    expect(exchange).toHaveBeenCalledWith("test-code", "test-pkce-verifier");
});

it("preserves the existing connection when Gmail/Sheets consent is incomplete", async () => {
    exchange.mockResolvedValue({ access_token: "test-access-token", refresh_token: "test-refresh-token", scope: "openid email profile" });
    const response = await callback();
    expect(location(response).searchParams.get("error")).toBe("GOOGLE_SCOPE_MISSING");
    expect((await readDatabase()).integrations.google?.email).toBe("original-owner@example.com");
});

it("preserves the connection when Google does not verify the selected email", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ email: googleEmail, email_verified: false }))));
    const response = await callback();
    expect(location(response).searchParams.get("error")).toBe("GOOGLE_EMAIL_UNVERIFIED");
    expect((await readDatabase()).integrations.google?.email).toBe("original-owner@example.com");
});

it("retains a same-account refresh token if Google does not return another one", async () => {
    await transaction(db => { db.integrations.google!.email = googleEmail; });
    exchange.mockResolvedValue({ access_token: "test-access-token", scope: GOOGLE_SCOPES.join(" ") });
    const response = await callback();
    expect(location(response).searchParams.get("connected")).toBe("1");
    expect(decrypt((await readDatabase()).integrations.google!.refresh_token)).toBe("original-refresh-token");
});

it("does not reuse another account's refresh token when switching Google accounts", async () => {
    exchange.mockResolvedValue({ access_token: "test-access-token", scope: GOOGLE_SCOPES.join(" ") });
    const response = await callback();
    expect(location(response).searchParams.get("error")).toBe("GOOGLE_OFFLINE_MISSING");
    const connection = (await readDatabase()).integrations.google!;
    expect(connection.email).toBe("original-owner@example.com");
    expect(decrypt(connection.refresh_token)).toBe("original-refresh-token");
});

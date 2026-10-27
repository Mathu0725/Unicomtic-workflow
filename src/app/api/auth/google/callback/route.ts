import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { decrypt, encrypt } from "@/lib/security/secrets";
import { getSession, safeEqual } from "@/lib/security/session";
import { exchangeGoogleCode, GOOGLE_SCOPES, GOOGLE_DRIVE_SCOPE, clearGoogleTokenCache } from "@/lib/google/oauth";
import { AppError } from "@/lib/errors/app-error";
import { transaction } from "@/lib/data/repository";
import { recordEvent, requestContext } from "@/lib/observability/logger";
export const dynamic = "force-dynamic";
export const GET = route(async req => {
    const staff = getSession(req);
    const administrator = staff && ["admin", "super_admin"].includes(staff.role);
    try {
        if (!staff) throw new AppError("SESSION_REQUIRED", "Administrator session expired.", 401);
        if (!administrator) throw new AppError("FORBIDDEN", "Only administrators can manage the Google connection.", 403);
        const cookie = req.cookies.get("google_oauth_state")?.value;
        if (!cookie) throw new AppError("OAUTH_EXPIRED", "Authorization expired.");
        let pending: any;
        try { pending = JSON.parse(decrypt(cookie)); }
        catch { throw new AppError("OAUTH_EXPIRED", "Authorization expired."); }
        if (pending?.intent !== "connect") throw new AppError("GOOGLE_CONNECTION_ONLY", "Sign in with staff credentials before connecting Google.");
        if (!Number.isFinite(pending.expires) || pending.expires < Date.now() || typeof pending.state !== "string" || typeof pending.verifier !== "string" || pending.staffEmail !== staff.email.toLowerCase() || !safeEqual(req.nextUrl.searchParams.get("state") || "", pending.state)) throw new AppError("OAUTH_STATE_INVALID", "Authorization state is invalid.");
        if (req.nextUrl.searchParams.get("error")) throw new AppError("GOOGLE_ACCESS_DECLINED", "Google access was declined.");
        const code = req.nextUrl.searchParams.get("code");
        if (!code) throw new AppError("GOOGLE_AUTH_FAILED", "Google did not return an authorization code.");
        const tokens = await exchangeGoogleCode(code, pending.verifier);
        const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000) });
        const info = await infoRes.json();
        if (!infoRes.ok || !info.email_verified || !info.email) throw new AppError("GOOGLE_EMAIL_UNVERIFIED", "Google did not verify this account.");
        const email = String(info.email).toLowerCase(), scopes = String(tokens.scope || "").split(" ");
        if (!GOOGLE_SCOPES.filter(s => s.startsWith("https:")).every(s => scopes.includes(s))) throw new AppError("GOOGLE_SCOPE_MISSING", "Required Google permissions were not granted.");
        if (pending.drive && !scopes.includes(GOOGLE_DRIVE_SCOPE)) throw new AppError("GOOGLE_DRIVE_SCOPE_MISSING", "Google Drive access was not granted.");
        // Provider calls finish before the short, retry-safe commit.
        await transaction(db => {
            const refresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : db.integrations.google?.email === email ? db.integrations.google.refresh_token : undefined;
            if (!refresh) throw new AppError("GOOGLE_OFFLINE_MISSING", "Google did not return offline access.");
            db.integrations.google = { email, refresh_token: refresh, scopes, connected_at: new Date().toISOString() };
            if (!db.integrations.admin_notification_email) db.integrations.admin_notification_email = email;
        }, { maxConflictRetries: 8 });
        clearGoogleTokenCache();
        const res = NextResponse.redirect(new URL(`/admin/google-integrations?connected=${pending.drive ? "drive" : "1"}`, req.url));
        res.cookies.delete("google_oauth_state");
        return res;
    } catch (error) {
        const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
        recordEvent(code, { status: error instanceof AppError ? error.status : 500 });
        const params = new URLSearchParams({ error: code, requestId: requestContext.getStore()?.requestId || "" });
        if (!administrator) params.set("returnTo", "/admin/google-integrations");
        const res = NextResponse.redirect(new URL(`${administrator ? "/admin/google-integrations" : "/login"}?${params}`, req.url));
        res.cookies.delete("google_oauth_state");
        return res;
    }
}, false, { database: false });

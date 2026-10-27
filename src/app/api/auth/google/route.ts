import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { route } from "@/lib/http";
import { googleConfig, GOOGLE_SCOPES, GOOGLE_DRIVE_SCOPE } from "@/lib/google/oauth";
import { encrypt } from "@/lib/security/secrets";
import { getSession } from "@/lib/security/session";
import { AppError } from "@/lib/errors/app-error";
export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
    const staff = getSession(req);
    if (!staff) {
        const login = new URL("/login", req.url);
        login.searchParams.set("returnTo", "/admin/google-integrations");
        return NextResponse.redirect(login);
    }
    if (!["admin", "super_admin"].includes(staff.role))
        throw new AppError("FORBIDDEN", "Only administrators can manage the Google connection.", 403);
    // Retired Google portal-login links now lead to the signed-in connection page.
    if (req.nextUrl.searchParams.get("intent") === "login")
        return NextResponse.redirect(new URL("/admin/google-integrations", req.url));
    const config = googleConfig();
    if (!config.ready)
        return NextResponse.redirect(new URL("/admin/google-integrations?error=GOOGLE_AUTH_FAILED", req.url));
    const state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
    const drive = req.nextUrl.searchParams.get("drive") === "1";
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: [...GOOGLE_SCOPES, ...(drive ? [GOOGLE_DRIVE_SCOPE] : [])].join(" "), include_granted_scopes: "true", access_type: "offline", prompt: "consent select_account", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
    const res = NextResponse.redirect(url);
    res.cookies.set("google_oauth_state", encrypt(JSON.stringify({ state, verifier, intent: "connect", drive, staffEmail: staff.email.toLowerCase(), expires: Date.now() + 600000 })), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
    return res;
}, false, { database: false });

import { getDb } from "../data/store";
import { decrypt } from "../security/secrets";
import { ProviderError, providerFailure } from "../errors/provider-error";
import { retryAfterMs } from "../client/api";
export const GOOGLE_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/spreadsheets"];
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export function hasDriveAccess() {
    const scopes = getDb().integrations.google?.scopes;
    return Array.isArray(scopes) && scopes.includes(GOOGLE_DRIVE_SCOPE);
}
export function googleConfig() {
    const clientId = process.env.GOOGLE_CLIENT_ID || "", clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return { clientId, clientSecret, redirectUri: `${appUrl.replace(/\/$/, "")}/api/auth/google/callback`, ready: Boolean(clientId && clientSecret && !clientId.includes("your-")) };
}
export async function exchangeGoogleCode(code: string, verifier: string) {
    const { clientId, clientSecret, redirectUri } = googleConfig();
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
        signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok)
        throw new ProviderError("GOOGLE_AUTH_FAILED", "Google authorization failed. Restart sign-in and review the consent configuration.", "blocked", 0, "reconnect_google");
    return data;
}
const cache = new Map<string, {
    token: string;
    expires: number;
}>();
export function clearGoogleTokenCache() { cache.clear(); }
export async function googleAccessToken() {
    const connection = getDb().integrations.google;
    if (!connection)
        throw new ProviderError("GOOGLE_NOT_CONNECTED", "Connect Google in Google Integrations.", "blocked", 0, "reconnect_google");
    const cached = cache.get(connection.refresh_token);
    if (cached && cached.expires > Date.now())
        return cached.token;
    const { clientId, clientSecret, ready } = googleConfig();
    if (!ready)
        throw new ProviderError("GOOGLE_NOT_CONFIGURED", "Google OAuth needs administrator configuration.", "blocked");
    let refreshToken: string;
    try { refreshToken = decrypt(connection.refresh_token); }
    catch { throw new ProviderError("GOOGLE_TOKEN_UNREADABLE", "Google authorization cannot be read. Check the server key or reconnect Google.", "blocked", 0, "reconnect_google"); }
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
        signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (!response.ok)
        throw new ProviderError(data.error === "invalid_grant" ? "GOOGLE_AUTH_REVOKED" : "GOOGLE_TOKEN_FAILED", data.error === "invalid_grant" ? "Google authorization expired or was revoked. Reconnect Google." : "Google token refresh failed. Review the OAuth connection.", response.status >= 500 || response.status === 429 ? "temporary" : "blocked", retryAfterMs(response.headers.get("retry-after")), "reconnect_google");
    if (!data.access_token || !Number.isFinite(Number(data.expires_in))) throw new ProviderError("GOOGLE_TOKEN_FAILED", "Google returned an invalid authorization response.", "temporary");
    cache.set(connection.refresh_token, { token: data.access_token, expires: Date.now() + Math.max(0, data.expires_in - 120) * 1000 });
    return data.access_token as string;
}
export async function googleRequest(url: string, init: RequestInit = {}) {
    const token = await googleAccessToken();
    let response: Response;
    try { response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(10000) }); }
    catch (error) { throw providerFailure(error, url.includes("gmail.googleapis.com") && url.endsWith("/send")); }
    let data: any;
    try { data = await response.json(); }
    catch { throw new ProviderError("GOOGLE_INVALID_RESPONSE", "Google did not return a valid confirmation.", url.endsWith("/send") && response.ok ? "uncertain" : "temporary"); }
    if (!response.ok) {
        const reasons = (data.error?.errors || []).map((item: any) => item.reason).join(" ");
        if (url.includes("gmail.googleapis.com") && /Mail sending|daily.*sending|sending.*limit|dailyLimitExceeded/i.test(`${reasons} ${data.error?.message || ""}`)) throw new ProviderError("EMAIL_PROVIDER_DAILY_LIMIT", "Google's daily sending limit was reached. Email sending is paused for 24 hours; unsent messages remain queued.", "temporary", Math.max(86400000, retryAfterMs(response.headers.get("retry-after"))));
        if (response.status === 429 || /rateLimit|quota|dailyLimit/i.test(reasons)) throw new ProviderError("GOOGLE_RATE_LIMITED", "Google quota is temporarily exhausted. Jobs will retry later.", "temporary", Math.max(60000, retryAfterMs(response.headers.get("retry-after"))));
        if (response.status === 401) { cache.clear(); throw new ProviderError("GOOGLE_AUTH_REVOKED", "Google authorization was rejected. Reconnect Google.", "blocked", 0, "reconnect_google"); }
        if (response.status === 403 && url.includes("/drive/") && /accessNotConfigured|SERVICE_DISABLED/i.test(JSON.stringify(data.error))) throw new ProviderError("DRIVE_API_DISABLED", "Enable Google Drive API in this OAuth application's Google Cloud project, then try again.", "blocked");
        if (response.status === 403) throw new ProviderError("GOOGLE_ACCESS_DENIED", "Google denied access. Check granted permissions, enabled APIs and the selected file or spreadsheet.", "blocked", 0, "reconnect_google");
        if (response.status === 404 && url.includes("/drive/")) throw new ProviderError("DRIVE_FILE_UNAVAILABLE", "The Drive file or documents folder is unavailable. Check the connected account and folder access.", "blocked");
        if (response.status === 409 && url.includes("/drive/")) throw new ProviderError("DRIVE_FILE_EXISTS", "This upload already has a Drive file. Its saved details will be checked.", "blocked");
        if (response.status === 404 || response.status === 400 && url.includes("sheets.googleapis.com")) throw new ProviderError("SHEET_TARGET_INVALID", "The spreadsheet or tab is unavailable. Check the effective destination and sharing permissions.", "blocked");
        if (response.status >= 500) throw new ProviderError("GOOGLE_UNAVAILABLE", "Google is temporarily unavailable. Jobs will retry later.", "temporary", retryAfterMs(response.headers.get("retry-after")));
        throw new ProviderError("GOOGLE_REQUEST_REJECTED", "Google rejected this request. Review the message or destination configuration.", "permanent");
    }
    return data;
}

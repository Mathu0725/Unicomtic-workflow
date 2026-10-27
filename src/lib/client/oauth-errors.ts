export const oauthMessages: Record<string, string> = {
    GOOGLE_DRIVE_SCOPE_MISSING: "Allow the requested Google Drive file permission, then connect Drive again. Your existing Google connection has been preserved.",
    OAUTH_EXPIRED: "Authorization expired. Connect Google again from Google Integrations.", OAUTH_STATE_INVALID: "Authorization could not be verified. Connect Google again from Google Integrations.", GOOGLE_ACCESS_DECLINED: "Google access was declined. Connect again when ready.", SESSION_REQUIRED: "Your administrator session expired. Sign in with your staff credentials, then connect Google again.", FORBIDDEN: "Only administrators can manage the Google connection.", GOOGLE_EMAIL_UNVERIFIED: "Google did not verify this email account.", GOOGLE_SCOPE_MISSING: "Grant both Gmail sending and Google Sheets permissions.", GOOGLE_OFFLINE_MISSING: "Google did not return offline access. Reconnect and allow access.", GOOGLE_ACCOUNT_FORBIDDEN: "Sign in with your staff email and password, then connect Google from Google Integrations.", GOOGLE_CONNECTION_ONLY: "Sign in with your staff email and password, then connect Google from Google Integrations.", GOOGLE_AUTH_FAILED: "Google authorization failed. Review the consent screen, test users and redirect URI.", INTERNAL_ERROR: "Google connection could not complete. Try again or contact admissions with the support reference.", DATABASE_UNAVAILABLE: "Admissions storage is unavailable. Please connect Google again later.",
};
export function oauthMessage(search: string) {
    const params = new URLSearchParams(search), code = params.get("error");
    if (!code) return "";
    const reference = params.get("requestId");
    return `${oauthMessages[code] || oauthMessages.INTERNAL_ERROR}${reference && /^[a-f0-9-]{36}$/.test(reference) ? ` Support reference: ${reference}` : ""}`;
}

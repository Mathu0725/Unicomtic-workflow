import { AppError, type RecoveryAction } from "./app-error";
export type FailureKind = "temporary" | "blocked" | "permanent" | "uncertain";
export class ProviderError extends AppError {
    constructor(code: string, message: string, public kind: FailureKind, public retryAfterMs = 0, action?: RecoveryAction) {
        super(code, message, kind === "permanent" ? 422 : 503, {}, kind === "temporary", action || (kind === "blocked" ? "repair_configuration" : kind === "temporary" ? "retry" : "contact_admissions"));
        this.name = "ProviderError";
    }
}
export function providerFailure(error: unknown, sendingEmail = false): ProviderError {
    if (error instanceof ProviderError) return error;
    const e = error as any;
    if (/daily.*sending|sending.*quota|daily.*mail.*limit|5\.4\.5/i.test(String(e?.response || e?.message || ""))) return new ProviderError("EMAIL_PROVIDER_DAILY_LIMIT", "The provider's daily sending limit was reached. Email sending is paused for 24 hours; unsent messages remain queued.", "temporary", 86400000);
    if (e?.code === "EAUTH" || e?.responseCode === 535) return new ProviderError("SMTP_AUTH_FAILED", "SMTP authentication failed. Check the account and app password.", "blocked");
    if (["ETLS", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(e?.code)) return new ProviderError("SMTP_TLS_FAILED", "The mail server TLS configuration needs repair.", "blocked");
    if (e?.code === "EENVELOPE" || e?.responseCode >= 500 && e?.responseCode < 600) return new ProviderError("RECIPIENT_REJECTED", "The mail server rejected this recipient or message. Check the address and provider policy.", "permanent");
    const interrupted = ["TimeoutError", "AbortError", "TypeError"].includes(e?.name) || ["ETIMEDOUT", "ECONNRESET", "ESOCKET", "EPIPE", "UND_ERR_SOCKET"].includes(e?.code || e?.cause?.code);
    if (sendingEmail && !["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNECTION"].includes(e?.code) && !(e?.responseCode >= 400 && e?.responseCode < 500)) return new ProviderError("SEND_UNCERTAIN", "The provider did not confirm this send. Check Sent/provider logs before retrying.", "uncertain");
    return new ProviderError("PROVIDER_UNAVAILABLE", "The provider is temporarily unavailable. Saved records remain safe.", "temporary", Number(e?.retryAfterMs) || 0);
}

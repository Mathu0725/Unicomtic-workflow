import { expect, it } from "vitest";
import { providerFailure, ProviderError } from "../../src/lib/errors/provider-error";
it("blocks authentication/TLS repairs and permanently fails a rejected recipient", () => {
    expect(providerFailure({ code: "EAUTH", message: "secret-password" })).toMatchObject({ code: "SMTP_AUTH_FAILED", kind: "blocked", retryable: false });
    expect(providerFailure({ code: "ERR_TLS_CERT_ALTNAME_INVALID" }).kind).toBe("blocked");
    expect(providerFailure({ code: "EENVELOPE", responseCode: 550 }).kind).toBe("permanent");
});
it("keeps uncertain sends separate from pre-send failures and quota backoff", () => {
    expect(providerFailure(new Error("unknown send result"), true).kind).toBe("uncertain");
    expect(providerFailure({ code: "ECONNREFUSED" }, true).kind).toBe("temporary");
    const quota = new ProviderError("GOOGLE_RATE_LIMITED", "Try later.", "temporary", 600000);
    expect(providerFailure(quota, true)).toBe(quota);
});
it("recognizes SMTP daily quota errors before treating 550 as a rejected recipient", () => {
    const result = providerFailure({ responseCode: 550, response: "550 5.4.5 Daily user sending quota exceeded. private-provider-detail" }, true);
    expect(result).toMatchObject({ code: "EMAIL_PROVIDER_DAILY_LIMIT", kind: "temporary", retryAfterMs: 86400000 });
    expect(result.message).not.toContain("private-provider-detail");
});

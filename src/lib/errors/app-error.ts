export type RecoveryAction = "edit_fields" | "track_record" | "refresh_workshops" | "sign_in" | "reconnect_google" | "repair_configuration" | "retry" | "contact_admissions";

/** Only approved messages belong here. Never pass a provider/database exception as the message. */
export class AppError extends Error {
    constructor(public code: string, message: string, public status = 400, public details: Record<string, any> = {}, public retryable = false, public action?: RecoveryAction) {
        super(message);
        this.name = "AppError";
    }
}

export function statusCode(status: number) {
    return ({ 400: "VALIDATION_FAILED", 401: "SESSION_REQUIRED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "VERSION_CONFLICT", 413: "PAYLOAD_TOO_LARGE", 429: "RATE_LIMITED", 503: "SERVICE_UNAVAILABLE" } as Record<number, string>)[status] || "INTERNAL_ERROR";
}

export function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
    const fields: Record<string, string[]> = {};
    for (const issue of issues) (fields[issue.path.map(String).join(".") || "form"] ||= []).push(issue.message);
    return fields;
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, fieldErrors, statusCode } from "./app-error";
import { recordEvent, requestContext, errorMetadata } from "../observability/logger";

export function errorResponse(error: unknown, requestId = requestContext.getStore()?.requestId || randomUUID()) {
    let failure: AppError;
    if (error instanceof AppError) failure = error;
    else if (error instanceof ZodError) failure = new AppError("VALIDATION_FAILED", "Check the highlighted fields.", 400, { fieldErrors: fieldErrors(error.issues), errors: error.flatten().fieldErrors }, false, "edit_fields");
    else failure = new AppError("INTERNAL_ERROR", "We could not complete this request. Please contact admissions with the support reference.", 500, {}, false, "contact_admissions");
    recordEvent(failure.code, { status: failure.status, ...(error instanceof AppError || error instanceof ZodError ? {} : errorMetadata(error)) });
    const fields = failure.details.fieldErrors || failure.details.errors;
    const normalizedFields = fields ? Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value : [String(value)]])) : undefined;
    return NextResponse.json({ ...failure.details, success: false, code: failure.code, message: failure.message, requestId, retryable: failure.retryable, action: failure.action, ...(fields ? { fieldErrors: normalizedFields, errors: failure.details.errors || normalizedFields } : {}) }, {
        status: failure.status,
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId, ...(failure.retryable ? { "Retry-After": "2" } : {}) },
    });
}

/** Adapt older returned errors during migration; discard all unknown 5xx details. */
export async function normalizeResponse(response: Response, requestId: string) {
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("Cache-Control", "no-store");
    if (response.status < 400) return response;
    let body: any = {};
    try { body = await response.clone().json(); } catch { }
    if (body.requestId && body.code) return response;
    if (response.status >= 500) return errorResponse(new AppError("INTERNAL_ERROR", "The service could not complete this request. Please try again later or contact admissions with the support reference.", response.status), requestId);
    return errorResponse(new AppError(body.code || statusCode(response.status), body.message || "Check your request and try again.", response.status, body, false, response.status === 401 ? "sign_in" : "edit_fields"), requestId);
}

export class ApiError extends Error {
    constructor(message: string, public status = 0, public code = "NETWORK_ERROR", public requestId?: string, public fields?: Record<string, string[]>, public retryable = false) {
        super(requestId && status >= 500 ? `${message} Support reference: ${requestId}` : message);
        this.name = "ApiError";
    }
}
export function retryAfterMs(value: string | null, now = Date.now()) {
    if (!value) return 0;
    const delay = /^\d+(\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
    return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 30000) {
    try {
        return await fetch(url, { cache: "no-store", ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
    } catch (error: any) {
        if (init.signal?.aborted) throw error;
        const timeout = ["TimeoutError", "AbortError"].includes(error?.name);
        throw new ApiError(timeout ? "The server took too long to respond. Your request may have been saved. Check its status before repeating this action." : "Could not reach admissions. Check your connection and try again.", 0, timeout ? "REQUEST_TIMEOUT" : "NETWORK_ERROR");
    }
}
export async function readJson(response: Response) {
    let data: any;
    try { data = await response.json(); }
    catch {
        throw new ApiError("Admissions returned an unreadable response. Your request may have been saved. Check its status before repeating this action.", response.status || 502, "INVALID_RESPONSE", response.headers.get("X-Request-ID") || undefined);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError("Admissions returned an invalid response. Please try again later.", response.status, "INVALID_RESPONSE");
    return data;
}
export function responseError(response: Response, data: any) {
    return new ApiError(data.message || "Could not complete this request.", response.status, data.code, data.requestId || response.headers.get("X-Request-ID") || undefined, data.fieldErrors || data.errors, data.retryable === true);
}
/** Legacy callers can continue reading .json(); failures always reach their catch handler. */
export async function apiResponse(url: string, init: RequestInit = {}) {
    const response = await fetchWithTimeout(url, init);
    const data = await readJson(response.clone());
    if (!response.ok || data.success === false) {
        if (response.status === 401 && data.code === "SESSION_REQUIRED" && typeof window !== "undefined" && !url.startsWith("/api/auth/")) window.dispatchEvent(new Event("admissions:session-expired"));
        throw responseError(response, data);
    }
    return response;
}
export async function api(url: string, body?: any, method = "POST", signal?: AbortSignal) {
    const response = await apiResponse(url, { ...(body === undefined ? {} : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), signal });
    return readJson(response);
}

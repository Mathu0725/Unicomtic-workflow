import { stableJson } from "../json";
import { ApiError, fetchWithTimeout, retryAfterMs } from "./api";

const pending = new Map<string, { body: string; key: string; unresolved?: boolean }>();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function restore(url: string) {
    if (pending.has(url)) return;
    try {
        const saved = JSON.parse(sessionStorage.getItem(`admissions_retry:${url}`) || "null");
        if (saved?.expires > Date.now() && typeof saved.body === "string" && saved.body.length <= 128 * 1024 && /^[a-f0-9]{48}$/.test(saved.key)) pending.set(url, { body: saved.body, key: saved.key, unresolved: saved.unresolved === true });
    } catch { }
}
function persist(url: string) {
    const saved = pending.get(url);
    if (saved) try { sessionStorage.setItem(`admissions_retry:${url}`, JSON.stringify({ ...saved, expires: Date.now() + 86400000 })); } catch { }
}

async function retryKey(url: string, body: string) {
    restore(url);
    const previous = pending.get(url);
    if (previous?.body === body) return previous.key;
    if (previous?.unresolved) throw new ApiError("The earlier submission has an unknown outcome. Use Resolve pending submission before editing and submitting again.", 409, "SUBMISSION_UNRESOLVED");
    let fingerprint = "";
    if (globalThis.crypto?.subtle) {
        const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
        fingerprint = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
    }
    const storageKey = `admissions_retry:${url}`;
    if (fingerprint) {
        try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
            if (saved?.fingerprint === fingerprint && saved.expires > Date.now()) {
                pending.set(url, { body, key: saved.key });
                return saved.key as string;
            }
        } catch { /* Private browsing may disable sessionStorage. */ }
    }
    const key = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, "0")).join("");
    pending.set(url, { body, key });
    if (fingerprint) {
        try { sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key, expires: Date.now() + 86400000 })); } catch { }
    }
    return key;
}

export async function submitRequest(url: string, payload: unknown) {
    const body = stableJson(payload), key = await retryKey(url, body);
    pending.set(url, { body, key, unresolved: true });
    persist(url);
    for (let attempt = 0;; attempt++) {
        try {
            const response = await fetchWithTimeout(url, {
                method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body,
                signal: AbortSignal.timeout(30000),
            });
            let data: any;
            try { data = await response.clone().json(); } catch { }
            if (response.ok && data?.success === true || response.status >= 400 && response.status < 500 && response.status !== 429 && data?.success === false) pending.get(url)!.unresolved = false;
            persist(url);
            if (![429, 503].includes(response.status) || data?.retryable === false || attempt >= 3) return response;
            const wait = retryAfterMs(response.headers.get("retry-after"));
            if (wait > 10000) return response;
            await sleep(Math.max(500 * 2 ** attempt, wait) + Math.random() * 300);
        } catch (error) {
            if (attempt >= 3) throw error;
            await sleep(500 * 2 ** attempt + Math.random() * 300);
        }
    }
}
export function pendingPayload(url: string): unknown | undefined {
    restore(url);
    const attempt = pending.get(url);
    return attempt?.unresolved ? JSON.parse(attempt.body) : undefined;
}

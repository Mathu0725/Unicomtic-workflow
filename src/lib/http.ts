import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConflictError, DatabaseBusyError, readDatabase, transaction } from "./data/repository";
import { databaseContext, type DatabaseStore } from "./data/store";
import { readCandidateClaims, requireCandidateAccess } from "./security/candidate-access";
import { canAccess, getSession } from "./security/session";
import { processOutbox } from "./jobs/outbox";
import { stableJson } from "./json";
import { AppError, statusCode } from "./errors/app-error";
import { errorResponse, normalizeResponse } from "./errors/response";
import { recordEvent, requestContext } from "./observability/logger";
import { MULTIPART_MAX_BYTES } from "./upload-limits";

export class RequestError extends AppError {
    constructor(message: string, status = 400, details: Record<string, any> = {}) {
        super(details.code || statusCode(status), message, status, details, details.retryable === true, details.action);
    }
}
type RouteOptions = { submission?: boolean; transactionalGet?: boolean; processJobs?: boolean; readOnly?: boolean; database?: boolean; bodyLimit?: number; candidate?: boolean; authorize?: (req: NextRequest, context: any, db: DatabaseStore) => string | void };

async function requestBody(req: NextRequest, limit: number) {
    const deadline = Date.now() + 15000;
    if (Number(req.headers.get("content-length")) > limit) throw new RequestError("Submission is too large. Please shorten long answers.", 413);
    const reader = req.body?.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
        try {
            while (true) {
                let timer: ReturnType<typeof setTimeout> | undefined;
                const part = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new AppError("REQUEST_TIMEOUT", "The request took too long to upload. Please try again.", 408)); }, Math.max(1, deadline - Date.now())); })]).finally(() => clearTimeout(timer));
                if (part.done) break;
                size += part.value.byteLength;
                if (size > limit) { await reader.cancel(); throw new RequestError("Submission is too large. Please shorten long answers.", 413); }
                chunks.push(part.value);
            }
        } finally { reader.releaseLock(); }
    }
    const bytes = Buffer.concat(chunks);
    // Next's incoming request may expose an empty stream for a bodyless POST.
    // Queue triggers and manual sync actions intentionally do not carry JSON.
    if (!bytes.length && !req.headers.get("content-type")?.includes("application/json")) return undefined;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) return bytes;
    try {
        const parsed = JSON.parse(bytes.toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        return stableJson(parsed);
    } catch { throw new RequestError("Enter a valid JSON submission.", 400, { code: "MALFORMED_JSON" }); }
}

const bursts = new Map<string, { count: number; expires: number }>();
function limitBurst(req: NextRequest, submission?: boolean) {
    if (!submission && req.nextUrl.pathname !== "/api/auth/login") return;
    const now = Date.now();
    if (bursts.size > 2000) for (const [key, value] of bursts) if (value.expires <= now) bursts.delete(key);
    // Deliberately accommodate shared campus IPs. Distributed deployments also need an edge limit.
    const key = submission ? "admissions" : `login:${(req.headers.get("x-forwarded-for") || "local").split(",")[0].slice(0, 80)}`;
    const bucket = bursts.get(key);
    if (!bucket || bucket.expires <= now) { bursts.set(key, { count: 1, expires: now + 60000 }); return; }
    if (++bucket.count > (submission ? 2000 : 30)) throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.", 429, {}, true, "retry");
}

export function route<T>(handler: (req: NextRequest, context: T) => Promise<Response>, admin = false, options: RouteOptions = {}) {
    // Next 16 supplies promised route params. Keep handlers operating on their
    // resolved context, including callers in isolated integration tests.
    return async (req: NextRequest, rawContext: any) => {
      const context: T = rawContext?.params ? { ...rawContext, params: await rawContext.params } : rawContext;
      const requestId = randomUUID(), started = Date.now();
      // Dynamic route IDs/slugs and query strings are excluded from routine logs.
      const routeName = req.nextUrl.pathname.replace(/\/(forms)\/[^/]+/, "/$1/[id]");
      return requestContext.run({ requestId, route: routeName }, async () => {
        const finish = async (response: Response) => { recordEvent("REQUEST_COMPLETED", { status: response.status, durationMs: Date.now() - started }); return normalizeResponse(response, requestId); };
        try {
            if (process.env.NODE_ENV === "production" && ((process.env.APP_SECRET?.length || 0) < 32 || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) && !req.nextUrl.pathname.startsWith("/api/health")) throw new AppError("SERVER_NOT_CONFIGURED", "Admissions security configuration needs administrator attention.", 503, {}, false, "contact_admissions");
            if (admin) {
                const user = getSession(req);
                if (!user) throw new AppError("SESSION_REQUIRED", "Please sign in.", 401, {}, false, "sign_in");
                if (!canAccess(user, req.nextUrl.pathname)) throw new AppError("FORBIDDEN", "This role cannot access this module.", 403);
            }
            if (!["GET", "HEAD"].includes(req.method)) {
                const origin = req.headers.get("origin");
                const hostOrigin = `${req.nextUrl.protocol}//${req.headers.get("host")}`;
                if (origin && origin !== req.nextUrl.origin && origin !== hostOrigin && origin !== process.env.NEXT_PUBLIC_APP_URL)
                    throw new RequestError("Request origin is not allowed.", 403, { code: "ORIGIN_REJECTED" });
            }
            limitBurst(req, options.submission);
            if (options.candidate) readCandidateClaims(req);
            const body = !["GET", "HEAD"].includes(req.method) && req.body ? await requestBody(req, options.bodyLimit || (options.submission ? 128 * 1024 : req.headers.get("content-type")?.includes("multipart/form-data") ? MULTIPART_MAX_BYTES : 2 * 1024 * 1024)) : undefined;
            const freshRequest = () => {
                const attempt = ["GET", "HEAD"].includes(req.method) ? req : new NextRequest(req.url, { method: req.method, headers: req.headers, ...(body === undefined ? {} : { body }) });
                const parse = attempt.json.bind(attempt);
                attempt.json = async () => {
                    try { return await parse(); }
                    catch (error) { if (error instanceof SyntaxError) throw new RequestError("Enter a valid JSON request.", 400, { code: "MALFORMED_JSON" }); throw error; }
                };
                return attempt;
            };
            if (options.database === false) return await finish(await handler(freshRequest(), context));
            if (options.readOnly || ["GET", "HEAD"].includes(req.method) && !options.transactionalGet) {
                const db = await readDatabase();
                if (options.candidate) requireCandidateAccess(db, req);
                options.authorize?.(req, context, db);
                return await finish(await databaseContext.run(db, () => handler(freshRequest(), context)));
            }

            // Read outside the lock. Pure submission handlers get a fresh Request on each CAS retry.
            const key = options.submission ? req.headers.get("idempotency-key") : null;
            if (key && !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new RequestError("Invalid submission retry key.");
            const requestHash = body ? createHash("sha256").update(body).digest("hex") : "";
            const response = await transaction(async db => {
                const candidate = options.candidate ? requireCandidateAccess(db, req) : undefined;
                const authorizedScope = options.authorize?.(req, context, db);
                const scope = candidate?.registration.id || authorizedScope;
                // Candidate receipts must remain private even if another verified
                // candidate learns both the retry key and the original answers.
                const keyHash = key ? createHash("sha256").update(`${req.nextUrl.pathname}${scope ? `:${scope}` : ""}:${key}`).digest("hex") : undefined;
                if (keyHash) {
                    const receipt = db.submissionReceipts.find(r => r.key_hash === keyHash && r.expires_at > Date.now());
                    if (receipt) {
                        if (receipt.request_hash !== requestHash) throw new RequestError("This retry key belongs to a different submission. Resolve the original attempt before changing the form.", 409, { code: "IDEMPOTENCY_MISMATCH" });
                        return NextResponse.json(receipt.response, { status: receipt.status, headers: { "Idempotency-Replayed": "true" } });
                    }
                }
                const attempt = freshRequest();
                const result = await handler(attempt, context);
                if (keyHash && result.status >= 200 && result.status < 300) {
                    db.submissionReceipts = db.submissionReceipts.filter(r => r.expires_at > Date.now());
                    db.submissionReceipts.push({ key_hash: keyHash, request_hash: requestHash, status: result.status, response: await result.clone().json(), expires_at: Date.now() + 86400000 });
                }
                return result;
            }, { maxConflictRetries: options.submission ? 12 : 0 });
            // A durable worker owns provider calls. Applicants wait only for their database commit.
            if (options.processJobs && response.status < 400) {
                try { await processOutbox(40, 5000); }
                catch { recordEvent("WORKER_DISPATCH_FAILED", { status: 503 }); }
            }
            return await finish(response);
        } catch (err: unknown) {
            const busy = err instanceof DatabaseBusyError || (options.submission && err instanceof ConflictError);
            return errorResponse(busy ? new AppError("DATABASE_BUSY", "Admissions is busy. Please retry with the same submission.", 503, {}, true, "retry") : err instanceof ConflictError ? new AppError("VERSION_CONFLICT", "These records changed. Reload and review before saving again.", 409) : err, requestId);
        }
      });
    };
}

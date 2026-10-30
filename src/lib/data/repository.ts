import { mkdir, readFile, rename, open, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseStore, databaseContext } from "./store";
import { createAdminClient } from "../supabase/admin";
import { AppError } from "../errors/app-error";
import { recordEvent } from "../observability/logger";
type Snapshot = {
    version: number;
    data: DatabaseStore;
};
export function storageMode() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    return url && !/mock|dummy|your-project/.test(url) ? "supabase" : "local";
}
export function initialDatabase(): DatabaseStore {
    const db = new DatabaseStore();
    if (process.env.SEED_DEMO_DATA !== "true") {
        db.students = [];
        db.registrations = [];
        db.applications = [];
        db.workshops = [];
        db.attendance = [];
        db.exams = [];
        db.examResults = [];
        db.interviews = [];
        db.interviewCandidates = [];
        db.interviewEvaluations = [];
        db.selectionDecisions = [];
        db.emailJobs = [];
        db.auditLogs = [];
        db.sheetSyncJobs = [];
        db.formSubmissions = [];
        db.customForms.forEach(f => {
            f.submissions_count = 0;
            f.google_form_config = { enabled: false, response_mode: "webhook", webhook_secret: randomUUID() };
            f.google_sheets_config = { enabled: false, sheet_id: "", sheet_name: f.type === "application" ? "Applications" : "Registrations", auto_sync: true };
            f.email_automation.admin_emails = [];
        });
    }
    return db;
}
function hydrate(data: DatabaseStore): DatabaseStore {
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.students) || !Array.isArray(data.registrations) || !Array.isArray(data.campaigns))
        throw new AppError("STORAGE_CORRUPT", "Admissions records need administrator attention. No data was reset.", 500, {}, false, "contact_admissions");
    const defaults = initialDatabase();
    const migratedArrays = new Set(["outbox", "workshopBookings", "submissionReceipts", "policyVersions", "staffAccounts", "documentUploads", "candidateAccessAttempts", "customEmailTemplates"]);
    if (Object.keys(defaults).some(key => Array.isArray((defaults as any)[key]) && (!migratedArrays.has(key) || key in data) && !Array.isArray((data as any)[key])) || data.settings && (typeof data.settings.termsContent !== "string" || !Number.isSafeInteger(data.settings.version)) || data.emailTemplates && (typeof data.emailTemplates !== "object" || Array.isArray(data.emailTemplates)))
        throw new AppError("STORAGE_CORRUPT", "Admissions records need administrator attention. No data was reset.", 500, {}, false, "contact_admissions");
    return Object.assign(defaults, data, {
        settings: data.settings || defaults.settings,
        integrations: data.integrations || { email_provider: "gmail", admin_notification_email: "" },
        outbox: data.outbox || [], workshopBookings: data.workshopBookings || [],
        submissionReceipts: data.submissionReceipts || [], queueControl: data.queueControl || {},
    });
}
async function load(): Promise<Snapshot> {
    if (storageMode() === "supabase") {
        const client = createAdminClient();
        const { data, error } = await client.from("platform_state").select("version,data").eq("id", "admissions").maybeSingle();
        if (error)
            throw new AppError("DATABASE_UNAVAILABLE", "Admissions storage is temporarily unavailable. Please retry with the same submission.", 503, {}, true, "retry");
        if (!data && process.env.NODE_ENV === "production" && process.env.ALLOW_DATABASE_INITIALIZE !== "true") throw new AppError("STORAGE_MISSING", "Admissions records are missing. Restore the database or explicitly authorize first-time initialization.", 503, {}, false, "contact_admissions");
        if (data && (!Number.isSafeInteger(Number(data.version)) || Number(data.version) < 0)) throw new AppError("STORAGE_CORRUPT", "Admissions storage metadata needs administrator attention.", 500);
        return data ? { version: Number(data.version), data: hydrate(data.data) } : { version: -1, data: initialDatabase() };
    }
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_STORAGE !== "true")
        throw new AppError("STORAGE_NOT_CONFIGURED", "Admissions storage needs administrator configuration.", 503, {}, false, "contact_admissions");
    try {
        const result = JSON.parse(await readFile(statePath(), "utf8"));
        if (!Number.isSafeInteger(result.version) || result.version < 0) throw new SyntaxError("Invalid snapshot version");
        return { ...result, data: hydrate(result.data) };
    }
    catch (e: any) {
        if (e.code !== "ENOENT")
            throw storageError(e);
        let initialized = false;
        try { await readFile(`${statePath()}.initialized`); initialized = true; }
        catch (markerError: any) { if (markerError.code !== "ENOENT") throw storageError(markerError); }
        if (initialized || process.env.NODE_ENV === "production" && process.env.ALLOW_DATABASE_INITIALIZE !== "true") throw new AppError("STORAGE_MISSING", "Admissions records are missing. Restore the verified backup before accepting submissions.", 503, {}, false, "contact_admissions");
        return { version: -1, data: initialDatabase() };
    }
}
const statePath = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "platform.json");
async function save(snapshot: Snapshot, serialized: string): Promise<void> {
    if (storageMode() === "supabase") {
        const { data, error } = await createAdminClient().rpc("save_platform_state", {
            expected_version: snapshot.version, next_data: snapshot.data,
        });
        if (error)
            throw new AppError("COMMIT_UNCONFIRMED", "Storage could not confirm this save. Resolve the original submission before starting another.", 503, {}, true, "retry");
        if (!data)
            throw new ConflictError();
        return;
    }
    await mkdir(path.dirname(statePath()), { recursive: true });
    const temp = `${statePath()}.${randomUUID()}.tmp`;
    try {
        const handle = await open(temp, "wx", 0o600);
        try {
            await handle.writeFile(`{"version":${snapshot.version + 1},"data":${serialized}}`);
            await handle.sync();
        } finally { await handle.close(); }
        for (let attempt = 0;; attempt++) {
            try { await rename(temp, statePath()); break; }
            catch (error: any) {
                if (!["EPERM", "EBUSY", "EACCES"].includes(error.code) || attempt >= 20) throw error;
                await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1) + Math.random() * 10));
            }
        }
        try {
            const marker = await open(`${statePath()}.initialized`, "wx", 0o600);
            try { await marker.writeFile("initialized\n"); await marker.sync(); } finally { await marker.close(); }
        } catch (error: any) { if (error.code !== "EEXIST") recordEvent("STORAGE_MARKER_FAILED", { status: 503 }); }
    } catch (error) { throw storageError(error); }
    finally {
        // Cleanup cannot turn a completed rename into a reported save failure.
        await unlink(temp).catch(() => {});
    }
}
function storageError(error: any): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof SyntaxError) return new AppError("STORAGE_CORRUPT", "Admissions records need administrator attention. No data was reset.", 500, {}, false, "contact_admissions");
    const code = error?.code === "ENOSPC" ? "STORAGE_FULL" : ["EACCES", "EPERM"].includes(error?.code) ? "STORAGE_PERMISSION" : "DATABASE_UNAVAILABLE";
    return new AppError(code, "Admissions storage is unavailable. Please contact admissions or retry the original submission later.", 503, {}, code === "DATABASE_UNAVAILABLE", "contact_admissions");
}
export class ConflictError extends Error {
    constructor() { super("Another request updated these records. Please submit again; no duplicate was saved."); }
}
let chain: Promise<unknown> = Promise.resolve();
export class DatabaseBusyError extends Error {
    constructor() { super("Admissions is busy. Please retry in a moment; saved submissions remain safe."); }
}
let pendingTransactions = 0;
// The file lock also covers separate local Next.js workers. Supabase uses compare-and-swap.
async function localLock(): Promise<() => Promise<void>> {
    if (storageMode() !== "local")
        return async () => { };
    await mkdir(path.dirname(statePath()), { recursive: true });
    const file = `${statePath()}.lock`, deadline = Date.now() + 15000;
    while (true) {
        try {
            const handle = await open(file, "wx");
            try { await handle.writeFile(JSON.stringify({ pid: process.pid, token: randomUUID() })); }
            catch (error) { await handle.close(); await unlink(file); throw error; }
            return async () => { await handle.close(); await unlink(file); };
        }
        catch (e: any) {
            if (e.code !== "EEXIST")
                throw e;
            // Remove only a lock whose recorded owner is definitely no longer running.
            try {
                const contents = await readFile(file, "utf8"), owner = JSON.parse(contents);
                if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
                    try { process.kill(owner.pid, 0); }
                    catch (ownerError: any) {
                        if (ownerError.code === "ESRCH") {
                            // Only one reaper may check/remove a dead owner's lock.
                            // Re-check under that guard so a fresh lock is never removed.
                            const reaperFile = `${file}.recovery`;
                            const reaper = await open(reaperFile, "wx");
                            try {
                                if (await readFile(file, "utf8") === contents) { await unlink(file); continue; }
                            } finally { await reaper.close(); await unlink(reaperFile); }
                        }
                    }
                }
            } catch { /* An active writer may still be writing its ownership record. */ }
            if (Date.now() > deadline) throw new DatabaseBusyError();
            await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 30));
        }
    }
}
async function transactionOnce<T>(fn: (db: DatabaseStore) => Promise<T> | T, deadline: number): Promise<T> {
    if (pendingTransactions >= 1000) throw new DatabaseBusyError();
    pendingTransactions++;
    let release!: () => void;
    const previous = chain;
    chain = new Promise<void>(resolve => { release = resolve; });
    await previous;
    let unlock: (() => Promise<void>) | undefined;
    try {
        if (Date.now() >= deadline) throw new DatabaseBusyError();
        unlock = await localLock();
        const snapshot = await load(), before = JSON.stringify(snapshot.data);
        const result = await databaseContext.run(snapshot.data, () => fn(snapshot.data));
        const serialized = JSON.stringify(snapshot.data);
        if (!(result instanceof Response && result.status >= 400) && (snapshot.version < 0 || before !== serialized))
            await save(snapshot, serialized);
        return result;
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^E[A-Z]+$/.test(error.code)) throw storageError(error);
        throw error;
    }
    finally {
        try {
            await unlock?.().catch(() => { recordEvent("STORAGE_LOCK_CLEANUP_FAILED", { status: 503 }); });
        }
        finally {
            pendingTransactions--;
            release();
        }
    }
}
export async function transaction<T>(fn: (db: DatabaseStore) => Promise<T> | T, options: { maxConflictRetries?: number; timeoutMs?: number } = {}): Promise<T> {
    const deadline = Date.now() + (options.timeoutMs || 30000);
    for (let attempt = 0;; attempt++) {
        try { return await transactionOnce(fn, deadline); }
        catch (error) {
            if (!(error instanceof ConflictError) || attempt >= (options.maxConflictRetries || 0)) throw error;
            if (Date.now() >= deadline) throw new DatabaseBusyError();
            await new Promise(resolve => setTimeout(resolve, Math.random() * Math.min(20 * 2 ** attempt, 300)));
        }
    }
}
export async function readDatabase() { return (await load()).data; }

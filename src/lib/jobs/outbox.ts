import { createHash, randomUUID } from "node:crypto";
import { DatabaseStore, databaseContext, getDb } from "../data/store";
import { readDatabase, transaction } from "../data/repository";
import { sendEmail, SendEmailPayload, SendEmailResult } from "../email/smtp-client";
import { googleSheetsService } from "../google/sheets-service";
import type { OutboxJob } from "../data/types";
import { providerFailure } from "../errors/provider-error";
import { requestContext, recordEvent, recoverIncident } from "../observability/logger";
import { sheetTargetChanged } from "../google/job-target";
import { reminderCohorts, reminderMatches } from "../reminders/eligibility";
import { EMAIL_DAY_MS, emailBudget, emailSender, reserveEmailDispatch, settleEmailDispatch } from "../email/sending-budget";
import { emailCandidates } from "../email/candidates";
import { secureCandidateEmail } from "../security/candidate-access";
export function enqueue(db: DatabaseStore, type: OutboxJob["type"], key: string, payload: Record<string, any>) {
    const existing = db.outbox.find(j => j.key === key);
    if (existing)
        return existing;
    const job: OutboxJob = { id: randomUUID(), key, type, payload, status: "queued", attempts: 0, created_at: new Date().toISOString(), request_id: requestContext.getStore()?.requestId };
    const blocker = db.outbox.find(j => j.status === "blocked" && j.error_code !== "CANDIDATE_EXPORT_CHANGED" && (type === "sheet" ? j.type === "sheet" && (j.payload.sheetId === payload.sheetId && j.payload.sheetName === payload.sheetName || ["GOOGLE_AUTH_REVOKED", "GOOGLE_NOT_CONNECTED", "GOOGLE_NOT_CONFIGURED", "GOOGLE_TOKEN_UNREADABLE"].includes(j.error_code || "")) : j.type === "email" && (j.error_code?.startsWith(db.integrations.email_provider === "smtp" ? "SMTP_" : "GOOGLE_"))));
    if (blocker) { job.status = "blocked"; job.error = blocker.error; job.error_code = blocker.error_code; job.repair_action = blocker.repair_action; }
    db.outbox.push(job);
    return job;
}
export function queueEmail(payload: SendEmailPayload & {
    sourceId?: string;
    decisionId?: string;
    templateId?: string;
    templateVersion?: number;
}, key?: string) {
    return enqueue(getDb(), "email", key || `mail:${payload.to}:${payload.subject}`, payload);
}
export function queueSheet(db: DatabaseStore, sheetId: string, sheetName: string, row: Record<string, any>, sourceId?: string) {
    const legacyKey = `sheet:${sheetId}:${sheetName}:${row.referenceNo}:${JSON.stringify(row)}`;
    const key = `sheet:${createHash("sha256").update(legacyKey).digest("hex")}`;
    return db.outbox.find(job => job.key === legacyKey) || enqueue(db, "sheet", key, { sheetId, sheetName, rows: [row], sourceId });
}
async function commit<T>(fn: (db: DatabaseStore) => Promise<T> | T): Promise<T> {
    return transaction(fn, { maxConflictRetries: 8 });
}
export async function processOutbox(limit = 120, timeBudgetMs = 45000, onlyJobId?: string) {
    let sent = 0, failed = 0, processed = 0, batches = 0;
    const deadline = Date.now() + Math.min(45000, timeBudgetMs);
    while (processed < limit) {
        if (Date.now() >= deadline)
            break;
        const claim = await commit(db => {
            const now = Date.now();
            if (!db.queueControl.last_worker_at || now - db.queueControl.last_worker_at > 30000) db.queueControl.last_worker_at = now;
            if (db.outbox.some(j => j.status === "queued" && j.payload.admissionsReminder)) {
                const candidates = new Map(reminderCohorts(db, now).candidates.map(c => [c.id, c]));
                for (const item of db.outbox.filter(j => j.status === "queued" && j.payload.admissionsReminder)) {
                    if (reminderMatches(item, candidates)) continue;
                    item.status = "blocked"; item.error_code = "REMINDER_SUPERSEDED";
                    item.error = "This reminder no longer matches the student's current progress or email address. Review recipients in Reminders.";
                    item.repair_action = "review_reminders";
                }
            }
            for (const item of db.outbox.filter(j => j.status === "queued" && j.type === "sheet")) if (sheetTargetChanged(db, item)) {
                item.status = "blocked"; item.error_code = "SHEET_DESTINATION_CHANGED"; item.error = "The export destination changed. Queue a new export from the form responses or Sheets Synchronization page. This original export remains paused."; item.repair_action = "repair_configuration";
            }
            for (const item of db.outbox)
                if (item.status === "sending" && Date.parse(item.lease_until || "") < now) {
                    if (item.type === "email") {
                        item.last_attempt_at ||= new Date(Date.parse(item.lease_until!) - 120000).toISOString();
                        settleEmailDispatch(db, item, "uncertain", Math.min(now, Date.parse(item.lease_until!)));
                    }
                    item.status = item.type === "email" ? "uncertain" : "queued";
                    item.error = item.type === "email" ? "Worker interrupted. Check provider before retrying this email." : "Worker interrupted. Spreadsheet references will be reconciled on retry.";
                }
            const busySheets = db.outbox.some(j => j.type === "sheet" && j.status === "sending");
            const budget = emailBudget(db, now);
            const due = (job: OutboxJob) => (!onlyJobId || job.id === onlyJobId) && job.status === "queued" && (!job.next_attempt_at || Date.parse(job.next_attempt_at) <= now);
            if (!budget.canSend) for (const item of db.outbox.filter(job => job.type === "email" && due(job))) {
                item.deferred_reason = budget.paused ? "EMAIL_PROVIDER_DAILY_LIMIT" : "EMAIL_DAILY_LIMIT";
                item.deferred_until = budget.nextAvailableAt || undefined;
            }
            const eligible = (job: OutboxJob) => due(job) && (job.type === "sheet"
                ? !busySheets && (db.queueControl.sheets_next_dispatch_at || 0) <= now
                : budget.canSend && (db.queueControl.email_next_dispatch_at || 0) <= now);
            // Flush a waiting sheet batch first so a large email backlog cannot starve exports.
            const next = db.outbox.find(j => j.type === "sheet" && eligible(j)) || db.outbox.find(eligible);
            if (!next) {
                const readyTimes = db.outbox.filter(j => (!onlyJobId || j.id === onlyJobId) && j.status === "queued" && !(j.type === "sheet" && busySheets)).map(j => Math.max(
                    j.next_attempt_at ? Date.parse(j.next_attempt_at) : now,
                    j.type === "sheet" ? db.queueControl.sheets_next_dispatch_at || now : db.queueControl.email_next_dispatch_at || now,
                    j.type === "email" && !budget.canSend ? Date.parse(budget.nextAvailableAt || "") || now + EMAIL_DAY_MS : now,
                ));
                return { jobs: [] as OutboxJob[], waitMs: readyTimes.length ? readyTimes.reduce((min, value) => Math.min(min, value), Infinity) - now : 0 };
            }
            const candidates = next.type === "sheet" ? db.outbox.filter(j => due(j) && j.type === "sheet" && j.payload.sheetId === next.payload.sheetId && j.payload.sheetName === next.payload.sheetName).slice(0, Math.min(100, limit - processed)) : [next];
            const batch: OutboxJob[] = [];
            let bytes = 0;
            for (const candidate of candidates) {
                if (candidate.type === "sheet" && (!Array.isArray(candidate.payload.rows) || !candidate.payload.rows.length || Buffer.byteLength(JSON.stringify(candidate.payload.rows)) > 1024 * 1024 || candidate.payload.rows.some((row: any) => !row || typeof row.referenceNo !== "string" || !row.referenceNo.trim()))) {
                    candidate.status = "failed"; candidate.error_code = "INVALID_JOB_DATA"; candidate.error = "The export job has invalid row data. Contact admissions support.";
                    continue;
                }
                const size = Buffer.byteLength(JSON.stringify(candidate.payload.rows || []));
                if (batch.length && bytes + size > 1024 * 1024) break;
                batch.push(candidate);
                bytes += size;
            }
            for (const job of batch) {
                if (job.type === "email" && !reserveEmailDispatch(db, job, now)) return { jobs: [] as OutboxJob[], waitMs: EMAIL_DAY_MS };
                job.status = "sending";
                job.attempts++;
                job.last_attempt_at = new Date(now).toISOString();
                job.deferred_reason = undefined;
                job.deferred_until = undefined;
                job.lease_until = new Date(now + 120000).toISOString();
            }
            // Persist account-wide pacing so overlapping workers share the same limits.
            if (next.type === "sheet") db.queueControl.sheets_next_dispatch_at = now + 3000;
            else db.queueControl.email_next_dispatch_at = now + 1500;
            return { jobs: structuredClone(batch), waitMs: batch.length ? 0 : 1 };
        });
        const { jobs } = claim;
        if (!jobs.length) {
            if (claim.waitMs > 0 && claim.waitMs <= 3000 && Date.now() + claim.waitMs < deadline) {
                await new Promise(resolve => setTimeout(resolve, Math.ceil(claim.waitMs)));
                continue;
            }
            break;
        }
        const job = jobs[0];
        let result: SendEmailResult;
        try {
            const db = await readDatabase();
            result = await databaseContext.run(db, async () => {
            if (job.type === "email" && job.sender_identity !== emailSender(db)) return { success: false, error: "The sending account changed. This email will retry using the current account's allowance.", errorCode: "EMAIL_SENDER_CHANGED", failureKind: "temporary" as const };
            if (job.type === "email" && job.payload.candidateMessage) {
                const context = job.payload.candidateMessage;
                const current = emailCandidates(db, context.stage).find(candidate => candidate.id === context.recordId);
                if (!current || current.email.toLowerCase() !== String(job.payload.to).toLowerCase()) return { success: false, error: "The candidate record or email address changed after this message was queued. Select the candidate again and compose a new message.", errorCode: "CANDIDATE_CONTACT_CHANGED", failureKind: "permanent" as const };
            }
            if (job.type === "email")
                return sendEmail({ ...secureCandidateEmail(db, job.payload), messageId: `<${job.id}@unicom-tic.local>` } as SendEmailPayload);
            const rows = jobs.flatMap(item => item.payload.rows);
            const res = await googleSheetsService.syncRecords(job.payload.sheetId, "registrations", rows, job.payload.sheetName);
            return { success: res.success, error: res.error, provider: "google_sheets", messageId: job.payload.sheetId, uncertain: false, retryAfterMs: res.retryAfterMs, errorCode: res.errorCode, failureKind: res.failureKind, action: res.action };
            });
        } catch (error: any) {
            const failure = providerFailure(error, job.type === "email");
            result = { success: false, error: failure.message, uncertain: failure.kind === "uncertain", retryAfterMs: failure.retryAfterMs, errorCode: failure.code, failureKind: failure.kind, action: failure.action };
        }
        await commit(state => {
          for (const job of jobs) {
            const saved = state.outbox.find(j => j.id === job.id);
            if (!saved || saved.status !== "sending" || saved.attempts !== job.attempts)
                continue;
            saved.lease_until = undefined;
            if (job.type === "email") settleEmailDispatch(state, saved, result.success ? "accepted" : result.uncertain || result.failureKind === "uncertain" ? "uncertain" : "rejected", Date.now());
            if (job.type === "email" && result.errorCode === "EMAIL_PROVIDER_DAILY_LIMIT") {
                state.queueControl.email_cooldowns ||= {};
                state.queueControl.email_cooldowns[job.sender_identity!] = { until: Date.now() + Math.max(EMAIL_DAY_MS, result.retryAfterMs || 0), message: result.error || "The email provider's daily limit has been reached." };
            }
            if (result.success) {
                recoverIncident(job.id);
                saved.status = "sent";
                saved.completed_at = new Date().toISOString();
                saved.error = undefined;
                saved.error_code = undefined;
                saved.repair_action = undefined;
                saved.next_attempt_at = undefined;
                saved.provider = result.provider;
                saved.provider_id = result.messageId;
                const sub = state.formSubmissions.find(s => s.id === job.payload.sourceId);
                if (sub) {
                    if (job.type === "sheet")
                        sub.synced_to_sheet = true;
                    else
                        sub.email_sent = true;
                }
                const decision = state.selectionDecisions.find(d => d.id === job.payload.decisionId);
                if (decision) {
                    decision.notification_status = "sent";
                    decision.notified_at = saved.completed_at;
                }
            }
            else {
                saved.status = result.uncertain || result.failureKind === "uncertain" ? "uncertain" : result.failureKind === "blocked" ? "blocked" : result.failureKind === "permanent" || saved.attempts >= 8 ? "failed" : "queued";
                saved.error = result.error || "Provider request failed. Saved records remain safe.";
                saved.error_code = result.errorCode || "PROVIDER_UNAVAILABLE";
                saved.repair_action = result.action;
                const delay = Math.max(result.retryAfterMs || 0, Math.min(3600000, 60000 * 2 ** (saved.attempts - 1)));
                saved.next_attempt_at = saved.status === "queued" ? new Date(Date.now() + delay + Math.random() * 1000).toISOString() : undefined;
                const decision = state.selectionDecisions.find(d => d.id === job.payload.decisionId);
                if (decision)
                    decision.notification_status = "failed";
            }
          }
          if (result.failureKind === "blocked") {
            // A broken account/destination should not consume attempts on every queued record.
            for (const pending of state.outbox.filter(j => j.status === "queued")) {
                const accountFailure = ["GOOGLE_NOT_CONNECTED", "GOOGLE_NOT_CONFIGURED", "GOOGLE_AUTH_REVOKED", "GOOGLE_TOKEN_FAILED", "GOOGLE_TOKEN_UNREADABLE"].includes(result.errorCode || "");
                const affected = accountFailure ? pending.type === "sheet" || state.integrations.email_provider === "gmail" : pending.type === job.type && (job.type === "email" || pending.payload.sheetId === job.payload.sheetId && pending.payload.sheetName === job.payload.sheetName);
                if (affected) { pending.status = "blocked"; pending.error = result.error; pending.error_code = result.errorCode; pending.repair_action = result.action; pending.next_attempt_at = undefined; }
            }
          }
        });
        if (!result.success) recordEvent(result.errorCode || "PROVIDER_UNAVAILABLE", { status: 503, jobId: job.id, attempt: job.attempts });
        processed += jobs.length;
        batches++;
        if (result.success)
            sent += jobs.length;
        else
            failed += jobs.length;
    }
    return { sent, failed, processed, batches };
}

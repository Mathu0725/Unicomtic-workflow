import { randomUUID } from "node:crypto";
import { transaction, tryIdleQueueWorkerTick } from "../data/repository";
import { processOutbox } from "./outbox";
import { queueWorkshopAutomatic } from "../workshops/notifications";
import { AppError } from "../errors/app-error";
import { recordEvent } from "../observability/logger";

export async function runScheduledQueue() {
    const id = randomUUID(), started = Date.now();
    const fastPath = await tryIdleQueueWorkerTick();
    if (fastPath === "already_running") return { skipped: true, reason: "already_running", sent: 0, failed: 0, processed: 0, batches: 0 };
    if (fastPath === "idle") return { skipped: false, sent: 0, failed: 0, processed: 0, batches: 0 };
    const state = await transaction(db => {
        const now = Date.now();
        if (db.queueControl.worker_lease && db.queueControl.worker_lease.expires_at > now) return "already_running" as const;
        db.queueControl.last_worker_at = now;
        for (const workshop of db.workshops) {
            if (workshop.reminders_enabled === false || Date.parse(workshop.start_time) <= now) continue;
            const hours = (Date.parse(workshop.start_time) - now) / 3600000;
            for (const days of workshop.reminder_schedule.days_before) {
                if (hours > days * 24 || hours <= (days - 1) * 24) continue;
                for (const booking of db.workshopBookings.filter(b => b.workshop_id === workshop.id && b.status === "confirmed")) {
                    const student = db.students.find(s => s.id === booking.student_id);
                    if (student) queueWorkshopAutomatic(db, booking, "scheduled", days);
                }
            }
        }
        // Reminders must be generated before deciding that the queue is idle.
        // Sending jobs also need the outbox's interrupted-worker recovery.
        if (!db.outbox.some(job => job.status === "queued" || job.status === "sending")) {
            delete db.queueControl.worker_lease;
            db.queueControl.last_worker_completed_at = now;
            delete db.queueControl.last_worker_error;
            return "idle" as const;
        }
        db.queueControl.worker_lease = { id, expires_at: now + 180000 };
        return "claimed" as const;
    }, { maxConflictRetries: 8 });
    if (state === "already_running") return { skipped: true, reason: "already_running", sent: 0, failed: 0, processed: 0, batches: 0 };
    if (state === "idle") return { skipped: false, sent: 0, failed: 0, processed: 0, batches: 0 };
    let failure: string | undefined;
    try {
        return { skipped: false, ...await processOutbox(120, Math.max(0, 40000 - (Date.now() - started))) };
    } catch (error) {
        failure = error instanceof AppError ? error.code : "WORKER_DISPATCH_FAILED";
        throw error;
    } finally {
        try {
            await transaction(db => {
                if (db.queueControl.worker_lease?.id !== id) return;
                delete db.queueControl.worker_lease;
                if (failure) db.queueControl.last_worker_error = { code: failure, at: Date.now() };
                else {
                    db.queueControl.last_worker_completed_at = Date.now();
                    delete db.queueControl.last_worker_error;
                }
            }, { maxConflictRetries: 8 });
        } catch {
            // Never hide the dispatch result. An unconfirmed release expires;
            // individual jobs keep their existing lease/reconciliation rules.
            recordEvent("WORKER_LEASE_RELEASE_FAILED", { status: 503 });
        }
    }
}


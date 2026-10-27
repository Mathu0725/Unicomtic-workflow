import { randomUUID } from "node:crypto";
import { transaction } from "../data/repository";
import { enqueue, processOutbox } from "./outbox";
import { escaped } from "../admissions/service";
import { AppError } from "../errors/app-error";
import { recordEvent } from "../observability/logger";

export async function runScheduledQueue() {
    const id = randomUUID(), started = Date.now();
    const claimed = await transaction(db => {
        const now = Date.now();
        if (db.queueControl.worker_lease && db.queueControl.worker_lease.expires_at > now) return false;
        db.queueControl.worker_lease = { id, expires_at: now + 180000 };
        db.queueControl.last_worker_at = now;
        for (const workshop of db.workshops) {
            if (!workshop.is_active || Date.parse(workshop.start_time) <= now) continue;
            const hours = (Date.parse(workshop.start_time) - now) / 3600000;
            for (const days of workshop.reminder_schedule.days_before) {
                if (hours > days * 24 || hours <= (days - 1) * 24) continue;
                for (const booking of db.workshopBookings.filter(b => b.workshop_id === workshop.id && b.status === "confirmed")) {
                    const student = db.students.find(s => s.id === booking.student_id);
                    if (student) enqueue(db, "email", `reminder:${booking.id}:${days}:${workshop.start_time}`, {
                        to: student.email, subject: `Workshop reminder — ${workshop.title}`,
                        html: `<p>Dear ${escaped(student.full_name)}, your workshop is scheduled for ${escaped(new Date(workshop.start_time).toLocaleString("en-GB", { timeZone: "Asia/Colombo" }))} (Sri Lanka), ${escaped(workshop.venue)}.</p><p>${escaped(workshop.address)}</p>`,
                    });
                }
            }
        }
        return true;
    }, { maxConflictRetries: 8 });
    if (!claimed) return { skipped: true, reason: "already_running", sent: 0, failed: 0, processed: 0, batches: 0 };
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

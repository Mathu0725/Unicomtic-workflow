import type { DatabaseStore } from "../data/store";
import type { OutboxJob } from "../data/types";
import type { ReminderKind, ReminderVariables } from "./templates";

export type ReminderCandidate = ReminderVariables & {
    id: string; kind: ReminderKind; registrationId: string; studentId: string; campaignId: string;
    email: string; registeredAt: string; bookingId?: string; workshopId?: string; defaultActionUrl: string;
};
const submittedStatuses = new Set(["submitted", "under_review", "approved"]);
export function reminderCohorts(db: DatabaseStore, now = Date.now()) {
    const students = new Map(db.students.map(s => [s.id, s]));
    const campaigns = new Map(db.campaigns.filter(c => c.is_active).map(c => [c.id, c]));
    const workshops = new Map(db.workshops.map(w => [w.id, w]));
    const applications = new Map<string, typeof db.applications>();
    for (const app of db.applications) {
        const key = `${app.campaign_id}:${app.student_id}`;
        applications.set(key, [...(applications.get(key) || []), app]);
    }
    const bookings = new Map<string, typeof db.workshopBookings>();
    for (const booking of db.workshopBookings) {
        const workshop = workshops.get(booking.workshop_id);
        if (booking.status !== "confirmed" || !workshop) continue;
        const key = `${workshop.campaign_id}:${booking.student_id}`;
        bookings.set(key, [...(bookings.get(key) || []), booking]);
    }
    const attendance = new Map(db.attendance.map(a => [`${a.workshop_id}:${a.student_id}`, a]));
    const attended = new Set(db.attendance.filter(a => ["attended", "late"].includes(a.status)).map(a => `${workshops.get(a.workshop_id)?.campaign_id}:${a.student_id}`));
    const candidates: ReminderCandidate[] = [], seen = new Set<string>();
    let attendanceReview = 0;
    for (const registration of db.registrations) {
        const student = students.get(registration.student_id), campaign = campaigns.get(registration.campaign_id);
        const key = `${registration.campaign_id}:${registration.student_id}`;
        if (!student || !campaign || registration.status === "cancelled" || seen.has(key)) continue;
        seen.add(key);
        const apps = applications.get(key) || [];
        if (apps.some(a => ["withdrawn", "rejected"].includes(a.status))) continue;
        const reserved = bookings.get(key) || [];
        const defaults = (kind: ReminderKind) => {
            const formType = kind === "application_pending" ? "application" : "workshop_rsvp";
            const defaultIntake = db.campaigns.find(c => c.is_active)?.id;
            const forms = db.customForms.filter(f => f.is_active && f.type === formType && (f.campaign_id === campaign.id || !f.campaign_id && defaultIntake === campaign.id));
            const form = forms.find(f => f.campaign_id === campaign.id) || forms[0];
            return form ? `/form/${encodeURIComponent(form.slug)}` : "";
        };
        const base = { registrationId: registration.id, studentId: student.id, campaignId: campaign.id, name: student.full_name, email: student.email, intake: campaign.title, reference: registration.reference_no, registeredAt: registration.created_at, workshop: "", date: "", venue: "" };
        if (!apps.some(a => submittedStatuses.has(a.status))) {
            candidates.push({ ...base, id: `application_pending:${registration.id}`, kind: "application_pending", defaultActionUrl: defaults("application_pending") });
        } else if (!reserved.length && !attended.has(key)) {
            candidates.push({ ...base, id: `workshop_unbooked:${registration.id}`, kind: "workshop_unbooked", defaultActionUrl: defaults("workshop_unbooked") });
        }
        if (attended.has(key) || reserved.some(b => Date.parse(workshops.get(b.workshop_id)!.end_time) > now)) continue;
        // Missing attendance is a review task, never evidence of absence.
        const ended = reserved.filter(b => Date.parse(workshops.get(b.workshop_id)!.end_time) <= now);
        attendanceReview += ended.filter(b => !attendance.has(`${b.workshop_id}:${student.id}`)).length;
        const missed = ended.filter(b => attendance.get(`${b.workshop_id}:${student.id}`)?.status === "absent")
            .sort((a, b) => Date.parse(workshops.get(b.workshop_id)!.end_time) - Date.parse(workshops.get(a.workshop_id)!.end_time))[0];
        if (missed) {
            const workshop = workshops.get(missed.workshop_id)!;
            candidates.push({ ...base, id: `workshop_missed:${missed.id}`, kind: "workshop_missed", bookingId: missed.id, workshopId: workshop.id, workshop: workshop.title, venue: workshop.venue, date: new Date(workshop.start_time).toLocaleString("en-GB", { timeZone: "Asia/Colombo" }), defaultActionUrl: defaults("workshop_missed") });
        }
    }
    return { candidates, attendanceReview };
}
export function reminderMatches(job: OutboxJob, candidates: Map<string, ReminderCandidate>) {
    if (!job.payload.admissionsReminder) return true;
    const candidate = candidates.get(job.payload.admissionsReminder.candidateId);
    return Boolean(candidate && candidate.kind === job.payload.admissionsReminder.kind && candidate.registrationId === job.payload.admissionsReminder.registrationId && (!job.payload.admissionsReminder.defaultActionUrl || job.payload.admissionsReminder.defaultActionUrl === candidate.defaultActionUrl) && candidate.email.trim().toLowerCase() === String(job.payload.to).trim().toLowerCase());
}
export function reminderDeliveryState(db: DatabaseStore, candidate: ReminderCandidate, now = Date.now()) {
    const jobs = db.outbox.filter(j => j.payload.admissionsReminder?.candidateId === candidate.id && j.error_code !== "REMINDER_SUPERSEDED").sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const active = jobs.find(j => ["queued", "sending", "blocked", "uncertain", "failed"].includes(j.status));
    const latest = jobs[0];
    const cooldown = jobs.find(j => j.status === "sent" && now - Date.parse(j.completed_at || j.created_at) < 86400000);
    const reason = active ? `Existing reminder is ${active.status}. Review it in Email Center.` : cooldown ? "A reminder was sent within the last 24 hours." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email) ? "A valid email address is required." : "";
    return { canQueue: !reason, reason, lastStatus: latest?.status || null, lastReminderAt: latest?.completed_at || latest?.created_at || null };
}

import { createHash } from "node:crypto";
import type { DatabaseStore, Workshop } from "../data/store";
import type { OutboxJob } from "../data/types";

export function workshopEmailVersion(w: Workshop) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        w.title,
        w.start_time,
        w.end_time,
        w.venue,
        w.address,
        w.google_maps_url,
      ]),
    )
    .digest("hex");
}
export function workshopJobBooking(db: DatabaseStore, job: OutboxJob) {
  const id =
    job.payload.workshopMessage?.bookingId ||
    (job.key.startsWith("booking:")
      ? job.key.slice(8)
      : job.key.startsWith("reminder:")
        ? job.key.split(":")[1]
        : undefined);
  return id ? db.workshopBookings.find((b) => b.id === id) : undefined;
}
/** Also guards legacy jobs created before workshop metadata was added. */
export function workshopEmailProblem(
  db: DatabaseStore,
  job: OutboxJob,
  now = Date.now(),
): string | null {
  if (
    job.type !== "email" ||
    !(
      job.payload.workshopMessage ||
      job.key.startsWith("booking:") ||
      job.key.startsWith("reminder:")
    )
  )
    return null;
  const b = workshopJobBooking(db, job),
    w = b && db.workshops.find((w) => w.id === b.workshop_id),
    s = b && db.students.find((s) => s.id === b.student_id),
    context = job.payload.workshopMessage;
  if (!b || !w || !s || b.status !== "confirmed")
    return "The workshop booking is no longer confirmed.";
  if (
    !db.registrations.some(
      (r) => r.id === b.registration_id && r.status !== "cancelled",
    )
  )
    return "The linked registration is no longer active.";
  if (String(job.payload.to).toLowerCase() !== s.email.toLowerCase())
    return "The participant's email changed. Review the recipient again.";
  if (Date.parse(w.start_time) <= now)
    return "This workshop has already started.";
  if (
    context &&
    (context.workshopId !== w.id || context.version !== workshopEmailVersion(w))
  )
    return "Workshop details changed. Preview a new message with the current date and venue.";
  if (
    !context &&
    w.details_updated_at &&
    Date.parse(w.details_updated_at) >= Date.parse(job.created_at)
  )
    return "Workshop details changed after this legacy message was queued.";
  const automatic =
    context?.kind === "scheduled" || job.key.startsWith("reminder:");
  const days =
    context?.days ??
    (job.key.startsWith("reminder:")
      ? Number(job.key.split(":")[2])
      : undefined);
  if (
    automatic &&
    (w.reminders_enabled === false ||
      (days && !w.reminder_schedule.days_before.includes(days)))
  )
    return "Automatic reminders are disabled or this reminder day was removed.";
  if (
    automatic &&
    days &&
    Date.parse(w.start_time) - now <= (days - 1) * 86400000
  )
    return "This scheduled reminder window has passed.";
  if (
    (context?.kind === "confirmation" || job.key.startsWith("booking:")) &&
    w.confirmation_enabled === false
  )
    return "Workshop confirmations are disabled.";
  return null;
}

import { createHmac, randomUUID } from "node:crypto";
import type { DatabaseStore } from "../data/store";
import type { WorkshopBooking } from "../data/types";
import { enqueue } from "../jobs/outbox";
import {
  admissionEmailVariables,
} from "../email/notification-templates";
import { appSecret } from "../security/secrets";
import { safeEqual } from "../security/session";
import { RequestError } from "../http";
import { workshopEmailVersion, workshopJobBooking } from "./email-policy";
import { renderWorkshopEmail } from "./email-content";

export type WorkshopMailKind =
  "confirmation" | "scheduled" | "manual" | "update";
export function workshopMessage(
  db: DatabaseStore,
  booking: WorkshopBooking,
  kind: WorkshopMailKind,
  days?: number,
) {
  const w = db.workshops.find((w) => w.id === booking.workshop_id)!,
    s = db.students.find((s) => s.id === booking.student_id)!,
    reg = db.registrations.find((r) => r.id === booking.registration_id);
  const template =
    kind === "confirmation"
      ? w.confirmation_template || "workshop_booking"
      : kind === "update"
        ? "workshop_update"
        : w.reminder_template || "workshop_reminder";
  return {
    to: s.email,
    toName: s.full_name,
    ...renderWorkshopEmail(db, w, template, admissionEmailVariables(db, s, reg), days),
    workshopMessage: {
      workshopId: w.id,
      bookingId: booking.id,
      version: workshopEmailVersion(w),
      kind,
      days,
    },
  };
}
export function queueWorkshopConfirmation(
  db: DatabaseStore,
  booking: WorkshopBooking,
) {
  if (
    db.workshops.find((w) => w.id === booking.workshop_id)
      ?.confirmation_enabled === false
  )
    return;
  return queueWorkshopAutomatic(db, booking, "confirmation");
}
export function queueWorkshopAutomatic(db: DatabaseStore, booking: WorkshopBooking, kind: "confirmation" | "scheduled", days?: number) {
  const w = db.workshops.find(w => w.id === booking.workshop_id)!;
  const key = kind === "confirmation" ? `booking:${booking.id}` : `reminder:${booking.id}:${days}:${w.start_time}`;
  const existing = db.outbox.find(job => job.key === key);
  if (existing) return existing;
  try {
    return enqueue(db, "email", key, workshopMessage(db, booking, kind, days));
  } catch (error) {
    if (!(error instanceof RequestError)) throw error;
    const student = db.students.find(s => s.id === booking.student_id)!;
    const job = enqueue(db, "email", key, {
      to: student.email, toName: student.full_name, subject: "Workshop template needs review", html: "",
      templateId: kind === "confirmation" ? w.confirmation_template || "workshop_booking" : w.reminder_template || "workshop_reminder",
      workshopMessage: { workshopId: w.id, bookingId: booking.id, version: workshopEmailVersion(w), kind, days },
    });
    job.status = "blocked"; job.error_code = "TEMPLATE_INVALID";
    job.error = error.message; job.repair_action = "review_template";
    return job;
  }
}
export function workshopDeliveries(db: DatabaseStore, workshopId: string) {
  return db.outbox
    .filter(
      (j) =>
        j.type === "email" &&
        workshopJobBooking(db, j)?.workshop_id === workshopId,
    )
    .map((j) => {
      const booking = workshopJobBooking(db, j)!;
      return {
        id: j.id,
        bookingId: booking.id,
        name:
          db.students.find((s) => s.id === booking.student_id)?.full_name || "",
        email: j.payload.to as string,
        kind:
          j.payload.workshopMessage?.kind ||
          (j.key.startsWith("reminder:") ? "scheduled" : "confirmation"),
        subject: j.payload.subject as string,
        status: j.status,
        createdAt: j.created_at,
        sentAt: j.completed_at,
        nextAttemptAt: j.deferred_until || j.next_attempt_at,
        error: j.error,
      };
    })
    .reverse();
}
function signature(payload: unknown) {
  return createHmac("sha256", appSecret())
    .update(JSON.stringify(payload))
    .digest("hex");
}
export function workshopMailPreview(
  db: DatabaseStore,
  workshopId: string,
  kind: "manual" | "update",
  now = Date.now(),
  expiresAt = now + 15 * 60000,
  operationId: string = randomUUID(),
) {
  const workshop = db.workshops.find((w) => w.id === workshopId);
  if (!workshop) throw new RequestError("Workshop not found.", 404);
  if (Date.parse(workshop.start_time) <= now)
    throw new RequestError(
      "This workshop has already started. Use Email Center for individual follow-up messages.",
      409,
    );
  const deliveries = workshopDeliveries(db, workshopId);
  const recipients = db.workshopBookings
    .filter((b) => b.workshop_id === workshopId && b.status === "confirmed")
    .flatMap((b) => {
      const student = db.students.find((s) => s.id === b.student_id);
      if (
        !student?.email ||
        !db.registrations.some(
          (r) => r.id === b.registration_id && r.status !== "cancelled",
        )
      )
        return [];
      const message = workshopMessage(db, b, kind);
      return [
        {
          id: b.id,
          name: student.full_name,
          email: student.email,
          phone: student.phone,
          subject: message.subject,
          text: message.text,
          recent: deliveries.some(
            (d) =>
              d.bookingId === b.id &&
              ["queued", "sending", "sent", "uncertain"].includes(d.status) &&
              Date.parse(d.sentAt || d.createdAt) > now - 86400000,
          ),
          token: signature([
            workshopId,
            kind,
            operationId,
            expiresAt,
            b.id,
            message,
          ]),
        },
      ];
    });
  return { operationId, expiresAt, kind, recipients };
}
export function queueWorkshopMail(
  db: DatabaseStore,
  workshopId: string,
  input: {
    kind: "manual" | "update";
    operationId: string;
    expiresAt: number;
    recipients: { id: string; token: string }[];
  },
  actor: string,
  now = Date.now(),
) {
  if (input.expiresAt <= now || input.expiresAt > now + 16 * 60000)
    throw new RequestError(
      "This preview expired. Preview the current recipients again.",
      409,
    );
  const preview = workshopMailPreview(
    db,
    workshopId,
    input.kind,
    now,
    input.expiresAt,
    input.operationId,
  );
  const candidates = new Map(preview.recipients.map((r) => [r.id, r]));
  const ids = [...new Set(input.recipients.map((r) => r.id))];
  if (!ids.length) throw new RequestError("Select at least one participant.");
  for (const recipient of input.recipients) {
    const current = candidates.get(recipient.id);
    if (!current || !safeEqual(current.token, recipient.token))
      throw new RequestError(
        "Participants, workshop details or template changed. Preview again before sending.",
        409,
      );
  }
  let queued = 0;
  for (const id of ids) {
    const key = `workshop-manual:${workshopId}:${input.operationId}:${id}`;
    if (db.outbox.some((j) => j.key === key)) continue;
    enqueue(db, "email", key, {
      ...workshopMessage(
        db,
        db.workshopBookings.find((b) => b.id === id)!,
        input.kind,
      ),
      initiatedBy: actor,
    });
    queued++;
  }
  return { queued, skipped: ids.length - queued };
}

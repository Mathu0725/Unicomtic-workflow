import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSession } from "../security/session";
import { RequestError } from "../http";
import type { DatabaseStore, Workshop } from "../data/store";
import type { WorkshopFormData } from "../validations/workshop";
import { workshopAttached } from "./policy";
import {
  workshopSheetSummary,
  queueWorkshopBooking,
  queueWorkshopBookings,
} from "./sheet-sync";
import { workshopDeliveries } from "./notifications";
import { workshopEmailVersion } from "./email-policy";
import { bookWorkshop } from "../admissions/service";

export function requireWorkshopAdmin(req: NextRequest) {
  const user = getSession(req);
  if (!user || !["admin", "super_admin"].includes(user.role))
    throw new RequestError(
      "Only admissions administrators can manage workshops, bookings and emails.",
      403,
    );
  return user.email;
}
export const workshopVersion = (w: Workshop) => w.updated_at || w.created_at;
export const bookingVersion = (b: {
  updated_at?: string;
  created_at: string;
}) => b.updated_at || b.created_at;
export const nextVersion = (old: string) =>
  new Date(Math.max(Date.now(), Date.parse(old) + 1 || 0)).toISOString();
export function workshopAudit(
  db: DatabaseStore,
  actor: string,
  action: string,
  id: string,
  changes: Record<string, unknown>,
  entity = "workshops",
) {
  db.auditLogs.push({
    id: randomUUID(),
    action,
    entity_name: entity,
    entity_id: id,
    user_email: actor,
    changes,
    created_at: new Date().toISOString(),
  });
}
export function findWorkshop(db: DatabaseStore, id: string) {
  const w = db.workshops.find((w) => w.id === id);
  if (!w) throw new RequestError("Workshop not found.", 404);
  return w;
}
export function workshopSummary(db: DatabaseStore, w: Workshop) {
  const bookings = db.workshopBookings.filter((b) => b.workshop_id === w.id);
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  return {
    ...w,
    version: workshopVersion(w),
    campaignTitle:
      db.campaigns.find((c) => c.id === w.campaign_id)?.title || "",
    bookedCount: confirmed.length,
    cancelledCount: bookings.length - confirmed.length,
    remaining: w.capacity ? Math.max(0, w.capacity - confirmed.length) : null,
    totalAttended: db.attendance.filter(
      (a) => a.workshop_id === w.id && ["attended", "late"].includes(a.status),
    ).length,
    attachedForms: db.customForms
      .filter(
        (f) =>
          f.is_active &&
          (!f.status || f.status === "published") &&
          f.workshop_config &&
          workshopAttached(w, f.campaign_id, {
            ...f.workshop_config,
            hidden_ids: [],
          }),
      )
      .map((f) => ({
        id: f.id,
        title: f.title,
        hidden: f.workshop_config?.hidden_ids?.includes(w.id) || false,
      })),
  };
}
export function workshopDetail(
  db: DatabaseStore,
  w: Workshop,
  canManage: boolean,
) {
  const deliveries = canManage ? workshopDeliveries(db, w.id) : [];
  return {
    ...workshopSummary(db, w),
    ...(canManage
      ? { sheetSync: workshopSheetSummary(db, w), deliveries }
      : {}),
    attendanceRecords: db.attendance
      .filter((a) => a.workshop_id === w.id)
      .map((a) => ({
        ...a,
        studentName:
          db.students.find((s) => s.id === a.student_id)?.full_name || "",
        phone: db.students.find((s) => s.id === a.student_id)?.phone || "",
        history: db.auditLogs.filter(
          (log) => log.entity_name === "attendance" && log.entity_id === a.id,
        ),
      })),
    bookings: db.workshopBookings
      .filter((b) => b.workshop_id === w.id)
      .map((b) => {
        const s = db.students.find((s) => s.id === b.student_id);
        const attendance = db.attendance.find(
          (a) => a.workshop_id === w.id && a.student_id === b.student_id,
        );
        const sources = db.formSubmissions.filter(
          (sub) =>
            b.source_submission_ids?.includes(sub.id) ||
            (sub.workshop_id === w.id &&
              sub.registration_id === b.registration_id),
        );
        const sheet = [...db.outbox]
          .reverse()
          .find(
            (j) =>
              j.type === "sheet" &&
              j.payload.bookingId === b.id &&
              j.payload.workshopSheetVersion ===
                w.google_sheets_config?.version,
          );
        return {
          ...b,
          version: bookingVersion(b),
          studentName: s?.full_name || "",
          email: s?.email || "",
          phone: s?.phone || "",
          district: s?.district || "",
          referenceNo:
            db.registrations.find((r) => r.id === b.registration_id)
              ?.reference_no || "",
          applicationNo:
            db.applications.find((a) => a.registration_id === b.registration_id)
              ?.application_no || "",
          attendanceStatus: attendance?.status || "unmarked",
          attendance,
          sourceForms: [
            ...new Set(
              sources.map(
                (sub) =>
                  db.customForms.find((f) => f.id === sub.form_id)?.title ||
                  sub.form_id,
              ),
            ),
          ],
          emailStatus:
            deliveries.find((d) => d.bookingId === b.id)?.status || "none",
          sheetStatus: sheet?.status || "none",
          history: db.auditLogs.filter(
            (log) =>
              log.entity_name === "workshop_bookings" && log.entity_id === b.id,
          ),
        };
      }),
    history: canManage
      ? db.auditLogs.filter(
          (log) => log.entity_name === "workshops" && log.entity_id === w.id,
        )
      : [],
  };
}
export function saveWorkshop(
  db: DatabaseStore,
  data: WorkshopFormData,
  actor: string,
  existing?: Workshop,
  expectedVersion?: string,
) {
  if (existing && expectedVersion !== workshopVersion(existing))
    throw new RequestError("This workshop changed. Reload before saving.", 409);
  const bookings = existing
    ? db.workshopBookings.filter((b) => b.workshop_id === existing.id)
    : [];
  const confirmed = bookings.filter((b) => b.status === "confirmed").length;
  if (data.capacity < confirmed)
    throw new RequestError(
      `${confirmed} participants are already booked. Set at least ${confirmed} seats.`,
      409,
    );
  if (
    !db.campaigns.some(
      (c) =>
        c.id === data.campaignId &&
        (c.is_active || existing?.campaign_id === c.id),
    )
  )
    throw new RequestError("Select an active intake.");
  if (bookings.length && existing?.campaign_id !== data.campaignId)
    throw new RequestError(
      "A workshop with bookings cannot change its intake.",
      409,
    );
  if (
    existing &&
    existing.campaign_id !== data.campaignId &&
    db.customForms.some((f) =>
      [f.workshop_config, f.editor_draft?.values.workshop_config].some(
        (config) =>
          config &&
          (config.workshop_ids.includes(existing.id) ||
            workshopAttached(existing, f.campaign_id, {
              ...config,
              hidden_ids: [],
            })),
      ),
    )
  )
    throw new RequestError(
      "This workshop is attached to a form or saved draft. Detach it before changing its intake.",
      409,
    );
  const dateChanged =
    !existing ||
    data.startTime !== existing.start_time ||
    data.endTime !== existing.end_time;
  if (dateChanged && existing && Date.parse(existing.start_time) <= Date.now())
    throw new RequestError(
      "This session has started. Duplicate it as a new workshop instead.",
      409,
    );
  if (
    Date.parse(data.endTime) <= Date.parse(data.startTime) ||
    (dateChanged && Date.parse(data.startTime) <= Date.now())
  )
    throw new RequestError("Choose a future start and an end after the start.");
  if (
    data.bookingDeadline &&
    (!Number.isFinite(Date.parse(data.bookingDeadline)) ||
      Date.parse(data.bookingDeadline) > Date.parse(data.startTime) ||
      (data.bookingDeadline !== existing?.booking_deadline &&
        Date.parse(data.bookingDeadline) <= Date.now()))
  )
    throw new RequestError(
      "Choose a future booking deadline no later than the workshop start.",
    );
  const before = existing ? structuredClone(existing) : null;
  const now = new Date().toISOString();
  const workshop: Workshop =
    existing ||
    ({ id: randomUUID(), created_at: now, is_active: true } as Workshop);
  Object.assign(workshop, {
    campaign_id: data.campaignId,
    title: data.title.trim(),
    description: data.description || "",
    venue: data.venue.trim(),
    address: data.address.trim(),
    google_maps_url: data.googleMapsUrl || "",
    start_time: data.startTime,
    end_time: data.endTime,
    capacity: data.capacity,
    booking_deadline: data.bookingDeadline || undefined,
    reminder_schedule: { days_before: data.daysBeforeReminders },
    reminders_enabled:
      data.remindersEnabled ?? workshop.reminders_enabled ?? true,
    confirmation_enabled:
      data.confirmationEnabled ?? workshop.confirmation_enabled ?? true,
    reminder_template:
      data.reminderTemplate ||
      workshop.reminder_template ||
      "workshop_reminder",
    confirmation_template:
      data.confirmationTemplate ||
      workshop.confirmation_template ||
      "workshop_booking",
    updated_at: nextVersion(workshopVersion(workshop)),
  });
  if (before && workshopEmailVersion(before) !== workshopEmailVersion(workshop))
    workshop.details_updated_at = workshop.updated_at;
  if (!existing) db.workshops.push(workshop);
  if (existing) queueWorkshopBookings(db, workshop.id);
  workshopAudit(
    db,
    actor,
    existing ? "WORKSHOP_UPDATED" : "WORKSHOP_CREATED",
    workshop.id,
    { before, after: structuredClone(workshop) },
  );
  return workshop;
}
export function changeBooking(
  db: DatabaseStore,
  workshopId: string,
  input: {
    bookingId: string;
    expectedVersion: string;
    action: "cancel" | "move";
    targetWorkshopId?: string;
    reason: string;
  },
  actor: string,
) {
  const b = db.workshopBookings.find(
    (b) => b.id === input.bookingId && b.workshop_id === workshopId,
  );
  if (!b) throw new RequestError("Booking not found in this workshop.", 404);
  if (bookingVersion(b) !== input.expectedVersion || b.status !== "confirmed")
    throw new RequestError(
      "This booking changed. Reload and review its current status.",
      409,
    );
  if (
    db.attendance.some(
      (a) => a.workshop_id === workshopId && a.student_id === b.student_id,
    ) ||
    db.examResults.some(
      (r) =>
        r.student_id === b.student_id &&
        db.exams.some(
          (e) => e.id === r.exam_id && e.workshop_id === workshopId,
        ),
    )
  )
    throw new RequestError(
      "This booking has an attendance or exam record. Review it with admissions before cancelling or moving.",
      409,
    );
  let moved;
  if (input.action === "move") {
    const target = findWorkshop(db, input.targetWorkshopId || "");
    const source = findWorkshop(db, workshopId);
    if (target.id === source.id || target.campaign_id !== source.campaign_id)
      throw new RequestError("Choose a different workshop in the same intake.");
    if (
      db.workshopBookings.some(
        (other) =>
          other.workshop_id === target.id &&
          other.student_id === b.student_id &&
          other.status === "confirmed",
      )
    )
      throw new RequestError(
        "This participant already has a confirmed booking in that workshop.",
        409,
      );
    const student = db.students.find((s) => s.id === b.student_id),
      reg = db.registrations.find((r) => r.id === b.registration_id);
    if (
      !student ||
      !reg ||
      reg.student_id !== student.id ||
      reg.campaign_id !== source.campaign_id ||
      reg.status === "cancelled" ||
      !db.campaigns.some((c) => c.id === reg.campaign_id && c.is_active)
    )
      throw new RequestError(
        "The linked registration or intake is no longer active, or needs admissions review.",
        409,
      );
    moved = bookWorkshop(target.id, student, reg)!;
    moved.moved_from = b.id;
    moved.source_submission_ids = [
      ...new Set([
        ...(b.source_submission_ids || []),
        ...db.formSubmissions
          .filter(
            (s) =>
              s.workshop_id === workshopId &&
              s.registration_id === b.registration_id,
          )
          .map((s) => s.id),
      ]),
    ];
    b.moved_to = moved.id;
    queueWorkshopBooking(db, moved.id);
    workshopAudit(
      db,
      actor,
      "BOOKING_MOVED_IN",
      moved.id,
      { from: b.id, workshopId: target.id },
      "workshop_bookings",
    );
  }
  b.status = "cancelled";
  b.cancelled_at = new Date().toISOString();
  b.cancelled_by = actor;
  b.cancellation_reason = input.reason;
  b.updated_at = nextVersion(bookingVersion(b));
  queueWorkshopBooking(db, b.id);
  workshopAudit(
    db,
    actor,
    moved ? "BOOKING_MOVED_OUT" : "BOOKING_CANCELLED",
    b.id,
    { workshopId, reason: input.reason, movedTo: moved?.id },
    "workshop_bookings",
  );
  return { booking: b, moved };
}

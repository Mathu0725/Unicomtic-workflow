import { createHash } from "node:crypto";
import type { DatabaseStore, Workshop } from "../data/store";
import { enqueue } from "../jobs/outbox";
import { workshopSheetTarget } from "./sheet-config";
import { workshopBookingSheetRow } from "./booking-sheet-row";

export function queueWorkshopBooking(
  db: DatabaseStore,
  bookingId: string,
  options: { runId?: string; initiatedBy?: string; manual?: boolean } = {},
) {
  const row = workshopBookingSheetRow(db, bookingId),
    workshop = row
      ? db.workshops.find((item) => item.id === row.workshopId)
      : undefined,
    target = workshopSheetTarget(workshop);
  if (!row || !target || (!options.manual && !target.auto_sync)) return;
  const hash = createHash("sha256").update(JSON.stringify(row)).digest("hex"),
    key = `workshop-sheet:${row.workshopId}:${target.version}:${options.runId || hash}:${bookingId}`;
  const existing = db.outbox.find((job) => job.key === key);
  if (existing) return existing;
  const job = enqueue(db, "sheet", key, {
    sheetId: target.sheet_id,
    sheetName: target.sheet_name,
    rows: [row],
    workshopId: row.workshopId,
    bookingId,
    workshopSheetVersion: target.version,
    initiatedBy: options.initiatedBy,
  });
  // Explicit resync may probe a repaired connection once. A fresh provider
  // rejection still blocks the destination lane before further records send.
  if (options.manual && job.status === "blocked") {
    job.status = "queued";
    job.error = undefined;
    job.error_code = undefined;
    job.repair_action = undefined;
  }
  return job;
}
export function queueWorkshopBookings(
  db: DatabaseStore,
  workshopId: string,
  options: { runId?: string; initiatedBy?: string; manual?: boolean } = {},
) {
  const before = db.outbox.length;
  for (const booking of db.workshopBookings.filter(
    (item) => item.workshop_id === workshopId,
  ))
    queueWorkshopBooking(db, booking.id, options);
  return db.outbox.length - before;
}
export function workshopSheetSummary(db: DatabaseStore, workshop: Workshop) {
  const jobs = db.outbox.filter(
    (job) =>
      job.type === "sheet" &&
      job.payload.workshopId === workshop.id &&
      job.payload.workshopSheetVersion ===
        workshop.google_sheets_config?.version,
  );
  const latest = new Map(jobs.map((job) => [job.payload.bookingId, job])),
    last = [...latest.values()];
  return {
    total: db.workshopBookings.filter(
      (item) => item.workshop_id === workshop.id,
    ).length,
    synced: last.filter((job) => job.status === "sent").length,
    pending: last.filter((job) => ["queued", "sending"].includes(job.status))
      .length,
    failed: last.filter((job) =>
      ["blocked", "failed", "uncertain"].includes(job.status),
    ).length,
    lastSyncedAt:
      jobs
        .filter((job) => job.completed_at)
        .map((job) => job.completed_at!)
        .sort()
        .at(-1) || null,
    lastError: [...last].reverse().find((job) => job.error)?.error || null,
  };
}

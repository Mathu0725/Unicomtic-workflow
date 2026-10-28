import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  google: vi.fn(),
  send: vi.fn(),
  formSync: vi.fn(),
  workshopSync: vi.fn(),
}));
vi.mock("../../src/lib/google/oauth", () => ({ googleRequest: mocks.google }));
vi.mock("../../src/lib/email/smtp-client", () => ({ sendEmail: mocks.send }));
vi.mock("../../src/lib/google/sheets-service", async (original) => ({
  ...(await original<any>()),
  googleSheetsService: {
    syncRecords: mocks.formSync,
    syncWorkshopBookings: mocks.workshopSync,
  },
}));
import { readDatabase, transaction } from "../../src/lib/data/repository";
import {
  canonicalStudent,
  registrationFor,
  bookWorkshop,
  applicationFor,
} from "../../src/lib/admissions/service";
import { processOutbox } from "../../src/lib/jobs/outbox";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import { POST as inspect } from "../../src/app/api/admin/workshops/[id]/sheets/route";
import { POST as connect } from "../../src/app/api/admin/workshops/[id]/sheets/config/route";
import { POST as resync } from "../../src/app/api/admin/workshops/[id]/sheets/sync/route";
import { GET as workshops } from "../../src/app/api/admin/workshops/route";
import { POST as attendance } from "../../src/app/api/admin/attendance/route";
import { PATCH as correctEmail } from "../../src/app/api/admin/candidates/email/route";
import {
  queueWorkshopBooking,
  workshopSheetSummary,
} from "../../src/lib/workshops/sheet-sync";
import { workshopBookingSheetRow } from "../../src/lib/workshops/booking-sheet-row";
let directory: string;
const person = (n = 1) => ({
  fullName: `Student ${n}`,
  email: `student${n}@example.com`,
  nic: `2000${String(n).padStart(8, "0")}`,
  phone: `077${String(n).padStart(7, "0")}`,
  district: "Jaffna",
});
const req = (
  url: string,
  body?: unknown,
  role = "admin",
  key = "workshop-sheet-test-retry-key-001",
  method = body ? "POST" : "GET",
) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      ...(role
        ? {
            Cookie: `${SESSION_COOKIE}=${signSession({ email: "admin@example.com", name: "Admin", role })}`,
          }
        : {}),
      ...(body
        ? { "Content-Type": "application/json", "Idempotency-Key": key }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const ctx = (id = "workshop-1") => ({ params: { id } });
const settings = (patch: object = {}) => ({
  expectedVersion: "",
  enabled: true,
  sheetId: "shared-sheet",
  sheetName: "Workshop One",
  autoSync: true,
  syncExisting: true,
  clientAttemptId: "713798ef-b66d-453f-94a4-d95e2d13e57c",
  ...patch,
});
const save = (
  body: object = settings(),
  id = "workshop-1",
  key = "workshop-sheet-test-retry-key-001",
) =>
  connect(
    req(`/api/admin/workshops/${id}/sheets/config`, body, "admin", key),
    ctx(id),
  );
async function book(n = 1, id = "workshop-1") {
  return transaction((db) => {
    const student = canonicalStudent(person(n)),
      reg = registrationFor(student, undefined, true);
    return bookWorkshop(id, student, reg)!;
  });
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-workshop-sheets-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv(
    "APP_SECRET",
    "workshop-sheets-test-secret-at-least-32-characters",
  );
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({
    success: true,
    provider: "gmail",
    messageId: "mock-only",
  });
  mocks.formSync.mockResolvedValue({ success: true });
  mocks.workshopSync.mockResolvedValue({ success: true });
  mocks.google.mockResolvedValue({
    spreadsheetId: "shared-sheet",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/shared-sheet/edit",
    properties: { title: "Admissions" },
    sheets: [
      { properties: { title: "Workshop One" } },
      { properties: { title: "Workshop Two" } },
    ],
  });
  await transaction((db) => {
    db.integrations.google = {
      email: "sender@example.com",
      refresh_token: "test-only",
      scopes: [],
      connected_at: new Date().toISOString(),
    };
    db.integrations.registration_sheet_id = "admissions";
    for (let n = 1; n <= 2; n++)
      db.workshops.push({
        id: `workshop-${n}`,
        campaign_id: db.campaigns[0].id,
        title: `Workshop ${n}`,
        description: "",
        venue: "Campus",
        address: "Campus Road",
        google_maps_url: "",
        capacity: 100,
        start_time: new Date(Date.now() + 5 * 86400000).toISOString(),
        end_time: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(),
        reminder_schedule: { days_before: [1] },
        is_active: true,
        created_at: new Date().toISOString(),
      });
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
it("inspects and creates a workshop spreadsheet without overwriting saved configuration", async () => {
  const before = await readDatabase();
  const response = await inspect(
    req("/api/admin/workshops/workshop-1/sheets", {
      action: "inspect",
      sheetId: "https://docs.google.com/spreadsheets/d/shared-sheet/edit",
    }),
    ctx(),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).worksheets).toEqual([
    "Workshop One",
    "Workshop Two",
  ]);
  expect(mocks.google.mock.calls[0][1]).toBeUndefined();
  expect(
    (
      await inspect(
        req("/api/admin/workshops/workshop-1/sheets", { action: "create" }),
        ctx(),
      )
    ).status,
  ).toBe(200);
  const body = JSON.parse(mocks.google.mock.calls[1][1].body);
  expect(body.sheets).toHaveLength(1);
  expect(body.sheets[0].properties.title).toContain("Workshop 1");
  expect(await readDatabase()).toEqual(before);
});
it("does not retry ambiguous external spreadsheet creation", async () => {
  mocks.google.mockRejectedValue(new Error("provider timeout"));
  const response = await inspect(
    req("/api/admin/workshops/workshop-1/sheets", { action: "create" }),
    ctx(),
  );
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe("SHEET_CREATE_UNCONFIRMED");
  expect(mocks.google).toHaveBeenCalledTimes(1);
});
it.each(["", "entrance_staff", "examiner"])(
  "protects inspect, connection settings and manual export for role '%s'",
  async (role) => {
    const status = role ? 403 : 401;
    expect(
      (
        await inspect(
          req(
            "/api/admin/workshops/workshop-1/sheets",
            { action: "inspect", sheetId: "shared-sheet" },
            role,
          ),
          ctx(),
        )
      ).status,
    ).toBe(status);
    expect(
      (
        await connect(
          req(
            "/api/admin/workshops/workshop-1/sheets/config",
            settings(),
            role,
          ),
          ctx(),
        )
      ).status,
    ).toBe(status);
    expect(
      (
        await resync(
          req(
            "/api/admin/workshops/workshop-1/sheets/sync",
            {
              expectedVersion: "x",
              clientAttemptId: settings().clientAttemptId,
            },
            role,
          ),
          ctx(),
        )
      ).status,
    ).toBe(status);
    expect(mocks.google).not.toHaveBeenCalled();
  },
);
it("queues existing bookings atomically when connected and repeats the same save without duplicate jobs", async () => {
  const booking = await book();
  const first = await save(
    settings({
      sheetId: "https://docs.google.com/spreadsheets/d/shared-sheet/edit",
    }),
  );
  expect(first.status).toBe(200);
  const body = await first.json();
  expect(body.queued).toBe(1);
  const replay = await save(
    settings({
      sheetId: "https://docs.google.com/spreadsheets/d/shared-sheet/edit",
    }),
  );
  expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
  const db = await readDatabase(),
    jobs = db.outbox.filter((job) => job.type === "sheet");
  expect(jobs).toHaveLength(1);
  expect(jobs[0].payload).toMatchObject({
    sheetId: "shared-sheet",
    sheetName: "Workshop One",
    workshopId: "workshop-1",
    bookingId: booking.id,
    rows: [
      {
        referenceNo: booking.id,
        bookingId: booking.id,
        fullName: "Student 1",
        email: "student1@example.com",
        phone: person().phone,
        nic: person().nic,
        district: "Jaffna",
        bookingStatus: "confirmed",
        attendanceStatus: "unmarked",
      },
    ],
  });
  expect(
    db.auditLogs.filter(
      (log) => log.action === "WORKSHOP_SHEET_CONNECTION_UPDATED",
    ),
  ).toHaveLength(1);
  expect(mocks.google).not.toHaveBeenCalled();
  expect(mocks.workshopSync).not.toHaveBeenCalled();
});
it("sends bookings for two workshops in separate tabs and deduplicates repeated booking operations", async () => {
  await save();
  await save(
    settings({ sheetName: "Workshop Two" }),
    "workshop-2",
    "second-workshop-connection-key",
  );
  const first = await book(1);
  await book(1);
  await book(2, "workshop-2");
  const before = await readDatabase();
  expect(before.workshopBookings).toHaveLength(2);
  expect(before.outbox.filter((job) => job.type === "sheet")).toHaveLength(2);
  await processOutbox(120, 100);
  await transaction((db) => {
    db.queueControl.sheets_next_dispatch_at = 0;
  });
  await processOutbox(120, 100);
  expect(mocks.workshopSync).toHaveBeenCalledTimes(2);
  expect(
    mocks.workshopSync.mock.calls.map((call) => [call[1], call[2]]),
  ).toEqual([
    ["Workshop One", "workshop-1"],
    ["Workshop Two", "workshop-2"],
  ]);
  expect(mocks.workshopSync.mock.calls[0][3][0].referenceNo).toBe(first.id);
});
it.each(["Workshop One", " workshop one "])(
  "rejects a shared worksheet destination (%s)",
  async (sheetName) => {
    await save();
    expect(
      (
        await save(
          settings({ sheetName }),
          "workshop-2",
          "collision-check-workshop-key",
        )
      ).status,
    ).toBe(409);
  },
);
it("reserves workshop tabs even while disabled and rejects form response destinations", async () => {
  await save(settings({ enabled: false }));
  expect(
    (await save(settings(), "workshop-2", "reserved-workshop-tab-key")).status,
  ).toBe(409);
  expect(
    (
      await save(
        settings({ sheetId: "admissions", sheetName: "Registrations" }),
        "workshop-2",
        "form-tab-conflict-key-001",
      )
    ).status,
  ).toBe(409);
});
it.each(["Bad/Tab", "Bad[Tab]", "'Bad", "Bad'", "x".repeat(101)])(
  "rejects invalid tab name %s",
  async (sheetName) =>
    expect((await save(settings({ sheetName }))).status).toBe(400),
);
it("keeps manual-only mode separate from auto-sync and resyncs idempotently through the queue", async () => {
  const saved = await (
    await save(settings({ autoSync: false, syncExisting: false }))
  ).json();
  await book();
  expect(
    (await readDatabase()).outbox.filter((job) => job.type === "sheet"),
  ).toHaveLength(0);
  const body = {
      expectedVersion: saved.version,
      clientAttemptId: settings().clientAttemptId,
    },
    url = "/api/admin/workshops/workshop-1/sheets/sync";
  const first = await resync(req(url, body), ctx());
  expect((await first.json()).queued).toBe(1);
  expect(
    (await resync(req(url, body), ctx())).headers.get("Idempotency-Replayed"),
  ).toBe("true");
  expect(
    (await readDatabase()).outbox.filter((job) => job.type === "sheet"),
  ).toHaveLength(1);
});
it("blocks old destinations on reconnect, rejects changes during an in-flight export and leaves original rows alone", async () => {
  const connected = await (await save()).json();
  await book();
  const input = settings({
    expectedVersion: connected.version,
    sheetName: "New Workshop Tab",
  });
  await transaction((db) => {
    const job = db.outbox.find((job) => job.type === "sheet")!;
    job.status = "sending";
    job.lease_until = new Date(Date.now() + 120000).toISOString();
  });
  expect(
    (await save(input, "workshop-1", "sending-config-change-key")).status,
  ).toBe(409);
  await transaction((db) => {
    db.outbox.find((job) => job.type === "sheet")!.status = "queued";
  });
  expect(
    (await save(input, "workshop-1", "valid-config-change-key-001")).status,
  ).toBe(200);
  await processOutbox(120, 100);
  const db = await readDatabase();
  expect(
    db.outbox.filter((job) => job.type === "sheet").map((job) => job.status),
  ).toEqual(["blocked", "sent"]);
  expect(mocks.workshopSync.mock.calls[0][1]).toBe("New Workshop Tab");
  expect(
    (
      await save(
        settings({ expectedVersion: connected.version }),
        "workshop-1",
        "stale-workshop-version-key",
      )
    ).status,
  ).toBe(409);
});
it("disables future exports without losing bookings and preserves the current student when Google fails", async () => {
  const initial = await (await save()).json();
  const booking = await book();
  mocks.workshopSync.mockResolvedValue({
    success: false,
    error: "Reconnect Google.",
    errorCode: "GOOGLE_AUTH_REVOKED",
    failureKind: "blocked",
  });
  await processOutbox(120, 100);
  let db = await readDatabase();
  expect(db.workshopBookings[0].id).toBe(booking.id);
  expect(db.outbox.find((job) => job.type === "sheet")!.status).toBe("blocked");
  expect(
    (
      await save(
        settings({ expectedVersion: initial.version, enabled: false }),
        "workshop-1",
        "disable-workshop-export-key",
      )
    ).status,
  ).toBe(200);
  await book(2);
  db = await readDatabase();
  expect(db.workshopBookings).toHaveLength(2);
  expect(db.outbox.filter((job) => job.type === "sheet")).toHaveLength(1);
});
it("concurrent queue workers claim a workshop batch once", async () => {
  await save();
  for (let n = 1; n <= 12; n++) await book(n);
  await transaction((db) => {
    db.outbox = db.outbox.filter((job) => job.type === "sheet");
  });
  await Promise.all([
    processOutbox(120, 100),
    processOutbox(120, 100),
    processOutbox(120, 100),
  ]);
  expect(mocks.workshopSync).toHaveBeenCalledTimes(1);
  expect(mocks.workshopSync.mock.calls[0][3]).toHaveLength(12);
  expect(
    (await readDatabase()).outbox.every((job) => job.status === "sent"),
  ).toBe(true);
});
it("refreshes attendance, application reference and corrected contact details using the same booking ID", async () => {
  await save();
  const booking = await book(),
    db = await readDatabase(),
    student = db.students[0];
  const marked = await attendance(
    req("/api/admin/attendance", {
      workshopId: "workshop-1",
      studentId: student.id,
      status: "attended",
    }),
    {},
  );
  expect(marked.status).toBe(200);
  await transaction((db) =>
    applicationFor(db.students[0], db.registrations[0], {}),
  );
  const corrected = await correctEmail(
    req(
      "/api/admin/candidates/email",
      {
        studentId: student.id,
        expectedEmail: student.email,
        email: "corrected@example.com",
      },
      "admin",
      "workshop-email-correction-key",
      "PATCH",
    ),
    {},
  );
  expect(corrected.status).toBe(200);
  await transaction((db) => {
    db.outbox = db.outbox.filter((job) => job.type === "sheet");
  });
  await processOutbox(120, 100);
  const rows = mocks.workshopSync.mock.calls[0][3];
  expect(
    rows.every(
      (row: any) =>
        row.referenceNo === booking.id &&
        row.email === "corrected@example.com" &&
        row.attendanceStatus === "attended" &&
        row.applicationNo.startsWith("APP-") &&
        row.studentExamId,
    ),
  ).toBe(true);
});
it("refreshes delayed jobs from current canonical records and keeps export status in workshop summaries", async () => {
  await save();
  const booking = await book();
  await transaction((db) => {
    db.students[0].full_name = "Updated canonical name";
    db.workshopBookings[0].status = "cancelled";
    db.outbox = db.outbox.filter((job) => job.type === "sheet");
  });
  await processOutbox(120, 100);
  expect(mocks.workshopSync.mock.calls[0][3][0]).toMatchObject({
    referenceNo: booking.id,
    fullName: "Updated canonical name",
    bookingStatus: "cancelled",
  });
  const db = await readDatabase();
  expect(workshopSheetSummary(db, db.workshops[0])).toMatchObject({
    total: 1,
    synced: 1,
    pending: 0,
  });
  const data = await (await workshops(req("/api/admin/workshops"), {})).json();
  expect(data.canManageSheets).toBe(true);
  expect(data.workshops[0].sheetSync.synced).toBe(1);
  const staff = await (
    await workshops(
      req("/api/admin/workshops", undefined, "entrance_staff"),
      {},
    )
  ).json();
  expect(staff.canManageSheets).toBe(false);
});
it("does not expose unrelated documents, access tokens or template content in booking rows", async () => {
  const booking = await book();
  const row = workshopBookingSheetRow(await readDatabase(), booking.id);
  expect(row?.registrationRef).toMatch(/^REG-/);
  for (const field of [
    "accessToken",
    "password",
    "documents",
    "statement_of_purpose",
    "email_automation",
  ])
    expect(row).not.toHaveProperty(field);
});
it("persists 300 concurrent bookings and matching exports without overbooking or losing queue jobs", async () => {
  await save();
  await transaction((db) => {
    db.workshops[0].capacity = 300;
  });
  const bookings = await Promise.all(
    Array.from({ length: 300 }, (_, n) => book(n + 1)),
  );
  const db = await readDatabase();
  expect(bookings).toHaveLength(300);
  expect(new Set(bookings.map((booking) => booking.id)).size).toBe(300);
  expect(db.workshopBookings).toHaveLength(300);
  const jobs = db.outbox.filter((job) => job.type === "sheet");
  expect(jobs).toHaveLength(300);
  expect(new Set(jobs.map((job) => job.payload.rows[0].referenceNo)).size).toBe(
    300,
  );
  expect(mocks.workshopSync).not.toHaveBeenCalled();
}, 45000);

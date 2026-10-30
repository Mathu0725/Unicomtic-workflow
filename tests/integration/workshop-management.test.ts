import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ send: vi.fn(), sync: vi.fn() }));
vi.mock("../../src/lib/email/smtp-client", () => ({ sendEmail: mocks.send }));
vi.mock("../../src/lib/google/sheets-service", () => ({
  googleSheetsService: {
    syncRecords: mocks.sync,
    syncWorkshopBookings: mocks.sync,
  },
}));
import { transaction, readDatabase } from "../../src/lib/data/repository";
import { databaseContext, type Workshop } from "../../src/lib/data/store";
import {
  canonicalStudent,
  registrationFor,
  bookWorkshop,
  submitCustomForm,
  availableWorkshops,
} from "../../src/lib/admissions/service";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import {
  GET as overview,
  POST as create,
  PATCH as update,
} from "../../src/app/api/admin/workshops/route";
import { GET as detail } from "../../src/app/api/admin/workshops/[id]/route";
import { POST as bookingAction } from "../../src/app/api/admin/workshops/[id]/bookings/route";
import { POST as attach } from "../../src/app/api/admin/workshops/[id]/forms/route";
import {
  GET as preview,
  POST as send,
} from "../../src/app/api/admin/workshops/[id]/reminders/route";
import { PATCH as saveForm } from "../../src/app/api/admin/forms/[id]/route";
import { GET as publicForm } from "../../src/app/api/forms/[slug]/route";
import { workshopSchema } from "../../src/lib/validations/workshop";
import {
  workshopVersion,
  bookingVersion,
  saveWorkshop,
  workshopDetail,
  workshopSummary,
} from "../../src/lib/workshops/management";
import {
  workshopMessage,
  workshopMailPreview,
  queueWorkshopMail,
} from "../../src/lib/workshops/notifications";
import { workshopEmailProblem } from "../../src/lib/workshops/email-policy";
import { workshopOptions } from "../../src/lib/workshops/policy";
import { workshopBookingSheetRow } from "../../src/lib/workshops/booking-sheet-row";
import { runScheduledQueue } from "../../src/lib/jobs/scheduled-queue";
import { processOutbox } from "../../src/lib/jobs/outbox";
import { editorValues } from "../../src/lib/forms/editor";
let dir: string;
const ctx = (id = "workshop-1") => ({ params: Promise.resolve({ id }) });
const request = (
  url: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  role = "admin",
  key = randomUUID(),
) =>
  new NextRequest("http://localhost" + url, {
    method,
    headers: {
      ...(role
        ? {
            Cookie:
              SESSION_COOKIE +
              "=" +
              signSession({ email: "staff@example.com", name: "Staff", role }),
          }
        : {}),
      ...(body
        ? { "Content-Type": "application/json", "Idempotency-Key": key }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const person = (n = 1) => ({
  fullName: "Participant " + n,
  email: "person" + n + "@example.com",
  nic: "2000" + String(n).padStart(8, "0"),
  phone: "077" + String(n).padStart(7, "0"),
  district: "Jaffna",
  terms: true,
});
const values = (w: Workshop) => ({
  campaignId: w.campaign_id,
  title: w.title,
  venue: w.venue,
  address: w.address,
  description: w.description,
  googleMapsUrl: w.google_maps_url,
  startTime: w.start_time,
  endTime: w.end_time,
  capacity: w.capacity,
  bookingDeadline: w.booking_deadline,
  daysBeforeReminders: w.reminder_schedule.days_before,
  remindersEnabled: w.reminders_enabled,
  confirmationEnabled: w.confirmation_enabled,
});
async function book(n = 1, id = "workshop-1") {
  return transaction((db) => {
    const s = canonicalStudent(person(n)),
      r = registrationFor(s, db.campaigns[0].id, true);
    return bookWorkshop(id, s, r)!;
  });
}
async function change(
  id: string,
  action: "cancel" | "move",
  targetWorkshopId?: string,
  key = randomUUID(),
) {
  const db = await readDatabase(),
    b = db.workshopBookings.find((b) => b.id === id)!;
  return bookingAction(
    request(
      "/api/admin/workshops/" + b.workshop_id + "/bookings",
      {
        bookingId: id,
        expectedVersion: bookingVersion(b),
        action,
        targetWorkshopId,
        reason: "Requested by participant",
      },
      "POST",
      "admin",
      key,
    ),
    ctx(b.workshop_id),
  );
}
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tic-workshop-management-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv("APP_SECRET", "workshop-management-test-secret-32-characters");
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({
    success: true,
    provider: "gmail",
    messageId: "test-only",
  });
  mocks.sync.mockResolvedValue({ success: true });
  await transaction((db) => {
    db.workshops = [];
    for (let n = 1; n <= 10; n++)
      db.workshops.push({
        id: "workshop-" + n,
        campaign_id: db.campaigns[0].id,
        title: "Workshop " + n,
        description: "",
        venue: "Venue " + n,
        address: "Campus Road",
        google_maps_url: "",
        start_time: new Date(Date.now() + 5 * 86400000).toISOString(),
        end_time: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(),
        capacity: 50,
        is_active: true,
        created_at: new Date().toISOString(),
        reminder_schedule: { days_before: [3, 1] },
      });
    db.integrations.google = {
      email: "sender@example.com",
      refresh_token: "test-only",
      scopes: [],
      connected_at: new Date().toISOString(),
    };
    db.integrations.email_daily_limit = 500;
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});
it("creates a workshop once on simultaneous retries and never copies old bookings", async () => {
  const db = await readDatabase(),
    payload = values(db.workshops[0]),
    key = randomUUID();
  const responses = await Promise.all(
    [1, 2].map(() =>
      create(
        request("/api/admin/workshops", payload, "POST", "admin", key),
        {},
      ),
    ),
  );
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  expect((await readDatabase()).workshops).toHaveLength(11);
  expect((await readDatabase()).workshopBookings).toHaveLength(0);
});
it.each(["entrance_staff", "examiner", ""])(
  "rejects workshop writes and reminder previews for %s",
  async (role) => {
    const db = await readDatabase(),
      w = db.workshops[0],
      expected = role ? 403 : 401;
    expect(
      (
        await create(
          request("/api/admin/workshops", values(w), "POST", role),
          {},
        )
      ).status,
    ).toBe(expected);
    expect(
      (
        await update(
          request(
            "/api/admin/workshops",
            { id: w.id, is_active: false, expectedVersion: workshopVersion(w) },
            "PATCH",
            role,
          ),
          {},
        )
      ).status,
    ).toBe(expected);
    expect(
      (
        await preview(
          request(
            "/api/admin/workshops/workshop-1/reminders",
            undefined,
            "GET",
            role,
          ),
          ctx(),
        )
      ).status,
    ).toBe(expected);
    expect(
      (
        await attach(
          request(
            "/api/admin/workshops/workshop-1/forms",
            { formId: "x", expectedUpdatedAt: "x", expectedDraftVersion: null },
            "POST",
            role,
          ),
          ctx(),
        )
      ).status,
    ).toBe(expected);
  },
);
it("gives entrance staff participant lookup without reminder deliveries or sending tools", async () => {
  await book();
  const result = await (
    await detail(
      request(
        "/api/admin/workshops/workshop-1",
        undefined,
        "GET",
        "entrance_staff",
      ),
      ctx(),
    )
  ).json();
  expect(result.canManage).toBe(false);
  expect(result.workshop.bookings).toHaveLength(1);
  expect(result.workshop.deliveries).toBeUndefined();
  expect(result.forms).toBeUndefined();
});
it("keeps all ten workshop lists, phone numbers, counts and delivery logs separate", async () => {
  for (let n = 1; n <= 10; n++) await book(n, "workshop-" + n);
  for (let n = 1; n <= 10; n++) {
    const response = await detail(
        request("/api/admin/workshops/workshop-" + n),
        ctx("workshop-" + n),
      ),
      result = await response.json();
    expect(result.workshop.bookedCount).toBe(1);
    expect(result.workshop.remaining).toBe(49);
    expect(result.workshop.bookings.map((b: any) => b.phone)).toEqual([
      person(n).phone,
    ]);
    expect(result.workshop.deliveries.map((j: any) => j.email)).toEqual([
      person(n).email,
    ]);
  }
  const result = await (
    await overview(request("/api/admin/workshops?summary=1"), {})
  ).json();
  expect(result.workshops).toHaveLength(10);
  expect(result.workshops[0].bookings).toBeUndefined();
});
it("edits only the chosen workshop, rejects stale saves and capacity below confirmed bookings", async () => {
  await book(1);
  await book(2);
  const before = await readDatabase(),
    w = before.workshops[0];
  let r = await update(
    request(
      "/api/admin/workshops",
      {
        ...values(w),
        capacity: 1,
        id: w.id,
        expectedVersion: workshopVersion(w),
      },
      "PATCH",
    ),
    {},
  );
  expect(r.status).toBe(409);
  r = await update(
    request(
      "/api/admin/workshops",
      {
        ...values(w),
        capacity: 80,
        id: w.id,
        expectedVersion: workshopVersion(w),
      },
      "PATCH",
    ),
    {},
  );
  expect(r.status).toBe(200);
  const after = await readDatabase();
  expect(after.workshops[0].capacity).toBe(80);
  expect(after.workshops.slice(1)).toEqual(before.workshops.slice(1));
  expect(after.outbox).toHaveLength(before.outbox.length);
  expect(
    (
      await update(
        request(
          "/api/admin/workshops",
          {
            ...values(w),
            capacity: 60,
            id: w.id,
            expectedVersion: workshopVersion(w),
          },
          "PATCH",
        ),
        {},
      )
    ).status,
  ).toBe(409);
});
it("serializes a capacity reduction racing with a new booking", async () => {
  await book();
  const old = (await readDatabase()).workshops[0];
  await Promise.allSettled([
    transaction((db) =>
      saveWorkshop(
        db,
        workshopSchema.parse({ ...values(old), capacity: 1 }),
        "staff",
        db.workshops[0],
        workshopVersion(old),
      ),
    ),
    book(2),
  ]);
  const db = await readDatabase(),
    count = db.workshopBookings.filter((b) => b.status === "confirmed").length;
  expect(count).toBeLessThanOrEqual(db.workshops[0].capacity!);
  expect([1, 2]).toContain(count);
  expect(db.students).toHaveLength(count);
});
it("rejects changing the intake of a booked session or recycling a started session", async () => {
  await book();
  await transaction((db) => {
    const old = db.workshops[0];
    expect(() =>
      saveWorkshop(
        db,
        workshopSchema.parse({ ...values(old), campaignId: "different" }),
        "staff",
        old,
        workshopVersion(old),
      ),
    ).toThrow();
    old.start_time = new Date(Date.now() - 1000).toISOString();
    expect(() =>
      saveWorkshop(
        db,
        workshopSchema.parse({
          ...values(old),
          startTime: new Date(Date.now() + 86400000).toISOString(),
          endTime: new Date(Date.now() + 90000000).toISOString(),
        }),
        "staff",
        old,
        workshopVersion(old),
      ),
    ).toThrow(/started/);
  });
});
it("preserves legacy selection but explicit empty and hidden lists cannot book", async () => {
  await transaction((db) => {
    const s = canonicalStudent(person()),
      r = registrationFor(s, db.campaigns[0].id);
    expect(
      availableWorkshops(r.campaign_id, {
        enabled: true,
        required: false,
        workshop_ids: [],
      }),
    ).toHaveLength(10);
    expect(
      availableWorkshops(r.campaign_id, {
        enabled: true,
        required: false,
        workshop_ids: [],
        selection_mode: "explicit",
      }),
    ).toHaveLength(0);
    for (const config of [
      {
        enabled: true,
        required: false,
        workshop_ids: ["workshop-1"],
        selection_mode: "explicit" as const,
        hidden_ids: ["workshop-1"],
      },
      { enabled: false, required: false, workshop_ids: ["workshop-1"] },
      {
        enabled: true,
        required: false,
        workshop_ids: [],
        selection_mode: "explicit" as const,
      },
    ])
      expect(() => bookWorkshop("workshop-1", s, r, config)).toThrow();
    expect(() =>
      bookWorkshop(undefined, s, r, {
        enabled: true,
        required: true,
        workshop_ids: [],
      }),
    ).toThrow(/select/);
    expect(
      bookWorkshop(undefined, s, r, {
        enabled: true,
        required: false,
        workshop_ids: [],
      }),
    ).toBeUndefined();
  });
});
it("keeps full and closed workshops visible but unbookable in preview and on the server", async () => {
  await book();
  await transaction((db) => {
    db.workshops[0].capacity = 1;
    db.workshops[1].is_active = false;
    const config = {
      enabled: true,
      required: false,
      workshop_ids: ["workshop-1", "workshop-2"],
      selection_mode: "explicit" as const,
    };
    const server = availableWorkshops(db.campaigns[0].id, config),
      preview = workshopOptions(
        db.workshops.map((w) => ({
          ...w,
          bookedCount: w.id === "workshop-1" ? 1 : 0,
        })),
        db.campaigns[0].id,
        config,
      );
    expect(server).toEqual(preview);
    expect(server.map((w) => w.unavailableReason)).toEqual([
      "Full",
      "Booking closed",
    ]);
  });
});
it("attaches to an existing draft without publishing or losing unrelated edits, then rejects stale attachment", async () => {
  const before = await transaction((db) => {
    const f = db.customForms[0];
    f.workshop_config = {
      enabled: false,
      required: false,
      selection_mode: "explicit",
      workshop_ids: [],
    };
    f.editor_draft = {
      base_updated_at: f.updated_at,
      version: "draft-original",
      values: { ...editorValues(f), description: "Unpublished staff edits" },
    };
    return structuredClone(f);
  });
  const payload = {
    formId: before.id,
    expectedUpdatedAt: before.updated_at,
    expectedDraftVersion: before.editor_draft!.version,
  };
  expect(
    (
      await attach(
        request("/api/admin/workshops/workshop-1/forms", payload),
        ctx(),
      )
    ).status,
  ).toBe(200);
  const f = (await readDatabase()).customForms[0];
  expect(f.workshop_config).toEqual(before.workshop_config);
  expect(f.editor_draft!.values.description).toBe("Unpublished staff edits");
  expect(f.editor_draft!.values.workshop_config!.workshop_ids).toEqual([
    "workshop-1",
  ]);
  expect(f.updated_at).toBe(before.updated_at);
  expect(
    (
      await attach(
        request("/api/admin/workshops/workshop-2/forms", payload),
        ctx("workshop-2"),
      )
    ).status,
  ).toBe(409);
});
it("validates same-intake workshops even when only saving a draft", async () => {
  const f = await transaction((db) => {
    db.workshops[0].campaign_id = "another-intake";
    return structuredClone(db.customForms[0]);
  });
  const response = await saveForm(
    request(
      "/api/admin/forms/" + f.id,
      {
        action: "save_draft",
        expectedUpdatedAt: f.updated_at,
        expectedDraftVersion: null,
        draft: {
          ...editorValues(f),
          workshop_config: {
            enabled: true,
            required: false,
            workshop_ids: ["workshop-1"],
            selection_mode: "explicit",
          },
        },
      },
      "PATCH",
    ),
    { params: { id: f.id } },
  );
  expect(response.status).toBe(400);
});
it("publishes explicit attachments and returns only that form's visible workshops", async () => {
  const f = await transaction((db) => {
    const f = db.customForms[0];
    f.fields = [
      { id: "fullName", label: "Name", type: "text", required: true },
      { id: "email", label: "Email", type: "email", required: true },
      { id: "nic", label: "NIC", type: "nic", required: true },
      { id: "phone", label: "Phone", type: "phone", required: true },
    ];
    return structuredClone(f);
  });
  const config = {
    enabled: true,
    required: true,
    selection_mode: "explicit",
    workshop_ids: ["workshop-1", "workshop-2"],
    hidden_ids: ["workshop-2"],
  };
  expect(
    (
      await saveForm(
        request(
          "/api/admin/forms/" + f.id,
          {
            action: "publish",
            expectedUpdatedAt: f.updated_at,
            expectedDraftVersion: null,
            ...editorValues(f),
            workshop_config: config,
          },
          "PATCH",
        ),
        { params: { id: f.id } },
      )
    ).status,
  ).toBe(200);
  const result = await (
    await publicForm(request("/api/forms/" + f.slug), {
      params: { slug: f.slug },
    })
  ).json();
  expect(result.form.workshops.map((w: any) => w.id)).toEqual(["workshop-1"]);
});
it("cancels exactly once on retry, releases one seat, preserves history and updates the Sheet row", async () => {
  const b = await book();
  const key = randomUUID(),
    payload = {
      bookingId: b.id,
      expectedVersion: bookingVersion(b),
      action: "cancel",
      reason: "Requested cancellation",
    };
  await transaction((db) => {
    db.workshops[0].google_sheets_config = {
      enabled: true,
      auto_sync: true,
      sheet_id: "sheet",
      sheet_name: "One",
      version: "1",
      updated_at: new Date().toISOString(),
    };
  });
  for (let n = 0; n < 2; n++)
    expect(
      (
        await bookingAction(
          request(
            "/api/admin/workshops/workshop-1/bookings",
            payload,
            "POST",
            "admin",
            key,
          ),
          ctx(),
        )
      ).status,
    ).toBe(200);
  const db = await readDatabase();
  expect(db.workshopBookings).toHaveLength(1);
  expect(db.workshopBookings[0].status).toBe("cancelled");
  expect(workshopDetail(db, db.workshops[0], true).remaining).toBe(50);
  expect(
    db.auditLogs.filter((a) => a.action === "BOOKING_CANCELLED"),
  ).toHaveLength(1);
  expect(workshopBookingSheetRow(db, b.id)?.bookingStatus).toBe("cancelled");
  expect(
    db.outbox.some((j) => j.type === "sheet" && j.payload.bookingId === b.id),
  ).toBe(true);
});
it("moves a booking atomically and retains source submissions and old/new records", async () => {
  const b = await book();
  await transaction((db) => {
    db.workshopBookings[0].source_submission_ids = ["sub-source"];
    db.formSubmissions.push({
      id: "sub-source",
      form_id: db.customForms[0].id,
      reference_no: "REF",
      registration_id: b.registration_id,
      workshop_id: b.workshop_id,
      data: {},
      synced_to_sheet: false,
      email_sent: false,
      created_at: new Date().toISOString(),
    });
  });
  const r = await change(b.id, "move", "workshop-2");
  expect(r.status).toBe(200);
  const db = await readDatabase(),
    old = db.workshopBookings[0],
    next = db.workshopBookings[1];
  expect(old.status).toBe("cancelled");
  expect(old.moved_to).toBe(next.id);
  expect(next.moved_from).toBe(old.id);
  expect(next.source_submission_ids).toEqual(["sub-source"]);
  expect(db.formSubmissions[0].workshop_id).toBe("workshop-1");
  expect(workshopBookingSheetRow(db, next.id)?.sourceFormIds).toBe(
    db.customForms[0].id,
  );
  expect(
    workshopMailPreview(db, "workshop-1", "manual").recipients,
  ).toHaveLength(0);
  expect(
    workshopMailPreview(db, "workshop-2", "manual").recipients,
  ).toHaveLength(1);
});
it("rolls back a move into a full workshop and blocks changes with attendance records", async () => {
  const b = await book();
  await book(2, "workshop-2");
  await transaction((db) => {
    db.workshops[1].capacity = 1;
  });
  const before = await readDatabase();
  expect((await change(b.id, "move", "workshop-2")).status).toBe(409);
  expect((await readDatabase()).workshopBookings).toEqual(
    before.workshopBookings,
  );
  await transaction((db) => {
    db.attendance.push({
      id: "attendance",
      workshop_id: b.workshop_id,
      student_id: b.student_id,
      status: "attended",
      student_exam_id: "EXAM",
      marked_at: new Date().toISOString(),
      marked_by: "staff",
      verification_method: "checked",
    });
  });
  expect((await change(b.id, "cancel")).status).toBe(409);
});
it("preview and send select only confirmed participants of that workshop and repeat dispatch does not duplicate", async () => {
  await book(1);
  await book(2, "workshop-2");
  const b3 = await book(3);
  await change(b3.id, "cancel");
  const p = await (
    await preview(request("/api/admin/workshops/workshop-1/reminders"), ctx())
  ).json();
  expect(p.recipients.map((r: any) => r.email)).toEqual([person(1).email]);
  const payload = {
    kind: p.kind,
    operationId: p.operationId,
    expiresAt: p.expiresAt,
    recipients: p.recipients.map((r: any) => ({ id: r.id, token: r.token })),
  };
  for (let n = 0; n < 2; n++)
    expect(
      (
        await send(
          request("/api/admin/workshops/workshop-1/reminders", payload),
          ctx(),
        )
      ).status,
    ).toBe(200);
  const jobs = (await readDatabase()).outbox.filter((j) =>
    j.key.startsWith("workshop-manual:"),
  );
  expect(jobs).toHaveLength(1);
  expect(jobs[0].payload.to).toBe(person(1).email);
  expect(jobs[0].payload.subject).toContain("Workshop 1");
  expect(
    (
      await send(
        request("/api/admin/workshops/workshop-2/reminders", payload),
        ctx("workshop-2"),
      )
    ).status,
  ).toBe(409);
});
it.each(["cancel", "contact", "venue", "template"])(
  "rejects a preview when %s changed before queuing",
  async (kind) => {
    const b = await book(),
      db = await readDatabase(),
      p = workshopMailPreview(db, b.workshop_id, "manual");
    if (kind === "cancel") await change(b.id, "cancel");
    else
      await transaction((db) => {
        if (kind === "contact") db.students[0].email = "corrected@example.com";
        if (kind === "venue") db.workshops[0].venue = "New venue";
        if (kind === "template")
          db.emailTemplates.workshop_reminder = {
            subject: "New subject",
            body: "New body",
            version: 1,
            updated_at: new Date().toISOString(),
            updated_by: "staff",
          };
      });
    const current = await readDatabase();
    expect(() =>
      queueWorkshopMail(
        current,
        b.workshop_id,
        {
          ...p,
          recipients: p.recipients.map((r) => ({ id: r.id, token: r.token })),
        },
        "staff",
      ),
    ).toThrow(/changed/);
  },
);
it("allows the same participant's reminders in two workshops but not two deliveries of the same occurrence", async () => {
  await book(1);
  await book(1, "workshop-2");
  await transaction((db) => {
    for (const id of ["workshop-1", "workshop-2"]) {
      const p = workshopMailPreview(db, id, "manual");
      expect(queueWorkshopMail(db, id, p, "staff").queued).toBe(1);
      expect(queueWorkshopMail(db, id, p, "staff").queued).toBe(0);
    }
  });
  expect(
    (await readDatabase()).outbox.filter((j) =>
      j.key.startsWith("workshop-manual:"),
    ),
  ).toHaveLength(2);
});
it("closing new bookings keeps automatic reminders; reminder Off affects only that workshop", async () => {
  await book(1);
  await book(2, "workshop-2");
  await transaction((db) => {
    db.queueControl.email_next_dispatch_at = Date.now() + 86400000;
    for (const w of db.workshops) {
      w.start_time = new Date(Date.now() + 2.5 * 86400000).toISOString();
      w.is_active = false;
    }
    db.workshops[1].reminders_enabled = false;
  });
  await runScheduledQueue();
  await runScheduledQueue();
  const db = await readDatabase(),
    jobs = db.outbox.filter((j) => j.key.startsWith("reminder:"));
  expect(jobs).toHaveLength(1);
  expect(jobs[0].payload.workshopMessage.workshopId).toBe("workshop-1");
  expect(mocks.send).not.toHaveBeenCalled();
});
it("checks queued and legacy messages against current event, contact, cancellation and reminder settings", async () => {
  const b = await book();
  const db = await readDatabase(),
    job = db.outbox[0];
  expect(workshopEmailProblem(db, job)).toBeNull();
  db.workshops[0].venue = "Changed";
  expect(workshopEmailProblem(db, job)).toMatch(/details changed/);
  db.workshops[0].venue = "Venue 1";
  job.payload = workshopMessage(db, b, "scheduled", 3);
  db.workshops[0].reminders_enabled = false;
  expect(workshopEmailProblem(db, job)).toMatch(/disabled/);
  db.workshops[0].reminders_enabled = true;
  db.workshopBookings[0].status = "cancelled";
  expect(workshopEmailProblem(db, job)).toMatch(/confirmed/);
});
it("worker suppresses obsolete queued confirmation and sends only the eligible workshop's message", async () => {
  const a = await book();
  await book(2, "workshop-2");
  await change(a.id, "cancel");
  await processOutbox(2, 4000);
  const db = await readDatabase();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][0].to).toBe(person(2).email);
  expect(db.outbox.find((j) => j.key === "booking:" + a.id)?.error_code).toBe(
    "WORKSHOP_MESSAGE_SUPERSEDED",
  );
});
it("closing bookings or changing capacity preserves legacy reminders, but changing venue supersedes them", async () => {
  const b = await book();
  await transaction((db) => {
    const w = db.workshops[0],
      job = db.outbox[0];
    w.start_time = new Date(Date.now() + 2.5 * 86400000).toISOString();
    job.key = `reminder:${b.id}:3:${w.start_time}`;
    delete job.payload.workshopMessage;
    w.is_active = false;
    w.updated_at = new Date(Date.now() + 10).toISOString();
    expect(workshopEmailProblem(db, job)).toBeNull();
    saveWorkshop(
      db,
      workshopSchema.parse({ ...values(w), capacity: 80 }),
      "staff",
      w,
      workshopVersion(w),
    );
    expect(workshopEmailProblem(db, job)).toBeNull();
    saveWorkshop(
      db,
      workshopSchema.parse({ ...values(w), venue: "New venue" }),
      "staff",
      w,
      workshopVersion(w),
    );
    expect(workshopEmailProblem(db, job)).toMatch(/details changed/);
  });
});
it("rejects an expired reminder preview without creating any jobs", async () => {
  await book();
  const db = await readDatabase(),
    p = workshopMailPreview(db, "workshop-1", "manual");
  const count = db.outbox.length;
  expect(() =>
    queueWorkshopMail(
      db,
      "workshop-1",
      { ...p, expiresAt: Date.now() - 1 },
      "staff",
    ),
  ).toThrow(/expired/);
  expect(db.outbox).toHaveLength(count);
});
it("cannot publish a required workshop block with no available sessions", async () => {
  const f = (await readDatabase()).customForms[0];
  const response = await saveForm(
    request(
      "/api/admin/forms/" + f.id,
      {
        action: "publish",
        expectedUpdatedAt: f.updated_at,
        expectedDraftVersion: null,
        workshop_config: {
          enabled: true,
          required: true,
          selection_mode: "explicit",
          workshop_ids: [],
        },
      },
      "PATCH",
    ),
    { params: { id: f.id } },
  );
  expect(response.status).toBe(400);
  expect((await response.json()).message).toMatch(/no open session/);
});
it("lists only published form attachments while preserving hidden attachment labels", async () => {
  await transaction((db) => {
    const f = db.customForms[0];
    f.is_active = true;
    f.status = "published";
    f.workshop_config = {
      enabled: true,
      required: false,
      selection_mode: "explicit",
      workshop_ids: ["workshop-1"],
      hidden_ids: ["workshop-1"],
    };
    db.customForms = [
      f,
      { ...structuredClone(f), id: "draft", status: "draft" },
      { ...structuredClone(f), id: "inactive", is_active: false },
    ];
    expect(workshopSummary(db, db.workshops[0]).attachedForms).toEqual([
      { id: f.id, title: f.title, hidden: true },
    ]);
  });
});
it.each(["published", "draft"])(
  "protects %s attachments when changing a workshop intake",
  async (state) => {
    await transaction((db) => {
      const w = db.workshops[0],
        f = db.customForms[0];
      db.campaigns.push({
        ...structuredClone(db.campaigns[0]),
        id: "other-intake",
        is_active: true,
      });
      const config = {
        enabled: true,
        required: false,
        selection_mode: "explicit" as const,
        workshop_ids: [w.id],
      };
      f.workshop_config = { ...config, workshop_ids: [] };
      if (state === "published") f.workshop_config = config;
      else
        f.editor_draft = {
          base_updated_at: f.updated_at,
          version: "draft",
          values: { ...editorValues(f), workshop_config: config },
        };
      expect(() =>
        saveWorkshop(
          db,
          workshopSchema.parse({ ...values(w), campaignId: "other-intake" }),
          "staff",
          w,
          workshopVersion(w),
        ),
      ).toThrow(/attached/);
      expect(w.campaign_id).toBe(f.campaign_id);
    });
  },
);
it.each(["cancelled registration", "inactive intake"])(
  "rejects moves for a %s without changing either workshop",
  async (reason) => {
    const b = await book();
    await transaction((db) => {
      if (reason === "cancelled registration")
        db.registrations[0].status = "cancelled";
      else db.campaigns[0].is_active = false;
    });
    expect((await change(b.id, "move", "workshop-2")).status).toBe(409);
    const db = await readDatabase();
    expect(db.workshopBookings).toHaveLength(1);
    expect(db.workshopBookings[0].status).toBe("confirmed");
    expect(db.workshopBookings[0].moved_to).toBeUndefined();
  },
);
it("records the source and date snapshot and admits at most 50 of 300 concurrent submissions", async () => {
  await transaction((db) => {
    db.workshops[0].confirmation_enabled = false;
    const f = db.customForms[0];
    f.fields = [
      { id: "fullName", type: "text", label: "Name", required: true },
      { id: "email", type: "email", label: "Email", required: true },
      { id: "nic", type: "nic", label: "NIC", required: true },
      { id: "phone", type: "phone", label: "Phone", required: true },
      { id: "terms", type: "terms", label: "Terms", required: true },
    ];
    f.workshop_config = {
      enabled: true,
      required: true,
      selection_mode: "explicit",
      workshop_ids: ["workshop-1"],
    };
    f.email_automation.enabled = false;
  });
  const results = await Promise.allSettled(
    Array.from({ length: 300 }, (_, i) =>
      transaction((db) =>
        submitCustomForm(db.customForms[0], person(i + 1), {
          workshopId: "workshop-1",
        }),
      ),
    ),
  );
  const db = await readDatabase(),
    accepted = results.filter((r) => r.status === "fulfilled").length;
  expect(accepted).toBe(50);
  expect(db.workshopBookings).toHaveLength(50);
  expect(db.students).toHaveLength(50);
  expect(db.registrations).toHaveLength(50);
  expect(db.formSubmissions).toHaveLength(50);
  expect(
    db.formSubmissions.every(
      (s) => s.workshop_snapshot?.title === "Workshop 1",
    ),
  ).toBe(true);
  expect(
    db.workshopBookings.every((b) => b.source_submission_ids?.length === 1),
  ).toBe(true);
  expect(mocks.send).not.toHaveBeenCalled();
}, 60000);

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
const send = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/email/smtp-client", () => ({ sendEmail: send }));
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import { GET, POST } from "../../src/app/api/admin/email/manual/route";
import { POST as preview } from "../../src/app/api/admin/email/manual/preview/route";
import { GET as directoryGet } from "../../src/app/api/admin/email/candidates/route";
import { processOutbox } from "../../src/lib/jobs/outbox";
let directory: string;
const request = (
  url: string,
  body?: unknown,
  role = "admin",
  key = "manual-message-test-key-001",
) =>
  new NextRequest(`http://localhost:3000${url}`, {
    method: body ? "POST" : "GET",
    headers: {
      cookie: `${SESSION_COOKIE}=${signSession({ email: "admin@example.com", name: "Admin", role })}`,
      ...(body
        ? { "Content-Type": "application/json", "Idempotency-Key": key }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const input = (patch: object = {}) => ({
  candidates: [
    {
      stage: "registration",
      recordId: "reg-1",
      expectedEmail: "one@example.com",
    },
  ],
  directRecipients: [],
  subject: "Update {{reference}}",
  body: "Dear {{name}},\nYour intake: {{intake}}. <safe>",
  accountId: "",
  clientAttemptId: "ebba0c92-2129-46a1-a864-4f922d4c268e",
  ...patch,
});
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-manual-email-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv("APP_SECRET", "manual-message-secret-at-least-32-characters");
  send.mockReset();
  send.mockResolvedValue({
    success: true,
    provider: "smtp",
    messageId: "mock-manual-accepted",
  });
  await transaction((db) => {
    db.students = [
      {
        id: "stu-1",
        full_name: "One Student",
        email: "one@example.com",
        district: "Jaffna",
        phone: "0771234567",
      } as any,
      {
        id: "stu-2",
        full_name: "Two Student",
        email: "two@example.com",
        district: "Colombo",
      } as any,
    ];
    db.registrations = [
      {
        id: "reg-1",
        student_id: "stu-1",
        reference_no: "REG-1",
        campaign_id: "camp-2025",
        status: "registered",
      } as any,
      {
        id: "reg-2",
        student_id: "stu-2",
        reference_no: "REG-2",
        campaign_id: "camp-2026",
        status: "invited",
      } as any,
    ];
    db.applications = [
      {
        id: "app-1",
        student_id: "stu-1",
        registration_id: "reg-1",
        application_no: "APP-1",
        status: "submitted",
      } as any,
    ];
    db.integrations.google = {
      email: "sender@example.com",
      refresh_token: "encrypted-test",
      scopes: [],
      connected_at: new Date().toISOString(),
    };
    db.formSubmissions = [
      {
        id: "sub-1",
        form_id: db.customForms[0].id,
        registration_id: "reg-1",
      } as any,
    ];
    db.workshopBookings = [
      {
        id: "booking-1",
        registration_id: "reg-1",
        student_id: "stu-1",
        workshop_id: "workshop-1",
        status: "confirmed",
      } as any,
    ];
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it("previews personalized content without jobs and sends a single candidate through the central outbox", async () => {
  const data = await (
    await preview(request("/api/admin/email/manual/preview", input()), {})
  ).json();
  expect(data).toMatchObject({
    recipientCount: 1,
    duplicateCount: 0,
    previews: [
      {
        to: "one@example.com",
        subject: "Update REG-1",
        text: expect.stringContaining("Dear One Student"),
      },
    ],
  });
  expect((await readDatabase()).outbox).toHaveLength(0);
  const sent = await (
    await POST(request("/api/admin/email/manual", input()), {})
  ).json();
  expect(sent).toMatchObject({ success: true, recipientCount: 1 });
  expect(send).not.toHaveBeenCalled();
  const db = await readDatabase();
  expect(db.outbox[0]).toMatchObject({
    initiated_by: "admin@example.com",
    email_account_id: "gmail",
    payload: {
      to: "one@example.com",
      subject: "Update REG-1",
      html: expect.stringContaining("&lt;safe&gt;"),
      notificationEvent: "manual_message",
      candidateMessage: { recordId: "reg-1" },
    },
  });
  await processOutbox();
  expect(send).toHaveBeenCalledTimes(1);
  expect((await readDatabase()).outbox[0].status).toBe("sent");
});
it("requires the unique recipient count, deduplicates mixed candidate/direct addresses and isolates messages", async () => {
  const body = input({
    subject: "Notice {{name}}",
    body: "Hello {{name}}",
    directRecipients: ["ONE@example.com", "two@example.com", "TWO@example.com"],
  });
  const view = await (
    await preview(request("/api/admin/email/manual/preview", body), {})
  ).json();
  expect(view).toMatchObject({ recipientCount: 2, duplicateCount: 2 });
  expect(
    (await POST(request("/api/admin/email/manual", body), {})).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request("/api/admin/email/manual", {
          ...body,
          confirmRecipientCount: 4,
        }),
        {},
      )
    ).status,
  ).toBe(400);
  const confirmed = { ...body, confirmRecipientCount: 2 };
  expect(
    (await POST(request("/api/admin/email/manual", confirmed), {})).status,
  ).toBe(200);
  const replay = await POST(request("/api/admin/email/manual", confirmed), {});
  expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
  const db = await readDatabase();
  expect(db.outbox).toHaveLength(2);
  expect(db.outbox.map((job) => job.payload.to)).toEqual([
    "one@example.com",
    "two@example.com",
  ]);
  for (const job of db.outbox) {
    expect(job.payload).not.toHaveProperty("cc");
    expect(job.payload).not.toHaveProperty("bcc");
  }
  expect(
    db.auditLogs.filter((log) => log.action === "MANUAL_EMAIL_BATCH_QUEUED"),
  ).toHaveLength(1);
  expect(
    (
      await POST(
        request("/api/admin/email/manual", { ...confirmed, body: "changed" }),
        {},
      )
    ).status,
  ).toBe(409);
});
it("queues only the explicit test address and records the selected account and template version", async () => {
  await transaction((db) => {
    db.emailAccounts.push({
      id: "smtp-test",
      name: "SMTP test",
      username: "smtp@example.com",
      password: "encrypted-only-test",
      is_active: true,
    } as any);
    db.emailTemplates.candidate_message = {
      subject: "Saved",
      body: "Saved",
      version: 4,
      updated_at: new Date().toISOString(),
      updated_by: "admin",
    };
  });
  const response = await POST(
    request(
      "/api/admin/email/manual",
      input({
        accountId: "smtp-test",
        templateId: "candidate_message",
        testRecipient: "test-inbox@example.com",
      }),
    ),
    {},
  );
  expect(response.status).toBe(200);
  const job = (await readDatabase()).outbox[0];
  expect(job).toMatchObject({
    email_account_id: "smtp-test",
    initiated_by: "admin@example.com",
    payload: {
      to: "test-inbox@example.com",
      notificationEvent: "manual_test",
      templateId: "candidate_message",
      templateVersion: 4,
    },
  });
  expect(job.payload.candidateMessage).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});
it.each([
  { directRecipients: ["invalid"] },
  { directRecipients: ["candidate@example.con"] },
  { subject: "Hi\r\nBcc: another@example.com" },
  { body: "Unknown {{secret}}" },
  { body: "Broken {{name" },
  { body: "Private link https://uticx.com/access#token=do-not-save" },
  { accountId: "missing" },
  {
    candidates: [
      {
        stage: "registration",
        recordId: "reg-1",
        expectedEmail: "forged@example.com",
      },
    ],
  },
])(
  "rejects invalid recipients, templates, accounts or contacts %#",
  async (patch) => {
    const response = await POST(
      request("/api/admin/email/manual", input(patch)),
      {},
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await readDatabase()).outbox).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  },
);
it("requires candidate values instead of silently leaving unresolved variables for direct recipients", async () => {
  const response = await POST(
    request(
      "/api/admin/email/manual",
      input({ candidates: [], directRecipients: ["direct@example.com"] }),
    ),
    {},
  );
  expect(response.status).toBe(400);
  expect((await response.json()).message).toContain("reference");
  expect(
    (
      await POST(
        request(
          "/api/admin/email/manual",
          input({
            candidates: [],
            directRecipients: ["direct@example.com"],
            subject: "Hello",
            body: "Dear {{name}}, {{institution}}",
          }),
        ),
        {},
      )
    ).status,
  ).toBe(200);
});
it.each(["entrance_staff", "examiner", "unknown"])(
  "forbids %s for directory, preview, progress and sends",
  async (role) => {
    expect(
      (await GET(request("/api/admin/email/manual", undefined, role), {}))
        .status,
    ).toBe(403);
    expect(
      (
        await preview(
          request("/api/admin/email/manual/preview", input(), role),
          {},
        )
      ).status,
    ).toBe(403);
    expect(
      (await POST(request("/api/admin/email/manual", input(), role), {}))
        .status,
    ).toBe(403);
  },
);
it("filters candidates by intake/form/workshop and reports batch progress", async () => {
  const form = (await readDatabase()).customForms[0];
  const data = await (
    await directoryGet(
      request(
        `/api/admin/email/candidates?intake=camp-2025&form=${form.id}&workshop=workshop-1`,
      ),
      {},
    )
  ).json();
  expect(data.total).toBe(1);
  expect(data.candidates[0].id).toBe("reg-1");
  const batch = await (
    await POST(request("/api/admin/email/manual", input()), {})
  ).json();
  const progress = await (
    await GET(request(`/api/admin/email/manual?batchId=${batch.batchId}`), {})
  ).json();
  expect(progress.progress).toMatchObject({
    total: 1,
    statuses: { queued: 1, sent: 0 },
  });
});
it("preserves candidate contact checks when sending a manual batch", async () => {
  await POST(request("/api/admin/email/manual", input()), {});
  await transaction((db) => {
    db.students[0].email = "updated@example.com";
  });
  await processOutbox();
  expect(send).not.toHaveBeenCalled();
  expect((await readDatabase()).outbox[0]).toMatchObject({
    status: "failed",
    error_code: "CANDIDATE_CONTACT_CHANGED",
  });
});

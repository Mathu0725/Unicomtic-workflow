import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  verify: vi.fn(),
  send: vi.fn(),
  sheet: vi.fn(),
}));
vi.mock("../../src/lib/email/smtp-network", () => ({
  resolveSmtpHost: mocks.resolve,
}));
vi.mock("../../src/lib/email/smtp-client", () => ({
  sendEmail: mocks.send,
  verifySmtpConnection: mocks.verify,
  getDefaultSmtpConfig: vi.fn(() => ({
    password: "private-only-test-credential",
  })),
}));
vi.mock("../../src/lib/google/sheets-service", () => ({
  googleSheetsService: { syncRecords: mocks.sheet },
}));
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { encrypt, decrypt } from "../../src/lib/security/secrets";
import { SESSION_COOKIE, signSession } from "../../src/lib/security/session";
import { GET, POST } from "../../src/app/api/admin/email/accounts/route";
import { POST as testSend } from "../../src/app/api/admin/email/accounts/test/route";
import { GET as legacyGet } from "../../src/app/api/admin/email/route";
import { POST as saveRouting } from "../../src/app/api/admin/email/routing/route";
import {
  GET as history,
  POST as queueAction,
} from "../../src/app/api/admin/notifications/route";
import { processOutbox, enqueue, queueSheet } from "../../src/lib/jobs/outbox";
import {
  emailBudget,
  emailSender,
  EMAIL_DAY_MS,
} from "../../src/lib/email/sending-budget";
import { submitCustomForm } from "../../src/lib/admissions/service";
let directory: string;
const req = (
  url: string,
  body?: unknown,
  role = "admin",
  key = "smtp-settings-test-key-001",
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
const accountInput = (patch: object = {}) => ({
  name: "Admissions SMTP",
  host: "smtp.example.com",
  port: 587,
  username: "sender@example.com",
  password: "private-only-test-credential",
  encryption: "starttls",
  from_name: "Admissions",
  from_email: "sender@example.com",
  reply_to: "reply@example.com",
  timeout_ms: 6000,
  daily_limit: 20,
  is_active: true,
  ...patch,
});
async function add(patch: object = {}) {
  const response = await POST(
    req("/api/admin/email/accounts", {
      action: "save",
      account: accountInput(patch),
    }),
    {},
  );
  expect(response.status).toBe(200);
  return (await readDatabase()).emailAccounts.at(-1)!;
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-smtp-management-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv("APP_SECRET", "smtp-management-secret-at-least-32-characters");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue("8.8.8.8");
  mocks.verify.mockResolvedValue({
    success: true,
    message: "SMTP connection verified.",
  });
  mocks.send.mockResolvedValue({
    success: true,
    provider: "smtp",
    messageId: "mock-provider-id",
  });
  mocks.sheet.mockResolvedValue({ success: true });
  await transaction((db) => {
    db.integrations.google = {
      email: "connected@example.com",
      refresh_token: encrypt("test-only-refresh"),
      scopes: [],
      connected_at: new Date().toISOString(),
    };
    db.integrations.registration_sheet_id = "admissions";
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it("keeps acceptance uncertain after a worker crashes between SMTP acceptance and recording success", async () => {
  const account = await add();
  await transaction((db) =>
    enqueue(db, "email", "accept-then-crash", {
      to: "one@example.com",
      subject: "Saved",
      html: "Saved",
      smtpAccountId: account.id,
    }),
  );
  const repository = await import("../../src/lib/data/repository"),
    original = repository.transaction;
  const spy = vi.spyOn(repository, "transaction");
  spy
    .mockImplementationOnce((fn, options) => original(fn, options))
    .mockRejectedValueOnce(new Error("Simulated persistence interruption"));
  await expect(processOutbox(1)).rejects.toThrow(
    "Simulated persistence interruption",
  );
  spy.mockRestore();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect((await readDatabase()).outbox[0].status).toBe("sending");
  await transaction((db) => {
    db.outbox[0].lease_until = new Date(Date.now() - 1).toISOString();
  });
  await processOutbox();
  await processOutbox();
  const db = await readDatabase();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(db.outbox[0]).toMatchObject({
    status: "uncertain",
    error_code: "SEND_UNCERTAIN",
  });
  expect(db.outbox[0].delivery_attempts?.at(-1)?.outcome).toBe("uncertain");
});

it("bounds transient failures at eight automatic attempts and does not treat quota waiting as a fallback trigger", async () => {
  const a = await add(),
    b = await add({ name: "B", username: "b@example.com" });
  await transaction((db) => {
    const job = enqueue(db, "email", "bounded", {
      to: "one@example.com",
      subject: "Saved",
      html: "Saved",
      smtpAccountId: a.id,
    });
    job.attempts = 7;
  });
  mocks.send.mockResolvedValue({
    success: false,
    error: "Temporary failure",
    errorCode: "SMTP_CONNECTION_INTERRUPTED",
    failureKind: "temporary",
  });
  await processOutbox();
  expect((await readDatabase()).outbox[0]).toMatchObject({
    status: "failed",
    attempts: 8,
  });
  await transaction((db) => {
    db.queueControl.email_next_dispatch_at = 0;
    enqueue(db, "email", "quota-no-fallback", {
      to: "two@example.com",
      subject: "Saved",
      html: "Saved",
      smtpAccountId: a.id,
      fallbackSmtpAccountId: b.id,
    });
  });
  mocks.send.mockResolvedValue({
    success: false,
    error: "Daily sending limit",
    errorCode: "EMAIL_PROVIDER_DAILY_LIMIT",
    failureKind: "temporary",
    retryAfterMs: EMAIL_DAY_MS,
  });
  await processOutbox();
  const job = (await readDatabase()).outbox[1];
  expect(job).toMatchObject({ status: "queued", email_account_id: a.id });
  expect(job.fallback_used).toBeUndefined();
});
it("adds encrypted accounts without changing Gmail default; responses, legacy API and audits contain no password", async () => {
  const account = await add();
  expect(account.password).not.toBe(accountInput().password);
  expect(decrypt(account.password!)).toBe(accountInput().password);
  expect((await readDatabase()).integrations.email_provider).toBe("gmail");
  for (const response of [
    await GET(req("/api/admin/email/accounts"), {}),
    await legacyGet(req("/api/admin/email"), {}),
  ]) {
    const text = await response.text();
    expect(text).not.toContain(accountInput().password);
    expect(text).not.toContain(account.password!);
    expect(
      JSON.parse(text).accounts?.at(-1)?.passwordSaved ??
        JSON.parse(text).emailAccounts.at(-1).passwordSaved,
    ).toBe(true);
  }
  expect(JSON.stringify((await readDatabase()).auditLogs)).not.toContain(
    accountInput().password,
  );
});
it("keeps the saved credential on blank edit, rejects stale changes and protects the default account", async () => {
  const account = await add();
  expect(
    (
      await POST(
        req("/api/admin/email/accounts", { action: "default", id: account.id }),
        {},
      )
    ).status,
  ).toBe(200);
  const edit = {
    action: "save",
    id: account.id,
    expectedUpdatedAt: account.updated_at,
    account: accountInput({ password: "", name: "Updated" }),
  };
  expect((await POST(req("/api/admin/email/accounts", edit), {})).status).toBe(
    200,
  );
  expect((await readDatabase()).emailAccounts.at(-1)!.password).toBe(
    account.password,
  );
  expect((await POST(req("/api/admin/email/accounts", edit), {})).status).toBe(
    409,
  );
  const current = (await readDatabase()).emailAccounts.at(-1)!;
  expect(
    (
      await POST(
        req("/api/admin/email/accounts", {
          ...edit,
          expectedUpdatedAt: current.updated_at,
          account: accountInput({ password: "", is_active: false }),
        }),
        {},
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        req("/api/admin/email/accounts", { action: "default", id: "gmail" }),
        {},
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await POST(
        req("/api/admin/email/accounts", {
          ...edit,
          expectedUpdatedAt: current.updated_at,
          account: accountInput({ password: "", is_active: false }),
        }),
        {},
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await POST(
        req("/api/admin/email/accounts", { action: "default", id: account.id }),
        {},
      )
    ).status,
  ).toBe(503);
});
it.each(["entrance_staff", "examiner", "unknown"])(
  "rejects %s for account reads, configuration, test sends and preview dispatch",
  async (role) => {
    expect(
      (await GET(req("/api/admin/email/accounts", undefined, role), {})).status,
    ).toBe(403);
    expect(
      (
        await POST(
          req(
            "/api/admin/email/accounts",
            { action: "save", account: accountInput() },
            role,
          ),
          {},
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await testSend(
          req(
            "/api/admin/email/accounts/test",
            { accountId: "gmail", recipient: "test@example.com" },
            role,
          ),
          {},
        )
      ).status,
    ).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  },
);
it("verifies without sending and records a safe test result; queued test sends are idempotent and budgeted", async () => {
  const account = await add();
  expect(
    (
      await POST(
        req("/api/admin/email/accounts", { action: "verify", id: account.id }),
        {},
      )
    ).status,
  ).toBe(200);
  expect(mocks.verify).toHaveBeenCalledTimes(1);
  expect(mocks.send).not.toHaveBeenCalled();
  expect((await readDatabase()).emailAccounts.at(-1)!.last_test?.success).toBe(
    true,
  );
  const body = { accountId: account.id, recipient: "test@example.com" };
  const first = await (
    await testSend(req("/api/admin/email/accounts/test", body), {})
  ).json();
  const second = await (
    await testSend(req("/api/admin/email/accounts/test", body), {})
  ).json();
  expect(second.jobId).toBe(first.jobId);
  await processOutbox();
  const db = await readDatabase();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(db.outbox[0].email_account_id).toBe(account.id);
  expect(
    emailBudget(db, Date.now(), emailSender(db, account.id), account.id).used,
  ).toBe(1);
});
it.each([
  { port: 0 },
  { encryption: "none" },
  { host: "http://127.0.0.1" },
  { from_email: "bad" },
  { timeout_ms: 90000 },
  { daily_limit: 501 },
  { password: "" },
])("rejects invalid account configuration %#", async (patch) => {
  expect(
    (
      await POST(
        req("/api/admin/email/accounts", {
          action: "save",
          account: accountInput(patch),
        }),
        {},
      )
    ).status,
  ).toBe(400);
  expect((await readDatabase()).emailAccounts).toHaveLength(1);
});
it("atomically queues two forms' receipts and staff alerts with their selected accounts; off leaves Sheets independent", async () => {
  const primary = await add(),
    second = await add({
      name: "Secondary",
      username: "other@example.com",
      from_email: "other@example.com",
    });
  await transaction((db) => {
    for (const [index, form] of db.customForms.entries()) {
      form.fields = [
        { id: "fullName", type: "text", label: "Name", required: true },
        { id: "email", type: "email", label: "Email", required: true },
        { id: "nic", type: "nic", label: "NIC", required: true },
        { id: "phone", type: "phone", label: "Phone", required: true },
      ];
      if (form.type === "application") form.application_mode = "open";
      form.google_sheets_config = {
        enabled: true,
        sheet_id: "admissions",
        sheet_name:
          form.type === "application" ? "Applications" : "Registrations",
        auto_sync: true,
      };
      Object.assign(form.email_automation, {
        enabled: true,
        send_applicant_email: true,
        send_admin_notification: true,
        applicant_template:
          form.type === "application"
            ? "application_confirmation"
            : "registration_confirmation",
        admin_template: "admin_submission",
        admin_emails: ["staff@example.com"],
        applicant_account_id: index === 0 ? primary.id : second.id,
        admin_account_id: primary.id,
      });
      submitCustomForm(form, {
        fullName: `Student ${index}`,
        email: `student${index}@example.com`,
        nic: `2000123456${String(index).padStart(2, "0")}`,
        phone: `07712345${String(index).padStart(2, "0")}`,
      });
    }
  });
  const db = await readDatabase();
  expect(mocks.send).not.toHaveBeenCalled();
  const receipts = db.outbox.filter(
    (job) => job.payload.notificationEvent === "submission_confirmation",
  );
  expect(receipts).toHaveLength(2);
  expect(receipts.map((job) => job.email_account_id)).toEqual([
    primary.id,
    second.id,
  ]);
  expect(receipts.map((job) => job.payload.templateId)).toEqual([
    "registration_confirmation",
    "application_confirmation",
  ]);
  expect(
    db.outbox
      .filter((job) => job.payload.notificationEvent === "staff_alert")
      .every((job) => job.email_account_id === primary.id),
  ).toBe(true);
  expect(db.outbox.filter((job) => job.type === "sheet")).toHaveLength(2);
  await transaction((db) => {
    const form = db.customForms[0];
    form.email_automation.send_applicant_email = false;
    form.email_automation.send_admin_notification = false;
    submitCustomForm(form, {
      fullName: "No email",
      email: "off@example.com",
      nic: "200012345699",
      phone: "0771234599",
    });
  });
  const after = await readDatabase();
  expect(after.outbox.filter((job) => job.type === "email")).toHaveLength(
    db.outbox.filter((job) => job.type === "email").length,
  );
  expect(after.outbox.filter((job) => job.type === "sheet")).toHaveLength(3);
});
it("pins default at enqueue and isolates a broken account from another account and Sheets", async () => {
  const a = await add(),
    b = await add({ name: "B", username: "b@example.com" });
  await transaction((db) => {
    db.integrations.default_email_account_id = a.id;
    enqueue(db, "email", "default", {
      to: "one@example.com",
      subject: "Saved",
      html: "Saved",
    });
    enqueue(db, "email", "other", {
      to: "two@example.com",
      subject: "Saved",
      html: "Saved",
      smtpAccountId: b.id,
    });
    db.integrations.default_email_account_id = b.id;
    queueSheet(db, "admissions", "Registrations", { referenceNo: "REG-1" });
  });
  mocks.send.mockImplementation(async (payload) =>
    payload.smtpAccountId === a.id
      ? {
          success: false,
          error: "Authentication failed.",
          errorCode: "SMTP_AUTH_FAILED",
          failureKind: "blocked",
        }
      : { success: true, provider: "smtp", messageId: "b-accepted" },
  );
  await Promise.all([processOutbox(), processOutbox()]);
  const db = await readDatabase();
  expect(db.outbox.find((job) => job.key === "default")).toMatchObject({
    status: "blocked",
    email_account_id: a.id,
  });
  expect(db.outbox.find((job) => job.key === "other")).toMatchObject({
    status: "sent",
    email_account_id: b.id,
  });
  expect(mocks.sheet).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledTimes(2);
});
it("uses only an explicitly configured fallback after known rejection and retains account history", async () => {
  const a = await add(),
    b = await add({ name: "B", username: "b@example.com" });
  await transaction((db) =>
    enqueue(db, "email", "fallback", {
      to: "one@example.com",
      subject: "Saved",
      html: "Saved",
      smtpAccountId: a.id,
      fallbackSmtpAccountId: b.id,
    }),
  );
  mocks.send.mockResolvedValueOnce({
    success: false,
    error: "Auth failed.",
    errorCode: "SMTP_AUTH_FAILED",
    failureKind: "blocked",
  });
  await processOutbox();
  let db = await readDatabase();
  expect(db.outbox[0]).toMatchObject({
    status: "queued",
    email_account_id: b.id,
    fallback_used: true,
    attempts: 1,
  });
  await transaction((db) => {
    db.outbox[0].next_attempt_at = new Date(Date.now() - 1).toISOString();
    db.queueControl.email_next_dispatch_at = 0;
  });
  await processOutbox();
  db = await readDatabase();
  expect(db.outbox[0].status).toBe("sent");
  expect(
    db.outbox[0].delivery_attempts?.map((attempt) => [
      attempt.account_id,
      attempt.outcome,
    ]),
  ).toEqual([
    [a.id, "rejected"],
    [b.id, "accepted"],
  ]);
});
it("does not use fallback for uncertain delivery; verification is required before audited retry", async () => {
  const a = await add(),
    b = await add({ name: "B" });
  await transaction((db) =>
    enqueue(db, "email", "uncertain", {
      to: "one@example.com",
      subject: "Saved",
      html: "Saved",
      smtpAccountId: a.id,
      fallbackSmtpAccountId: b.id,
    }),
  );
  mocks.send.mockResolvedValue({
    success: false,
    error: "Check provider logs.",
    errorCode: "SEND_UNCERTAIN",
    failureKind: "uncertain",
    uncertain: true,
  });
  await processOutbox();
  await processOutbox();
  const db = await readDatabase(),
    job = db.outbox[0];
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(job).toMatchObject({ status: "uncertain", email_account_id: a.id });
  expect(
    emailBudget(db, Date.now(), emailSender(db, a.id), a.id).uncertain,
  ).toBe(1);
  expect(
    (
      await queueAction(
        req("/api/admin/notifications", { action: "retry", jobId: job.id }),
        {},
      )
    ).status,
  ).toBe(400);
  mocks.send.mockResolvedValue({
    success: false,
    failureKind: "permanent",
    errorCode: "RECIPIENT_REJECTED",
  });
  expect(
    (
      await queueAction(
        req("/api/admin/notifications", {
          action: "retry",
          jobId: job.id,
          confirmProviderChecked: true,
        }),
        {},
      )
    ).status,
  ).toBe(200);
  expect(
    (await readDatabase()).auditLogs.some(
      (log) => log.action === "DELIVERY_RETRY_REQUESTED",
    ),
  ).toBe(true);
});
it("applies account caps across concurrent workers, shares aliases, and recovers after 24 hours", async () => {
  const a = await add({
      username: "s.e.n.d.e.r+portal@gmail.com",
      daily_limit: 1,
    }),
    b = await add({
      name: "Alias",
      username: "sender@googlemail.com",
      daily_limit: 1,
    });
  await transaction((db) => {
    for (let n = 0; n < 3; n++)
      enqueue(db, "email", `cap:${n}`, {
        to: `student${n}@example.com`,
        subject: "Saved",
        html: "Saved",
        smtpAccountId: n === 0 ? a.id : b.id,
      });
  });
  await Promise.all([processOutbox(), processOutbox()]);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  let db = await readDatabase();
  expect(
    emailBudget(db, Date.now(), emailSender(db, b.id), b.id),
  ).toMatchObject({ used: 1, canSend: false });
  await transaction((db) => {
    for (const record of db.queueControl.email_dispatches || [])
      record.at -= EMAIL_DAY_MS + 1;
    db.queueControl.email_next_dispatch_at = 0;
  });
  await processOutbox();
  db = await readDatabase();
  expect(mocks.send).toHaveBeenCalledTimes(2);
  expect(db.outbox.filter((job) => job.status === "sent")).toHaveLength(2);
});
it("saves form account selections and filters activity by account, purpose, form, origin, date and provider id", async () => {
  const account = await add(),
    form = (await readDatabase()).customForms[0];
  const input = {
    formId: form.id,
    expectedUpdatedAt: form.updated_at,
    applicant: "registration_confirmation",
    staff: "admin_submission",
    staffEmails: [],
    invitationFormId: "",
    applicantAccountId: account.id,
    staffAccountId: "gmail",
    applicantFallbackAccountId: "gmail",
    staffFallbackAccountId: "",
  };
  expect(
    (await saveRouting(req("/api/admin/email/routing", input), {})).status,
  ).toBe(200);
  await transaction((db) => {
    const job = enqueue(db, "email", "filter", {
      to: "candidate@example.com",
      subject: "Receipt",
      html: "Saved",
      smtpAccountId: account.id,
      formId: form.id,
      notificationEvent: "submission_confirmation",
    });
    job.status = "sent";
    job.provider_id = "provider-unique-id";
  });
  const query = new URLSearchParams({
    account: account.id,
    form: form.id,
    purpose: "submission_confirmation",
    origin: "automatic",
    from: new Date().toISOString().slice(0, 10),
    search: "provider-unique-id",
  });
  const data = await (
    await history(req(`/api/admin/notifications?${query}`), {})
  ).json();
  expect(data.total).toBe(1);
  expect(data.jobs[0]).toMatchObject({
    accountId: account.id,
    accountName: "Admissions SMTP",
    formId: form.id,
  });
});

it("records verified provider acceptance without resending an uncertain message", async () => {
  const account = await add();
  await transaction((db) =>
    enqueue(db, "email", "verified-uncertain", {
      to: "one@example.com",
      subject: "Saved",
      html: "Saved",
      smtpAccountId: account.id,
    }),
  );
  mocks.send.mockResolvedValue({
    success: false,
    error: "Check provider logs.",
    errorCode: "SEND_UNCERTAIN",
    failureKind: "uncertain",
    uncertain: true,
  });
  await processOutbox();
  const job = (await readDatabase()).outbox[0];
  expect(
    (
      await queueAction(
        req("/api/admin/notifications", {
          action: "reconcile_accepted",
          jobId: job.id,
          providerId: "provider-verified",
        }),
        {},
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await queueAction(
        req("/api/admin/notifications", {
          action: "reconcile_accepted",
          jobId: job.id,
          providerId: "provider-verified",
          confirmProviderChecked: true,
        }),
        {},
      )
    ).status,
  ).toBe(200);
  await processOutbox();
  const db = await readDatabase();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(db.outbox[0]).toMatchObject({
    status: "sent",
    provider_id: "provider-verified",
  });
  expect(
    emailBudget(db, Date.now(), emailSender(db, account.id), account.id),
  ).toMatchObject({ used: 1, accepted: 1, uncertain: 0 });
  expect(
    db.auditLogs.some((log) => log.action === "EMAIL_ACCEPTANCE_VERIFIED"),
  ).toBe(true);
});
it("keeps staff acceptance separate from applicant receipt status", async () => {
  await transaction((db) => {
    db.formSubmissions.push({
      id: "sub-staff",
      form_id: db.customForms[0].id,
      reference_no: "REG-STAFF",
      data: {},
      email_sent: false,
      synced_to_sheet: false,
      created_at: new Date().toISOString(),
    });
    enqueue(db, "email", "submission:sub-staff:admin:staff@example.com", {
      to: "staff@example.com",
      subject: "Staff",
      html: "Saved",
      sourceId: "sub-staff",
      notificationEvent: "staff_alert",
    });
  });
  await processOutbox();
  expect((await readDatabase()).formSubmissions[0].email_sent).toBe(false);
});
it("requires a session and refuses an unsafe host before saving any account", async () => {
  expect(
    (
      await GET(
        new NextRequest("http://localhost/api/admin/email/accounts"),
        {},
      )
    ).status,
  ).toBe(401);
  const { ProviderError } = await import("../../src/lib/errors/provider-error");
  mocks.resolve.mockRejectedValue(
    new ProviderError(
      "SMTP_HOST_BLOCKED",
      "Only public mail servers are allowed.",
      "blocked",
    ),
  );
  expect(
    (
      await POST(
        req("/api/admin/email/accounts", {
          action: "save",
          account: accountInput({ host: "metadata.example.com" }),
        }),
        {},
      )
    ).status,
  ).toBe(503);
  expect((await readDatabase()).emailAccounts).toHaveLength(1);
});

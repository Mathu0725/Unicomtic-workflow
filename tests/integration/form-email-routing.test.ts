import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
import { transaction, readDatabase } from "../../src/lib/data/repository";
import {
  GET as publicForm,
  POST as submit,
} from "../../src/app/api/forms/[slug]/route";
import {
  GET as routing,
  POST as saveRouting,
} from "../../src/app/api/admin/email/routing/route";
import { POST as requestAccess } from "../../src/app/api/candidate-access/request/route";
import { PATCH as updateForm } from "../../src/app/api/admin/forms/[id]/route";
import {
  canonicalStudent,
  registrationFor,
  submitCustomForm,
} from "../../src/lib/admissions/service";
import {
  candidateSession,
  secureCandidateEmail,
} from "../../src/lib/security/candidate-access";
import { SESSION_COOKIE, signSession } from "../../src/lib/security/session";

let directory: string, staff: string;
const person = (n = 1) => ({
  fullName: `Direct Applicant ${n}`,
  email: `direct${n}@example.com`,
  nic: `2000123456${String(n).padStart(2, "0")}`,
  phone: `07712345${String(n).padStart(2, "0")}`,
  district: "Jaffna",
  terms: true,
});
const req = (
  url: string,
  body?: unknown,
  cookie = "",
  extra: Record<string, string> = {},
) =>
  new NextRequest("http://localhost:3000" + url, {
    method: body ? "POST" : "GET",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...extra,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const current = async () => (await readDatabase()).customForms[1];
async function application(n = 1, key?: string) {
  const form = await current();
  return submit(
    req(
      `/api/forms/${form.slug}`,
      { data: person(n), expectedFormVersion: form.updated_at },
      "",
      key ? { "idempotency-key": key } : {},
    ),
    { params: { slug: form.slug } },
  );
}
async function save(id: string, patch: object = {}) {
  const form = (await readDatabase()).customForms.find(
    (form) => form.id === id,
  )!;
  return saveRouting(
    req(
      "/api/admin/email/routing",
      {
        formId: id,
        expectedUpdatedAt: form.updated_at,
        applicant: "application_confirmation",
        staff: "admin_submission",
        staffEmails: ["staff@example.com"],
        invitationFormId: "",
        ...patch,
      },
      staff,
    ),
    undefined,
  );
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-routing-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv("APP_SECRET", "routing-test-secret-at-least-32-characters");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  staff = `${SESSION_COOKIE}=${signSession({ email: "admin@example.com", name: "Admin", role: "super_admin" })}`;
  await transaction((db) => {
    for (const form of db.customForms)
      form.fields = [
        { id: "fullName", type: "text", label: "Name", required: true },
        { id: "email", type: "email", label: "Email", required: true },
        { id: "nic", type: "nic", label: "NIC", required: true },
        { id: "phone", type: "phone", label: "Phone", required: true },
        { id: "district", type: "district", label: "District", required: true },
        { id: "terms", type: "terms", label: "Consent", required: true },
      ];
    db.customForms[1].application_mode = "open";
    db.customForms[1].email_automation.applicant_template =
      "application_confirmation";
    db.customForms[1].email_automation.admin_template = "admin_submission";
    db.customForms[1].email_automation.admin_emails = ["staff@example.com"];
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it("accepts an open application without registration or email verification and sends only its application receipt", async () => {
  const form = await current();
  const response = await publicForm(req(`/api/forms/${form.slug}`), {
    params: { slug: form.slug },
  });
  expect((await response.json()).form.application_mode).toBe("open");
  expect((await application()).status).toBe(200);
  const db = await readDatabase();
  expect(db.applications).toHaveLength(1);
  expect(db.registrations).toHaveLength(1);
  expect(db.registrations[0].source).toBe("direct_application");
  expect(db.formSubmissions).toHaveLength(1);
  const emails = db.outbox.filter((job) => job.type === "email");
  expect(emails).toHaveLength(2);
  expect(
    emails.filter(
      (job) => job.payload.notificationEvent === "submission_confirmation",
    ),
  ).toHaveLength(1);
  expect(
    emails.find((job) => job.payload.to === person().email)!.payload.templateId,
  ).toBe("application_confirmation");
  expect(
    emails.some(
      (job) =>
        job.payload.templateId === "registration_confirmation" ||
        job.payload.candidateAccess,
    ),
  ).toBe(false);
});
it("keeps invitation forms private and rolls back rejected submissions", async () => {
  await transaction((db) => {
    db.customForms[1].application_mode = "invitation";
  });
  expect((await application()).status).toBe(401);
  const db = await readDatabase();
  expect(db.students).toHaveLength(0);
  expect(db.applications).toHaveLength(0);
  expect(db.outbox).toHaveLength(0);
});
it("switches secure-link access off and on without changing the public form link", async () => {
  const original = await current();
  const change = (mode: "open" | "invitation", version: string) =>
    updateForm(new NextRequest(`http://localhost:3000/api/admin/forms/${original.id}`, {
      method: "PATCH",
      headers: { Cookie: staff, "Content-Type": "application/json" },
      body: JSON.stringify({ application_mode: mode, expectedUpdatedAt: version }),
    }), { params: { id: original.id } });
  const opened = await change("open", original.updated_at);
  expect(opened.status).toBe(200);
  const openForm = (await opened.json()).form;
  expect(openForm.slug).toBe(original.slug);
  expect((await publicForm(req(`/api/forms/${original.slug}`), { params: { slug: original.slug } }).then(response => response.json())).form.application_mode).toBe("open");
  const protectedForm = await change("invitation", openForm.updated_at);
  expect(protectedForm.status).toBe(200);
  expect((await publicForm(req(`/api/forms/${original.slug}`), { params: { slug: original.slug } }).then(response => response.json())).form.application_mode).toBe("invitation");
  expect((await application()).status).toBe(401);
});
it("lets a previously registered candidate submit an open application without an invitation", async () => {
  await transaction((db) => {
    const reg = registrationFor(canonicalStudent(person()));
    reg.status = "registered";
  });
  expect((await application()).status).toBe(200);
  expect((await readDatabase()).registrations).toHaveLength(1);
});
it("books a workshop RSVP without requiring the optional email link", async () => {
  await transaction((db) => {
    const form = db.customForms[1];
    form.type = "workshop_rsvp";
    form.workshop_config = { enabled: true, required: true, workshop_ids: ["ws-1"], selection_mode: "explicit" };
    db.workshops.push({
      id: "ws-1", campaign_id: form.campaign_id!, title: "Test workshop", description: "",
      venue: "Main campus", address: "", google_maps_url: "",
      start_time: new Date(Date.now() + 7 * 86400000).toISOString(),
      end_time: new Date(Date.now() + 7 * 86400000 + 3600000).toISOString(),
      reminder_schedule: { days_before: [] }, is_active: true, created_at: new Date().toISOString(),
    });
  });
  const form = await current();
  const response = await submit(
    req(`/api/forms/${form.slug}`, { data: person(1), workshopId: "ws-1", expectedFormVersion: form.updated_at }),
    { params: { slug: form.slug } },
  );
  expect(response.status).toBe(200);
  const db = await readDatabase();
  expect(db.workshopBookings).toHaveLength(1);
  expect(db.workshopBookings[0].workshop_id).toBe("ws-1");
  expect(db.formSubmissions).toHaveLength(1);
});
it("deduplicates concurrent application retries and queues each recipient once", async () => {
  const responses = await Promise.all(
    Array.from({ length: 12 }, () =>
      application(1, "direct-application-stable-retry-key"),
    ),
  );
  expect(responses.every((response) => response.status === 200)).toBe(true);
  expect(
    new Set(
      await Promise.all(
        responses.map(async (response) => (await response.json()).referenceNo),
      ),
    ).size,
  ).toBe(1);
  expect((await application()).status).toBe(409);
  const db = await readDatabase();
  expect(db.applications).toHaveLength(1);
  expect(db.registrations).toHaveLength(1);
  expect(db.outbox.filter((job) => job.type === "email")).toHaveLength(2);
});
it.each(["closed", "future", "limit"])(
  "enforces %s availability on open applications before writing",
  async (kind) => {
    await transaction((db) => {
      const form = db.customForms[1];
      if (kind === "closed")
        form.closes_at = new Date(Date.now() - 1000).toISOString();
      if (kind === "future")
        form.starts_at = new Date(Date.now() + 60000).toISOString();
      if (kind === "limit") {
        form.submission_limit = 1;
        submitCustomForm(form, person(2));
      }
    });
    expect((await application()).status).toBe(403);
    expect((await readDatabase()).applications).toHaveLength(
      kind === "limit" ? 1 : 0,
    );
  },
);
it("saves central routing without changing template wording and rejects stale or draft-conflicting changes", async () => {
  const form = await current(),
    before = structuredClone(form.email_automation);
  expect(
    (
      await save(form.id, {
        staffEmails: ["STAFF@example.com", "staff@example.com"],
      })
    ).status,
  ).toBe(200);
  const saved = await current();
  expect(saved.email_automation.applicant_subject).toBe(
    before.applicant_subject,
  );
  expect(saved.email_automation.admin_emails).toEqual(["staff@example.com"]);
  expect(
    (await save(form.id, { expectedUpdatedAt: form.updated_at })).status,
  ).toBe(409);
  await transaction((db) => {
    db.customForms[1].editor_draft = {
      version: "draft",
      base_updated_at: saved.updated_at,
      values: {} as any,
    };
  });
  expect((await save(form.id)).status).toBe(409);
});
it("protects central settings and returns no applicant or integration secrets", async () => {
  expect(
    (await routing(req("/api/admin/email/routing"), undefined)).status,
  ).toBe(401);
  const response = await routing(
    req("/api/admin/email/routing", undefined, staff),
    undefined,
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain("refresh_token");
  expect(text).not.toContain("applicant_body_html");
  expect(
    (await save((await current()).id, { applicant: "candidate_access" }))
      .status,
  ).toBe(400);
});
it("can turn confirmations and staff alerts off without losing their templates", async () => {
  const form = await current();
  expect((await save(form.id, { applicant: "off", staff: "off" })).status).toBe(
    200,
  );
  expect((await application()).status).toBe(200);
  expect(
    (await readDatabase()).outbox.filter((job) => job.type === "email"),
  ).toHaveLength(0);
  expect((await current()).email_automation.applicant_subject).toBe(
    form.email_automation.applicant_subject,
  );
});
it("keeps registration receipts free of implicit application invitations and supports an explicitly selected target", async () => {
  await transaction((db) => {
    const regForm = db.customForms[0];
    regForm.email_automation.invitation_form_id = "";
    submitCustomForm(regForm, person());
  });
  let db = await readDatabase();
  let receipt = db.outbox.find((job) => job.payload.to === person().email)!;
  expect(receipt.payload.html).not.toContain("/apply?");
  expect(receipt.payload.html).not.toContain("/form/");
  await transaction((db) => {
    db.customForms[0].email_automation.invitation_form_id =
      db.customForms[1].id;
    submitCustomForm(db.customForms[0], person(2));
  });
  db = await readDatabase();
  receipt = db.outbox.find((job) => job.payload.to === person(2).email)!;
  expect(receipt.payload.html).toContain(`/form/${db.customForms[1].slug}`);
  expect(secureCandidateEmail(db, receipt.payload).html).toContain(
    `/form/${db.customForms[1].slug}`,
  );
  db.customForms[1].application_mode = "invitation";
  const rendered = secureCandidateEmail(db, receipt.payload);
  const match = [...rendered.html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1])
    .find((url) => {
      try {
        return candidateSession(
          db,
          new URLSearchParams(new URL(url).hash.slice(1)).get("token")!,
        ).claims.destination;
      } catch {
        return false;
      }
    })!;
  expect(
    candidateSession(
      db,
      new URLSearchParams(new URL(match).hash.slice(1)).get("token")!,
    ).claims.destination,
  ).toBe(`/form/${db.customForms[1].slug}`);
});
it("deduplicates secure-link requests across renamed URLs during the resend cooldown", async () => {
  let reference = "";
  await transaction((db) => {
    reference = registrationFor(canonicalStudent(person())).reference_no;
    db.customForms[1].application_mode = "invitation";
    db.customForms[1].previous_slugs = ["old-application"];
  });
  const input = {
    reference,
    email: person().email,
    purpose: "apply",
    formSlug: "old-application",
  };
  expect(
    (
      await requestAccess(
        req("/api/candidate-access/request", input),
        undefined,
      )
    ).status,
  ).toBe(200);
  await transaction((db) => {
    db.outbox[0].status = "sent";
    db.outbox[0].completed_at = new Date().toISOString();
  });
  const base = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(base + 2 * 60000);
  await requestAccess(
    req("/api/candidate-access/request", {
      ...input,
      formSlug: (await current()).slug,
    }),
    undefined,
  );
  expect((await readDatabase()).outbox).toHaveLength(1);
  vi.spyOn(Date, "now").mockReturnValue(base + 6 * 60000);
  await requestAccess(req("/api/candidate-access/request", input), undefined);
  expect((await readDatabase()).outbox).toHaveLength(2);
});

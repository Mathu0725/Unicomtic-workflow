import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { PATCH, GET } from "../../src/app/api/admin/forms/[id]/route";
import { POST as createForm } from "../../src/app/api/admin/forms/route";
import {
  GET as publicForm,
  POST as submitForm,
} from "../../src/app/api/forms/[slug]/route";
import { GET as responses } from "../../src/app/api/admin/forms/[id]/responses/route";
import { transaction, readDatabase } from "../../src/lib/data/repository";
import { submitCustomForm } from "../../src/lib/admissions/service";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import { editorValues } from "../../src/lib/forms/editor";
import type { CustomForm } from "../../src/lib/data/store";

let directory: string;
const id = "form-reg-2025",
  context = { params: { id } };
const current = async () =>
  (await readDatabase()).customForms.find((form) => form.id === id)!;
const person = (n = 1) => ({
  fullName: `Editor Applicant ${n}`,
  nic: `2000123456${String(n).padStart(2, "0")}`,
  phone: `07712345${String(n).padStart(2, "0")}`,
  email: `editor${n}@example.com`,
  terms: true,
});
function request(
  body?: unknown,
  url = `/api/admin/forms/${id}`,
  role = "super_admin",
) {
  return new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "PATCH",
    headers: {
      ...(role
        ? {
            Cookie: `${SESSION_COOKIE}=${signSession({ email: "editor@example.com", name: "Editor", role })}`,
          }
        : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function draft(
  patch: object,
  expected?: { updated: string; draft: string | null },
) {
  const form = await current();
  return PATCH(
    request({
      action: "save_draft",
      expectedUpdatedAt: expected?.updated || form.updated_at,
      expectedDraftVersion: expected
        ? expected.draft
        : form.editor_draft?.version || null,
      draft: { ...editorValues(form), ...patch },
    }),
    context,
  );
}
async function publish(values?: object) {
  const form = await current();
  return PATCH(
    request({
      ...(form.editor_draft?.values || editorValues(form)),
      ...values,
      action: "publish",
      expectedUpdatedAt: form.updated_at,
      expectedDraftVersion: form.editor_draft?.version || null,
    }),
    context,
  );
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-editor-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv("APP_SECRET", "editor-test-secret-at-least-32-characters");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await transaction((db) => {
    db.customForms[0].fields = [
      { id: "fullName", type: "text", label: "Full name", required: true },
      { id: "email", type: "email", label: "Email", required: true },
      { id: "nic", type: "nic", label: "NIC", required: true },
      { id: "phone", type: "phone", label: "Phone", required: true },
      { id: "terms", type: "terms", label: "Consent", required: true },
    ];
  });
});
it("publishes a repaired legacy registration and maps phone, WhatsApp and district answers correctly", async () => {
  const fields = [
    {
      id: "fullName",
      systemKey: "fullName",
      type: "text",
      label: "Full name",
      required: true,
    },
    { id: "nic", systemKey: "nic", type: "nic", label: "NIC", required: true },
    {
      id: "phone",
      systemKey: "whatsapp",
      type: "phone",
      label: "Phone / WhatsApp",
      required: true,
    },
    { id: "email", type: "email", label: "Email", required: true },
    {
      id: "custom_district",
      systemKey: "district",
      type: "district",
      label: "District",
      required: true,
    },
  ];
  const published = await publish({ fields });
  expect(published.status).toBe(200);
  const submission = await transaction((db) =>
    submitCustomForm(
      db.customForms.find((form) => form.id === id)!,
      { ...person(7), custom_district: "Jaffna" },
    ),
  );
  expect(submission).toBeDefined();
  const db = await readDatabase();
  const student = db.students.find(
    (record) => record.email === person(7).email,
  )!;
  expect(student.phone).toBeTruthy();
  expect(student.whatsapp).toBe(student.phone);
  expect(student.district).toBe("Jaffna");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it("autosaves an incomplete editor draft without changing live content, versions or submissions", async () => {
  const before = await current(),
    snapshot = await readDatabase();
  expect(
    (
      await draft({
        title: "",
        fields: [
          ...before.fields,
          { id: "new_question", type: "text", label: "", required: false },
        ],
      })
    ).status,
  ).toBe(200);
  const saved = await current();
  expect(saved.title).toBe(before.title);
  expect(saved.updated_at).toBe(before.updated_at);
  expect(saved.editor_draft?.values.title).toBe("");
  const publicResponse = await publicForm(
    request(undefined, `/api/forms/${before.slug}`, ""),
    { params: { slug: before.slug } },
  );
  const body = await publicResponse.json();
  expect(body.form.title).toBe(before.title);
  expect(body.form.fields).toHaveLength(before.fields.length);
  expect(body.form.editor_draft).toBeUndefined();
  const after = await readDatabase();
  expect(after.registrations).toEqual(snapshot.registrations);
  expect(after.outbox).toEqual(snapshot.outbox);
  const read = await GET(request(), context);
  expect((await read.json()).form.editor_draft.values.title).toBe("");
});

it("publishes a valid draft atomically and removes the saved draft", async () => {
  const before = await current();
  await draft({
    title: "New admissions form",
    description_rich: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "தமிழ் instructions",
              marks: [{ type: "bold" }],
            },
          ],
        },
      ],
    },
  });
  expect((await publish()).status).toBe(200);
  const form = await current();
  expect(form.title).toBe("New admissions form");
  expect(form.description).toBe("தமிழ் instructions");
  expect(form.editor_draft).toBeUndefined();
  expect(form.updated_at).not.toBe(before.updated_at);
});

it("keeps a second administrator from overwriting a newer draft", async () => {
  const before = await current(),
    expected = { updated: before.updated_at, draft: null };
  expect((await draft({ title: "First editor" }, expected)).status).toBe(200);
  expect((await draft({ title: "Stale editor" }, expected)).status).toBe(409);
  expect((await current()).editor_draft?.values.title).toBe("First editor");
});

it("rejects publication from an older live form version and retains the draft", async () => {
  await draft({ title: "Saved draft" });
  const before = await current();
  await PATCH(
    request({ description: "Another admin changed live instructions" }),
    context,
  );
  const result = await PATCH(
    request({
      ...before.editor_draft!.values,
      action: "publish",
      expectedUpdatedAt: before.updated_at,
      expectedDraftVersion: before.editor_draft!.version,
    }),
    context,
  );
  expect(result.status).toBe(409);
  expect((await current()).editor_draft?.values.title).toBe("Saved draft");
});

it.each(["", "examiner", "entrance_staff"])(
  "rejects unauthorized editor draft saves (%s)",
  async (role) => {
    const form = await current();
    const result = await PATCH(
      request(
        {
          action: "save_draft",
          expectedUpdatedAt: form.updated_at,
          expectedDraftVersion: null,
          draft: { title: "Forbidden" },
        },
        undefined,
        role,
      ),
      context,
    );
    expect(result.status).toBe(role ? 403 : 401);
    expect((await current()).editor_draft).toBeUndefined();
  },
);

it("discards the draft while keeping the published form and all existing data", async () => {
  const before = await current();
  await draft({ title: "Discard me" });
  const saved = await current();
  expect(
    (
      await PATCH(
        request({
          action: "discard_draft",
          expectedUpdatedAt: saved.updated_at,
          expectedDraftVersion: saved.editor_draft!.version,
        }),
        context,
      )
    ).status,
  ).toBe(200);
  expect(await current()).toEqual(before);
});

it("does not publish missing admissions identity questions or invalid conditions", async () => {
  const form = await current();
  expect(
    (
      await publish({
        fields: form.fields.filter((field) => field.id !== "nic"),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await publish({
        fields: [
          ...form.fields,
          {
            id: "details",
            type: "text",
            label: "Details",
            required: true,
            visibility: {
              field_id: "missing",
              operator: "equals",
              value: "Yes",
            },
          },
        ],
      })
    ).status,
  ).toBe(400);
  expect((await current()).updated_at).toBe(form.updated_at);
});

it("does not change the type of an answered question", async () => {
  await transaction((db) => {
    submitCustomForm(db.customForms[0], person());
  });
  const form = await current();
  expect(
    (
      await publish({
        fields: form.fields.map((field) =>
          field.id === "fullName" ? { ...field, type: "textarea" } : field,
        ),
      })
    ).status,
  ).toBe(400);
  expect((await current()).fields[0].type).toBe("text");
});

it("validates visible conditional questions and excludes hidden and stale answers", async () => {
  await transaction((db) => {
    db.customForms[0].fields.push(
      {
        id: "experience",
        type: "radio",
        label: "Experience?",
        required: true,
        options: ["Yes", "No"],
      },
      {
        id: "work_details",
        type: "textarea",
        label: "Work details",
        required: true,
        minLength: 5,
        visibility: {
          field_id: "experience",
          operator: "equals",
          value: "Yes",
        },
      },
    );
  });
  await expect(
    transaction((db) =>
      submitCustomForm(db.customForms[0], {
        ...person(),
        experience: "Yes",
        work_details: "abc",
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
  const saved = await transaction((db) =>
    submitCustomForm(db.customForms[0], {
      ...person(),
      experience: "No",
      work_details: "Old hidden answer",
    }),
  );
  expect(saved.submission.data.work_details).toBeUndefined();
  expect(saved.submission.field_labels?.work_details).toBeUndefined();
});

it("enforces checkbox choices and limits on the server", async () => {
  await transaction((db) => {
    db.customForms[0].fields.push({
      id: "topics",
      type: "checkbox",
      label: "Topics",
      required: true,
      options: ["Web", "Data", "Cloud"],
      minSelections: 1,
      maxSelections: 2,
    });
  });
  for (const topics of [
    [],
    ["Other"],
    ["Web", "Web"],
    ["Web", "Data", "Cloud"],
    "Web",
  ])
    await expect(
      transaction((db) =>
        submitCustomForm(db.customForms[0], { ...person(), topics }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  const accepted = await transaction((db) =>
    submitCustomForm(db.customForms[0], {
      ...person(),
      topics: ["Web", "Data"],
    }),
  );
  expect(accepted.submission.data.topics).toEqual(["Web", "Data"]);
});

it("blocks concurrent duplicates of an additional unique answer without leaking an earlier response", async () => {
  await transaction((db) => {
    db.customForms[0].fields.push({
      id: "school_index",
      type: "text",
      label: "School index",
      required: true,
      unique: true,
    });
  });
  const results = await Promise.allSettled(
    [1, 2].map((n) =>
      transaction((db) =>
        submitCustomForm(db.customForms[0], {
          ...person(n),
          school_index: n === 1 ? "  SCH-123 " : "sch-123",
        }),
      ),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect((await readDatabase()).formSubmissions).toHaveLength(1);
  const rejected = results.find(
    (result) => result.status === "rejected",
  ) as PromiseRejectedResult;
  expect(rejected.reason.details).not.toHaveProperty("referenceNo");
});

it("enforces the response limit across simultaneous submissions", async () => {
  await transaction((db) => {
    db.customForms[0].submission_limit = 1;
  });
  const results = await Promise.allSettled(
    [1, 2, 3].map((n) =>
      transaction((db) => submitCustomForm(db.customForms[0], person(n))),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect((await readDatabase()).registrations).toHaveLength(1);
});

it("returns configured success text and a committed reference even when Sheets has no connection", async () => {
  await transaction((db) => {
    db.customForms[0].confirmation_message =
      "நன்றி! Your application is saved.";
    db.integrations.registration_sheet_id = "unavailable-sheet";
  });
  const form = await current();
  const response = await submitForm(
    new NextRequest(`http://localhost/api/forms/${form.slug}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key":
          "editor-success-123456789012345678901234567890123456",
      },
      body: JSON.stringify({
        data: person(),
        expectedFormVersion: form.updated_at,
      }),
    }),
    { params: { slug: form.slug } },
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.confirmationMessage).toBe("நன்றி! Your application is saved.");
  expect(body.referenceNo).toBe(
    (await readDatabase()).formSubmissions[0].reference_no,
  );
  expect(
    (await readDatabase()).outbox.some(
      (job) => job.type === "sheet" && job.status === "queued",
    ),
  ).toBe(true);
});

it("turns off inherited spreadsheet and staff email dispatch when explicitly disabled", async () => {
  await transaction((db) => {
    const form = db.customForms[0];
    db.integrations.registration_sheet_id = "global-sheet";
    db.integrations.admin_notification_email = "staff@example.com";
    form.google_sheets_config.disabled = true;
    form.email_automation.send_admin_notification = false;
    submitCustomForm(form, person());
  });
  const state = await readDatabase();
  expect(state.formSubmissions).toHaveLength(1);
  expect(state.outbox.filter((job) => job.type === "sheet")).toHaveLength(0);
  expect(
    state.outbox.some((job) => job.payload.to === "staff@example.com"),
  ).toBe(false);
});

it("creates new forms as drafts and duplicates with destinations off and no response history", async () => {
  const response = await createForm(
    new NextRequest("http://localhost/api/admin/forms", {
      method: "POST",
      headers: {
        Cookie: request().headers.get("cookie")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "New admissions form" }),
    }),
    undefined,
  );
  expect(response.status).toBe(200);
  const created: CustomForm = (await response.json()).form;
  expect(created.is_active).toBe(false);
  expect(created.status).toBe("draft");
  const duplicate = await createForm(
    new NextRequest("http://localhost/api/admin/forms", {
      method: "POST",
      headers: {
        Cookie: request().headers.get("cookie")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "duplicate", formId: id }),
    }),
    undefined,
  );
  const copied = (await duplicate.json()).form;
  expect(copied.is_active).toBe(false);
  expect(copied.google_sheets_config).toMatchObject({
    disabled: true,
    sheet_id: "",
  });
  expect(copied.email_automation.enabled).toBe(false);
  expect(copied.submissions_count).toBe(0);
});

it("paginates, filters and exports responses while preserving removed question answers", async () => {
  await transaction((db) => {
    for (let n = 1; n <= 31; n++)
      db.formSubmissions.push({
        id: `answer-${n}`,
        form_id: id,
        reference_no: `REF-${n}`,
        data: {
          fullName:
            n === 31 ? '=HYPERLINK("https://bad.example")' : `Student ${n}`,
          removed_question: "Historical answer",
        },
        field_labels: { removed_question: "Old question" },
        synced_to_sheet: false,
        email_sent: false,
        created_at: new Date(Date.UTC(2026, 1, n)).toISOString(),
      });
  });
  const page = await responses(
    request(undefined, `/api/admin/forms/${id}/responses?page=2&pageSize=10`),
    context,
  );
  const body = await page.json();
  expect(body.submissions).toHaveLength(10);
  expect(body.total).toBe(31);
  expect(body.stats.total).toBe(31);
  const search = await responses(
    request(undefined, `/api/admin/forms/${id}/responses?search=REF-31`),
    context,
  );
  expect((await search.json()).submissions).toHaveLength(1);
  const csv = await responses(
    request(
      undefined,
      `/api/admin/forms/${id}/responses?export=csv&search=REF-31`,
    ),
    context,
  );
  const text = await csv.text();
  expect(csv.headers.get("content-type")).toContain("text/csv");
  expect(text).toContain("Old question");
  expect(text).toContain("Historical answer");
  expect(text).toContain("'=HYPERLINK");
  expect(
    (
      await responses(
        request(undefined, `/api/admin/forms/${id}/responses?pageSize=1000`),
        context,
      )
    ).status,
  ).toBe(400);
});

it("filters response dates using the admissions time zone", async () => {
  await transaction((db) => {
    db.formSubmissions.push({
      id: "early-morning",
      form_id: id,
      reference_no: "TZ-REF",
      data: {},
      synced_to_sheet: false,
      email_sent: false,
      created_at: "2026-01-01T20:00:00.000Z",
    });
  });
  const included = await responses(
    request(
      undefined,
      `/api/admin/forms/${id}/responses?from=2026-01-02&to=2026-01-02`,
    ),
    context,
  );
  expect((await included.json()).total).toBe(1);
  const excluded = await responses(
    request(
      undefined,
      `/api/admin/forms/${id}/responses?from=2026-01-01&to=2026-01-01`,
    ),
    context,
  );
  expect((await excluded.json()).total).toBe(0);
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { SESSION_COOKIE, signSession } from "../../src/lib/security/session";
import { GET as details } from "../../src/app/api/admin/applications/[id]/route";
import {
  GET as list,
  PATCH as update,
} from "../../src/app/api/admin/applications/route";

let dir: string;
const appId = "application-review-main";
function request(method = "GET", body?: unknown, role = "admin") {
  return new NextRequest(
    `http://localhost/api/admin/applications${method === "GET" ? `/${appId}` : ""}`,
    {
      method,
      headers: {
        ...(role
          ? {
              cookie: `${SESSION_COOKIE}=${signSession({ name: "Test reviewer", email: "reviewer@example.com", role })}`,
            }
          : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
const context = { params: { id: appId } };
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tic-application-review-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "true");
  vi.stubEnv("APP_SECRET", "test-application-review-secret-32-or-more");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await transaction((db) => {
    const app = {
      ...db.applications[0],
      id: appId,
      status: "approved" as const,
      review_notes: "Keep reviewer notes",
    };
    db.applications = [app, { ...app, id: "another-application" }];
    const form = db.customForms.find((item) => item.type === "application")!;
    form.fields = [
      {
        id: "olIct",
        type: "radio",
        label: "Renamed O/L question",
        required: false,
      },
      { id: "alIct", type: "radio", label: "A/L ICT", required: false },
    ];
    db.formSubmissions = [
      {
        id: "linked-response",
        form_id: form.id,
        reference_no: app.application_no,
        student_id: app.student_id,
        application_id: appId,
        created_at: "2026-10-28T03:00:00.000Z",
        synced_to_sheet: false,
        email_sent: false,
        field_labels: {
          olIct: "Original O/L ICT question",
          deletedQuestion: "Original removed question",
          currentStatus: "Current status",
          greatestAccomplishment: "Greatest accomplishment",
        },
        data: {
          olIct: "A",
          alIct: "B",
          currentStatus: "Student",
          greatestAccomplishment: "Built a study group",
          deletedQuestion: "Retain this answer",
          confirmed: false,
          score: 0,
          interests: ["Web", "Mobile"],
          document: "https://drive.google.com/file/d/private-file/view",
          extraQuestion: "Extra answer",
        },
      },
      {
        id: "other-response",
        form_id: form.id,
        reference_no: "OTHER",
        student_id: app.student_id,
        application_id: "another-application",
        created_at: "2026-10-28T04:00:00.000Z",
        synced_to_sheet: false,
        email_sent: false,
        data: { unrelated: "Do not include" },
      },
      {
        id: "registration-response",
        form_id: db.customForms[0].id,
        reference_no: "REG-TEST",
        student_id: app.student_id,
        created_at: "2026-10-28T02:00:00.000Z",
        synced_to_sheet: false,
        email_sent: false,
        data: { unrelated: "Registration only" },
      },
    ];
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

it("loads every answer for this exact application with historical labels and no list payload expansion", async () => {
  const response = await details(request(), {
    params: Promise.resolve(context.params),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const data = await response.json();
  expect(data.application).toMatchObject({
    id: appId,
    status: "approved",
    review_notes: "Keep reviewer notes",
  });
  expect(data.submissions).toHaveLength(1);
  expect(data.submissions[0].answers).toEqual(
    expect.arrayContaining([
      { id: "olIct", label: "Original O/L ICT question", value: "A" },
      { id: "alIct", label: "A/L ICT", value: "B" },
      {
        id: "deletedQuestion",
        label: "Original removed question",
        value: "Retain this answer",
      },
      { id: "score", label: "score", value: 0 },
      { id: "confirmed", label: "confirmed", value: false },
      {
        id: "document",
        label: "document",
        value: "https://drive.google.com/file/d/private-file/view",
      },
    ]),
  );
  expect(data.submissions[0].answers).toHaveLength(10);
  expect(data.submissions[0]).not.toHaveProperty("ip_address");
  const listing = await (await list(request(), undefined)).json();
  expect(listing.applications).toHaveLength(2);
  expect(listing.applications[0]).not.toHaveProperty("submissions");
});

it("retains submitted answers if the original form was deleted", async () => {
  await transaction((db) => {
    db.customForms = [];
  });
  const data = await (await details(request(), context)).json();
  expect(data.submissions[0].formTitle).toBe("Submitted application form");
  expect(data.submissions[0].answers).toContainEqual({
    id: "deletedQuestion",
    label: "Original removed question",
    value: "Retain this answer",
  });
});

it("supports legacy applications without a custom-form submission", async () => {
  await transaction((db) => {
    db.formSubmissions = [];
  });
  const data = await (await details(request(), context)).json();
  expect(data.application.id).toBe(appId);
  expect(data.application.ol_results).toBeDefined();
  expect(data.submissions).toEqual([]);
});

it("returns 404 for an unavailable application", async () => {
  expect(
    (await details(request(), { params: { id: "missing-application" } }))
      .status,
  ).toBe(404);
});

it.each(["", "entrance_staff", "examiner"])(
  "protects private answers against the %s role",
  async (role) => {
    const response = await details(request("GET", undefined, role), context);
    expect(response.status).toBe(role ? 403 : 401);
    expect(await response.text()).not.toContain("Built a study group");
  },
);

it.each([
  ["submitted", "under_review", 200],
  ["submitted", "approved", 200],
  ["submitted", "rejected", 200],
  ["under_review", "approved", 200],
  ["under_review", "rejected", 200],
  ["approved", "under_review", 200],
  ["approved", "rejected", 409],
  ["rejected", "under_review", 200],
  ["rejected", "approved", 409],
  ["withdrawn", "under_review", 200],
  ["invited", "approved", 409],
  ["started", "under_review", 409],
] as const)(
  "enforces %s → %s on the server",
  async (from, to, expectedStatus) => {
    await transaction((db) => {
      db.applications[0].status = from;
    });
    const before = await readDatabase();
    const response = await update(
      request("PATCH", { id: appId, status: to, expectedStatus: from }),
      undefined,
    );
    expect(response.status).toBe(expectedStatus);
    const after = await readDatabase();
    expect(after.applications[0].status).toBe(
      expectedStatus === 200 ? to : from,
    );
    expect(after.applications[0].review_notes).toBe("Keep reviewer notes");
    expect(after.outbox).toEqual(before.outbox);
  },
);

it("prevents two reviewers from overwriting each other's decisions", async () => {
  await transaction((db) => {
    db.applications[0].status = "submitted";
  });
  const before = await readDatabase();
  const results = await Promise.all(
    ["under_review", "approved"].map((status) =>
      update(
        request("PATCH", {
          id: appId,
          status,
          expectedStatus: "submitted",
        }),
        undefined,
      ),
    ),
  );
  expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
  const after = await readDatabase();
  expect(after.auditLogs.length - before.auditLogs.length).toBe(1);
  expect(after.applications[0].review_notes).toBe("Keep reviewer notes");
});

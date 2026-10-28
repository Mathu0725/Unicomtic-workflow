// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useFormEditor } from "../../src/lib/client/use-form-editor";
import { ApiError } from "../../src/lib/client/api";
import type { CustomForm } from "../../src/lib/data/store";
import { formDraftSchema } from "../../src/lib/validations/forms";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../src/lib/client/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/client/api")>()),
  api: mocks.api,
}));
let backend: CustomForm;
const fixture = (): CustomForm => ({
  id: "form-test",
  title: "Admission form",
  description: "Instructions",
  slug: "admission",
  is_active: true,
  status: "published",
  type: "registration",
  fields: [
    { id: "fullName", type: "text", label: "Full name", required: true },
  ],
  google_sheets_config: {
    enabled: false,
    sheet_id: "",
    sheet_name: "Registrations",
    auto_sync: true,
  },
  email_automation: {
    enabled: true,
    send_applicant_email: true,
    applicant_subject: "Saved",
    applicant_body_html: "<p>Saved</p>",
    send_admin_notification: true,
    admin_emails: [],
    admin_subject: "Submission",
  },
  confirmation_message: "Thank you",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  submissions_count: 0,
});
beforeEach(() => {
  vi.useFakeTimers();
  backend = fixture();
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (_url, body) => {
    if (body?.action === "save_draft")
      backend.editor_draft = {
        base_updated_at: backend.updated_at,
        version: new Date(Date.now()).toISOString(),
        values: structuredClone(body.draft),
      };
    return { success: true, form: structuredClone(backend) };
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function open() {
  const hook = renderHook(() => useFormEditor("form-test"));
  await act(async () => {});
  expect(hook.result.current.loading).toBe(false);
  return hook;
}
const patches = () =>
  mocks.api.mock.calls.filter(([, body]) => body?.action === "save_draft");

it("debounces draft changes and reports saved only after the server confirms", async () => {
  const { result } = await open();
  act(() => result.current.change({ title: "New title" }, "title"));
  expect(result.current.dirty).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(patches()).toHaveLength(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(patches()).toHaveLength(1);
  expect(patches()[0][1]).toMatchObject({
    action: "save_draft",
    expectedUpdatedAt: fixture().updated_at,
    expectedDraftVersion: null,
    draft: { title: "New title" },
  });
  expect(result.current.dirty).toBe(false);
  expect(result.current.savedAt).toBeTruthy();
  expect(backend.title).toBe("Admission form");
});

it("retains newer edits made while an earlier draft save is in flight", async () => {
  const { result } = await open();
  let release!: (value: unknown) => void, first!: Promise<boolean>;
  mocks.api.mockImplementationOnce(
    (_url, body) =>
      new Promise((resolve) => {
        release = resolve;
        backend.editor_draft = {
          base_updated_at: backend.updated_at,
          version: "2026-01-02T00:00:00.000Z",
          values: structuredClone(body.draft),
        };
      }),
  );
  act(() => result.current.change({ title: "First edit" }));
  act(() => {
    first = result.current.saveDraft();
  });
  act(() => result.current.change({ title: "Newer edit" }));
  await act(async () => {
    release({ form: structuredClone(backend) });
    await first;
  });
  expect(result.current.values?.title).toBe("Newer edit");
  expect(result.current.dirty).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1700);
  });
  expect(patches().at(-1)?.[1]).toMatchObject({
    expectedDraftVersion: "2026-01-02T00:00:00.000Z",
    draft: { title: "Newer edit" },
  });
  expect(result.current.dirty).toBe(false);
});

it("confirms a timed-out committed save by reading it instead of writing a second draft", async () => {
  const { result } = await open();
  mocks.api.mockImplementationOnce(async (_url, body) => {
    backend.editor_draft = {
      base_updated_at: backend.updated_at,
      version: "2026-01-02T00:00:00.000Z",
      values: structuredClone(body.draft),
    };
    throw new ApiError("Timeout", 0, "REQUEST_TIMEOUT");
  });
  act(() => result.current.change({ title: "Committed before timeout" }));
  await act(async () => {
    await result.current.saveDraft();
  });
  expect(patches()).toHaveLength(1);
  expect(result.current.dirty).toBe(false);
  expect(result.current.error).toBe("");
  expect(result.current.savedAt).toBe("2026-01-02T00:00:00.000Z");
});

it("stops autosave on a version conflict and retains the administrator's local edit", async () => {
  const { result } = await open();
  backend.updated_at = "2026-01-03T00:00:00.000Z";
  mocks.api.mockImplementationOnce(async () => {
    throw new ApiError("Conflict", 409, "VERSION_CONFLICT");
  });
  act(() => result.current.change({ title: "My local edit" }));
  await act(async () => {
    await result.current.saveDraft();
  });
  expect(result.current.conflict).toBe(true);
  expect(result.current.values?.title).toBe("My local edit");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(patches()).toHaveLength(1);
});

it("supports undo and redo without losing question IDs or configuration", async () => {
  const { result } = await open();
  const original = result.current.values!;
  act(() =>
    result.current.change((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          id: "extra",
          type: "checkbox",
          label: "Topics",
          required: true,
          options: ["Web", "Data"],
        },
      ],
    })),
  );
  act(() => result.current.undo());
  expect(result.current.values).toEqual(original);
  act(() => result.current.redo());
  expect(result.current.values?.fields[1]).toMatchObject({
    id: "extra",
    type: "checkbox",
    options: ["Web", "Data"],
  });
});

it("requires explicit publication and uses the current draft version", async () => {
  const { result } = await open();
  act(() => result.current.change({ title: "Publish this" }));
  await act(async () => {
    await result.current.saveDraft();
  });
  expect(
    mocks.api.mock.calls.some(([, body]) => body?.action === "publish"),
  ).toBe(false);
  mocks.api.mockImplementationOnce(async (_url, body) => ({
    form: {
      ...backend,
      ...body,
      editor_draft: undefined,
      updated_at: "2026-01-04T00:00:00.000Z",
    },
  }));
  await act(async () => {
    await result.current.publish();
  });
  const request = mocks.api.mock.calls.find(
    ([, body]) => body?.action === "publish",
  )?.[1];
  expect(request.expectedDraftVersion).toBeTruthy();
  expect(request.title).toBe("Publish this");
  expect(result.current.dirty).toBe(false);
});

it("recognizes a committed draft after server normalization and property reordering", async () => {
  const { result } = await open();
  act(() =>
    result.current.change({
      messages: { submitEnglish: "  Saved instructions  " },
    }),
  );
  mocks.api.mockImplementationOnce(async (_url, body) => {
    const normalized = formDraftSchema.parse(body.draft);
    backend.editor_draft = {
      base_updated_at: backend.updated_at,
      version: "2026-01-02T00:00:00.000Z",
      values: Object.fromEntries(
        Object.entries(normalized).reverse(),
      ) as NonNullable<CustomForm["editor_draft"]>["values"],
    };
    throw new ApiError("Timeout", 0, "REQUEST_TIMEOUT");
  });
  await act(async () => {
    await result.current.saveDraft();
  });
  expect(patches()).toHaveLength(1);
  expect(result.current.conflict).toBe(false);
  expect(result.current.dirty).toBe(false);
  expect(result.current.error).toBe("");
});

it("does not discard another administrator's newer draft by silently upgrading the version", async () => {
  const { result } = await open();
  backend.editor_draft = {
    version: "2026-01-05T00:00:00.000Z",
    base_updated_at: backend.updated_at,
    values: {
      ...result.current.values!,
      title: "Another administrator's draft",
    },
  };
  mocks.api.mockImplementationOnce(async (_url, body) => {
    expect(body).toMatchObject({
      action: "discard_draft",
      expectedDraftVersion: null,
    });
    throw new ApiError("A newer draft exists", 409, "VERSION_CONFLICT");
  });
  await act(async () => {
    await result.current.discard();
  });
  expect(backend.editor_draft.values.title).toBe(
    "Another administrator's draft",
  );
  expect(result.current.conflict).toBe(true);
  expect(mocks.api.mock.calls.at(-1)?.[1]?.action).toBe("discard_draft");
});

it("can unpublish an existing live form by explicitly choosing draft status", async () => {
  const { result } = await open();
  act(() => result.current.change({ status: "draft" }));
  mocks.api.mockImplementationOnce(async (_url, body) => ({
    form: {
      ...backend,
      ...body,
      editor_draft: undefined,
      updated_at: "2026-01-04T00:00:00.000Z",
    },
  }));
  await act(async () => {
    await result.current.publish();
  });
  const request = mocks.api.mock.calls.find(
    ([, body]) => body?.action === "publish",
  )?.[1];
  expect(request).toMatchObject({ status: "draft", is_active: false });
});

it("opens a new draft only when Publish form is explicitly selected", async () => {
  backend.status = "draft";
  backend.is_active = false;
  const { result } = await open();
  mocks.api.mockImplementationOnce(async (_url, body) => ({
    form: {
      ...backend,
      ...body,
      editor_draft: undefined,
      updated_at: "2026-01-04T00:00:00.000Z",
    },
  }));
  await act(async () => {
    await result.current.publish();
  });
  const request = mocks.api.mock.calls.find(
    ([, body]) => body?.action === "publish",
  )?.[1];
  expect(request).toMatchObject({ status: "published", is_active: true });
});

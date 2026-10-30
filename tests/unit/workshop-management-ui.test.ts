// @vitest-environment happy-dom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createElement, useState } from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import type { Workshop, CustomForm } from "../../src/lib/data/store";
import type { FormEditorValues } from "../../src/lib/forms/editor";
import type { workshopDetail } from "../../src/lib/workshops/management";
import WorkshopEditor from "../../src/components/workshop-editor";
import WorkshopSelection from "../../src/components/workshop-selection";
import WorkshopSettings from "../../src/components/form-builder/workshop-settings";
import WorkshopParticipants from "../../src/components/workshop-participants";
import WorkshopReminders from "../../src/components/workshop-reminders";
import WorkshopsPage from "../../src/app/admin/workshops/page";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  submit: vi.fn(),
  reload: vi.fn(async () => {}),
  data: null as any,
}));
vi.mock("../../src/components/live-data", async (original) => ({
  ...(await original<any>()),
  api: mocks.api,
  useLiveData: () => ({
    data: mocks.data,
    error: "",
    reload: mocks.reload,
    loading: false,
  }),
}));
vi.mock("../../src/lib/client/submit", () => ({
  submitRequest: mocks.submit,
  pendingPayload: () => undefined,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => createElement("a", props, children),
}));
let w: Workshop;
function details(): ReturnType<typeof workshopDetail> {
  return {
    ...w,
    version: w.created_at,
    campaignTitle: "Intake",
    bookedCount: 1,
    cancelledCount: 0,
    remaining: 49,
    totalAttended: 0,
    attachedForms: [],
    history: [],
    attendanceRecords: [],
    deliveries: [],
    bookings: [
      {
        id: "booking-1",
        workshop_id: w.id,
        student_id: "student",
        registration_id: "reg",
        status: "confirmed",
        created_at: w.created_at,
        version: w.created_at,
        studentName: "First Participant",
        phone: "0770000001",
        email: "first@example.com",
        district: "Jaffna",
        referenceNo: "REG-001",
        applicationNo: "APP-001",
        attendanceStatus: "unmarked",
        utNumber: "",
        attendance: undefined,
        sourceForms: ["Registration form"],
        emailStatus: "queued",
        sheetStatus: "queued",
        history: [],
      },
    ],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  w = {
    id: "workshop-1",
    campaign_id: "intake",
    title: "Workshop 1",
    description: "",
    venue: "Campus",
    address: "Campus Road",
    google_maps_url: "",
    start_time: new Date(Date.now() + 5 * 86400000).toISOString(),
    end_time: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(),
    capacity: 50,
    is_active: true,
    created_at: "2026-10-28T00:00:00.000Z",
    reminder_schedule: { days_before: [3, 1] },
  };
  mocks.api.mockResolvedValue({
    success: true,
    workshop: w,
    campaigns: [{ id: "intake", title: "Intake" }],
  });
  mocks.submit.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          success: true,
          workshop: w,
          message: "Saved for this workshop",
        }),
      ),
  );
  mocks.data = {
    canManage: true,
    workshops: Array.from({ length: 10 }, (_, i) => ({
      ...w,
      id: "workshop-" + (i + 1),
      title: "Workshop " + (i + 1),
      bookedCount: i,
      remaining: 50 - i,
      totalAttended: 0,
      attachedForms: [],
    })),
  };
});
afterEach(() => cleanup());
it("lists ten distinct workshop links and filters by name", async () => {
  render(createElement(WorkshopsPage));
  expect(screen.getAllByRole("link", { name: /Open workshop/ })).toHaveLength(
    10,
  );
  expect(
    screen
      .getAllByRole("link", { name: /Open workshop/ })[1]
      .getAttribute("href"),
  ).toBe("/admin/workshops/workshop-2");
  fireEvent.change(screen.getByLabelText("Find a workshop"), {
    target: { value: "Workshop 10" },
  });
  expect(screen.getAllByRole("link", { name: /Open workshop/ })).toHaveLength(
    1,
  );
  expect(
    screen.getByRole("link", { name: /Open workshop/ }).getAttribute("href"),
  ).toBe("/admin/workshops/workshop-10");
});
it("hides creation controls from entrance staff", () => {
  mocks.data.canManage = false;
  render(createElement(WorkshopsPage));
  expect(screen.queryByRole("button", { name: "Create workshop" })).toBeNull();
});
it("keeps an edit's expected version and original timestamps when a background reload arrives", async () => {
  const saved = vi.fn();
  const view = render(
    createElement(WorkshopEditor, { workshop: w, onSaved: saved }),
  );
  fireEvent.change(screen.getByLabelText("Total seats"), {
    target: { value: "80" },
  });
  view.rerender(
    createElement(WorkshopEditor, {
      workshop: { ...w, updated_at: "new-server-version", capacity: 90 },
      onSaved: saved,
    }),
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Save workshop" }).closest("form")!,
  );
  await waitFor(() =>
    expect(mocks.api).toHaveBeenCalledWith(
      "/api/admin/workshops",
      expect.objectContaining({
        expectedVersion: w.created_at,
        capacity: 80,
        startTime: w.start_time,
        endTime: w.end_time,
      }),
      "PATCH",
    ),
  );
  expect(saved).toHaveBeenCalled();
});
it("retains a stale edit for review after a version conflict", async () => {
  mocks.api.mockRejectedValueOnce(
    new Error("This workshop changed. Reload before saving."),
  );
  render(createElement(WorkshopEditor, { workshop: w, onSaved: vi.fn() }));
  fireEvent.change(screen.getByLabelText("Total seats"), {
    target: { value: "80" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Save workshop" }).closest("form")!,
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "This workshop changed",
  );
  expect((screen.getByLabelText("Total seats") as HTMLInputElement).value).toBe(
    "80",
  );
  expect(
    screen.getByText("This workshop changed. Reload before saving."),
  ).toBeTruthy();
});
it("shows an unavailable previous choice and disables full or closed choices", () => {
  render(
    createElement(WorkshopSelection, {
      config: { enabled: true, required: true },
      workshops: [
        { ...w, remaining: 0, bookable: false, unavailableReason: "Full" },
      ],
      value: "detached",
      onChange: vi.fn(),
    }),
  );
  expect(screen.getByRole("alert").textContent).toMatch(
    /previous workshop choice/,
  );
  expect(
    (screen.getByRole("option", { name: /Workshop 1/ }) as HTMLOptionElement)
      .disabled,
  ).toBe(true);
  expect((screen.getByRole("combobox") as HTMLSelectElement).required).toBe(
    true,
  );
});
it("converts reviewed legacy attachments to explicit selection and preserves hide separately from detach", () => {
  const change = vi.fn(),
    form = {
      id: "form",
      campaign_id: "intake",
      type: "registration",
    } as CustomForm;
  function Harness() {
    const [values, setValues] = useState({
      workshop_config: { enabled: true, required: false, workshop_ids: [] },
    } as unknown as FormEditorValues);
    return createElement(WorkshopSettings, {
      form,
      values,
      workshops: [w, { ...w, id: "workshop-2", title: "Workshop 2" }],
      onChange: (patch) => {
        change(patch);
        setValues((v) => ({ ...v, ...patch }));
      },
    });
  }
  render(createElement(Harness));
  fireEvent.click(screen.getAllByLabelText("Show on this form")[0]);
  expect(change).toHaveBeenLastCalledWith({
    workshop_config: expect.objectContaining({
      selection_mode: "explicit",
      workshop_ids: ["workshop-1", "workshop-2"],
      hidden_ids: ["workshop-1"],
    }),
  });
  const label = screen.getByText("Workshop 2").closest("label")!;
  fireEvent.click(within(label).getByRole("checkbox"));
  expect(change).toHaveBeenLastCalledWith({
    workshop_config: expect.objectContaining({
      workshop_ids: ["workshop-1"],
      hidden_ids: ["workshop-1"],
    }),
  });
});
it("quick open-application preset preserves draft settings and selects no sessions implicitly", () => {
  const change = vi.fn();
  render(
    createElement(WorkshopSettings, {
      form: {
        id: "form",
        campaign_id: "intake",
        type: "application",
      } as CustomForm,
      values: {} as FormEditorValues,
      workshops: [w],
      onChange: change,
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Open application + workshop" }),
  );
  expect(change).toHaveBeenCalledWith({
    application_mode: "open",
    workshop_config: {
      enabled: true,
      required: false,
      selection_mode: "explicit",
      workshop_ids: [],
    },
  });
});
it("searches participant phone numbers and sends the chosen booking's version for cancellation", async () => {
  const d = details();
  render(
    createElement(WorkshopParticipants, {
      workshop: d,
      canManage: true,
      targets: [],
      onChanged: mocks.reload,
    }),
  );
  fireEvent.change(screen.getByLabelText("Search participants"), {
    target: { value: "0770000001" },
  });
  expect(screen.getByText("First Participant")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.change(screen.getByLabelText("Reason (saved in history)"), {
    target: { value: "Participant requested cancellation" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Confirm cancellation" })
      .closest("form")!,
  );
  await waitFor(() =>
    expect(mocks.submit).toHaveBeenCalledWith(
      "/api/admin/workshops/workshop-1/bookings",
      expect.objectContaining({
        bookingId: "booking-1",
        expectedVersion: w.created_at,
        action: "cancel",
        reason: "Participant requested cancellation",
      }),
    ),
  );
});
it("previews only this workshop and sends the selected subset with its signed preview, once on double click", async () => {
  const p = {
    kind: "manual",
    operationId: "test-preview",
    expiresAt: Date.now() + 60000,
    recipients: [
      {
        id: "b1",
        name: "First",
        email: "first@example.com",
        phone: "0770000001",
        subject: "Workshop 1 reminder",
        text: "Come to Campus",
        recent: true,
        token: "token-1",
      },
      {
        id: "b2",
        name: "Second",
        email: "second@example.com",
        phone: "0770000002",
        subject: "Workshop 1 reminder",
        text: "Come to Campus",
        recent: false,
        token: "token-2",
      },
    ],
  };
  mocks.api.mockResolvedValue(p);
  let finish!: (value: Response) => void;
  mocks.submit.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    createElement(WorkshopReminders, {
      workshop: details(),
      onChanged: mocks.reload,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview recipients" }));
  await screen.findByText(/2 of 2 eligible/);
  expect(mocks.api).toHaveBeenCalledWith(
    "/api/admin/workshops/workshop-1/reminders?kind=manual",
    undefined,
    "GET",
  );
  fireEvent.click(screen.getByLabelText(/Second ·/));
  const button = screen.getByRole("button", {
    name: "Send to 1 selected participants",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
  expect(mocks.submit).toHaveBeenCalledWith(
    "/api/admin/workshops/workshop-1/reminders",
    {
      kind: "manual",
      operationId: "test-preview",
      expiresAt: p.expiresAt,
      recipients: [{ id: "b1", token: "token-1" }],
    },
  );
  finish(
    new Response(
      JSON.stringify({ success: true, message: "One reminder queued" }),
    ),
  );
  await screen.findByText("One reminder queued");
});

// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import AdminApplicationsPage from "../../src/app/admin/applications/page";
import { ApiError } from "../../src/lib/client/api";
import type {
  ApplicationDetails,
  ApplicationListItem,
  ApplicationStatus,
} from "../../src/lib/admissions/application-review";

const mocks = vi.hoisted(() => ({ api: vi.fn(), apiResponse: vi.fn() }));
vi.mock("../../src/lib/client/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/client/api")>()),
  ...mocks,
}));
vi.mock("../../src/components/candidate-email-editor", () => ({
  default: () => null,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => createElement("a", props, children),
}));

let app: ApplicationListItem;
let details: ApplicationDetails;
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  app = {
    id: "application-one",
    application_no: "APP-TEST-001",
    registration_id: "registration-one",
    student_id: "student-one",
    campaign_id: "intake",
    status: "submitted",
    studentName: "Example Applicant",
    email: "candidate@example.com",
    phone: "0770000000",
    nic: "TEST-NIC",
    district: "Jaffna",
    registrationRef: "REG-TEST",
    courseName: "Software Engineering",
    created_at: "2026-10-28T03:00:00.000Z",
    submitted_at: "2026-10-28T03:00:00.000Z",
    ol_results: { year: "", index_no: "", maths: "", english: "", science: "" },
    al_results: { stream: "", year: "", index_no: "", summary: "" },
    emergency_contact: { name: "", relation: "", phone: "" },
    statement_of_purpose: "",
    review_notes: "Retain existing review notes",
  };
  details = {
    application: { ...app, status: "approved" },
    submissions: [
      {
        id: "response-one",
        formId: "form-one",
        formTitle: "Scholarship Application",
        createdAt: app.submitted_at,
        answers: [
          { id: "olIct", label: "Original O/L ICT question", value: "A grade" },
          {
            id: "currentStatus",
            label: "Current status",
            value: "Studying at school",
          },
          {
            id: "greatestAccomplishment",
            label: "Greatest accomplishment",
            value: "Built a study group",
          },
          { id: "count", label: "Completed projects", value: 0 },
          { id: "confirmed", label: "Previous attendance", value: false },
          { id: "interests", label: "Interests", value: ["Web", "Mobile"] },
          {
            id: "file",
            label: "Uploaded certificate",
            value: "https://drive.google.com/file/d/private-file/view",
          },
          {
            id: "untrusted",
            label: "Other answer",
            value: "javascript:alert(1)",
          },
        ],
      },
    ],
  };
  mocks.apiResponse.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ success: true, applications: [app], total: 1 }),
      ),
  );
  mocks.api.mockImplementation(async (_url, body) =>
    body
      ? {
          success: true,
          application: { ...details.application, status: body.status },
        }
      : structuredClone(details),
  );
});
afterEach(() => cleanup());

async function inspect() {
  render(createElement(AdminApplicationsPage));
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Details" }),
  );
  return screen.findByRole("dialog", { name: "Example Applicant" });
}

it("loads this application's complete answers on demand, including zero, false, choices and private document links", async () => {
  render(createElement(AdminApplicationsPage));
  const button = await screen.findByRole("button", { name: "Inspect Details" });
  expect(mocks.api).not.toHaveBeenCalled();
  fireEvent.click(button);
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("Built a study group");
  expect(within(dialog).getByText("Original O/L ICT question")).toBeDefined();
  expect(within(dialog).getByText("Studying at school")).toBeDefined();
  expect(within(dialog).getByText("0")).toBeDefined();
  expect(within(dialog).getByText("No")).toBeDefined();
  expect(within(dialog).getByText("Web, Mobile")).toBeDefined();
  expect(
    within(dialog)
      .getByRole("link", { name: "Open document ↗" })
      .getAttribute("href"),
  ).toBe("https://drive.google.com/file/d/private-file/view");
  expect(within(dialog).getAllByRole("link")).toHaveLength(1);
  expect(within(dialog).getByText("javascript:alert(1)")).toBeDefined();
  expect(mocks.api).toHaveBeenCalledWith(
    "/api/admin/applications/application-one",
    undefined,
    "GET",
    expect.any(AbortSignal),
  );
});

it.each([
  ["submitted", ["Mark Under Review", "Approve Application", "Reject"]],
  ["under_review", ["Approve Application", "Reject"]],
  ["approved", ["Mark Under Review"]],
  ["rejected", ["Mark Under Review"]],
  ["withdrawn", ["Mark Under Review"]],
  ["invited", []],
  ["started", []],
] as [ApplicationStatus, string[]][])(
  "shows only permitted review actions for the current server status %s",
  async (status, labels) => {
    details.application.status = status;
    const dialog = await inspect();
    await within(dialog).findByText("Built a study group");
    for (const name of ["Mark Under Review", "Approve Application", "Reject"]) {
      expect(Boolean(within(dialog).queryByRole("button", { name }))).toBe(
        labels.includes(name),
      );
    }
  },
);

it("uses the fresh server status when reopening a decision and preserves notes while updating both dialog and list", async () => {
  const dialog = await inspect();
  fireEvent.click(
    await within(dialog).findByRole("button", { name: "Mark Under Review" }),
  );
  await within(dialog).findByRole("button", { name: "Approve Application" });
  expect(mocks.api).toHaveBeenLastCalledWith(
    "/api/admin/applications",
    {
      id: app.id,
      status: "under_review",
      expectedStatus: "approved",
    },
    "PATCH",
  );
  expect(
    within(dialog).queryByRole("button", { name: "Mark Under Review" }),
  ).toBeNull();
  expect(
    within(dialog).getByText("Retain existing review notes"),
  ).toBeDefined();
  expect(screen.getByRole("table").textContent).toContain("under_review");
});

it("blocks further edits after a stale decision until the reviewer reloads the application", async () => {
  mocks.api.mockImplementation(async (_url, body) => {
    if (body)
      throw new ApiError(
        "This application changed. Reload before saving.",
        409,
        "VERSION_CONFLICT",
      );
    return structuredClone(details);
  });
  const dialog = await inspect();
  fireEvent.click(
    await within(dialog).findByRole("button", { name: "Mark Under Review" }),
  );
  await within(dialog).findByText(
    "This application changed. Reload before saving.",
  );
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Mark Under Review",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  details.application.status = "rejected";
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Reload application" }),
  );
  await waitFor(() =>
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Mark Under Review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(within(dialog).getByText("rejected")).toBeDefined();
  expect(
    within(dialog).queryByRole("button", { name: "Approve Application" }),
  ).toBeNull();
});

it("shows a recoverable error and no decision actions when details fail to load", async () => {
  mocks.api.mockRejectedValueOnce(new Error("Could not reach admissions."));
  const dialog = await inspect();
  await within(dialog).findByText("Could not reach admissions.");
  expect(
    within(dialog).queryByRole("button", { name: "Approve Application" }),
  ).toBeNull();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Reload application" }),
  );
  await within(dialog).findByText("Built a study group");
});

it("keeps legacy application qualifications visible when there is no custom-form response", async () => {
  details.submissions = [];
  details.application.ol_results.maths = "A";
  details.application.al_results.z_score = "0";
  details.application.statement_of_purpose = "I want to become a developer.";
  const dialog = await inspect();
  await within(dialog).findByText("I want to become a developer.");
  expect(within(dialog).getByText("O/L Mathematics")).toBeDefined();
  expect(within(dialog).getByText("A")).toBeDefined();
  expect(within(dialog).getByText("0")).toBeDefined();
});

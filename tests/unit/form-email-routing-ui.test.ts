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
import FormEmailRouting from "../../src/components/form-email-routing";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../src/components/live-data", async (original) => ({
  ...(await original<any>()),
  api: mocks.api,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => createElement("a", props, children),
}));
const forms = [
  {
    id: "registration",
    title: "Registration",
    type: "registration",
    campaignId: "intake",
    active: true,
    updatedAt: "v1",
    hasDraft: false,
    applicant: "form",
    staff: "admin_submission",
    staffEmails: [],
    invitationFormId: "",
  },
  {
    id: "application",
    title: "Application",
    type: "application",
    campaignId: "intake",
    active: true,
    updatedAt: "v2",
    hasDraft: false,
    applicant: "form",
    staff: "off",
    staffEmails: [],
    invitationFormId: "",
  },
];
beforeEach(() => {
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (_path: string, body?: unknown) =>
    body
      ? { success: true, updatedAt: "saved-version", message: "Routing saved" }
      : { success: true, forms: structuredClone(forms) },
  );
});
afterEach(() => cleanup());
it("saves the chosen template for the correct form and keeps another form's unsaved choice", async () => {
  render(createElement(FormEmailRouting));
  await screen.findByRole("heading", { name: "Registration" });
  const panels = screen
    .getAllByRole("button", { name: "Save routing" })
    .map((button) => button.closest("form")!);
  fireEvent.change(within(panels[0]).getByLabelText("Applicant confirmation"), {
    target: { value: "registration_confirmation" },
  });
  fireEvent.change(within(panels[1]).getByLabelText("Applicant confirmation"), {
    target: { value: "application_confirmation" },
  });
  fireEvent.click(
    within(panels[0]).getByRole("button", { name: "Save routing" }),
  );
  await screen.findByText("Routing saved");
  expect(mocks.api).toHaveBeenCalledWith(
    "/api/admin/email/routing",
    expect.objectContaining({
      formId: "registration",
      expectedUpdatedAt: "v1",
      applicant: "registration_confirmation",
    }),
  );
  expect(
    (
      within(panels[1]).getByLabelText(
        "Applicant confirmation",
      ) as HTMLSelectElement
    ).value,
  ).toBe("application_confirmation");
  expect(
    within(panels[1])
      .getByRole("button", { name: "Save routing" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
it("preserves edits when a save fails and reports unsaved state", async () => {
  const onDirty = vi.fn();
  render(createElement(FormEmailRouting, { onDirtyChange: onDirty }));
  await screen.findByRole("heading", { name: "Registration" });
  const panel = screen
    .getAllByRole("button", { name: "Save routing" })[0]
    .closest("form")!;
  fireEvent.change(within(panel).getByLabelText("Applicant confirmation"), {
    target: { value: "off" },
  });
  mocks.api.mockRejectedValueOnce(
    new Error("Another administrator changed this form"),
  );
  fireEvent.click(within(panel).getByRole("button", { name: "Save routing" }));
  await screen.findByText("Another administrator changed this form");
  expect(
    (
      within(panel).getByLabelText(
        "Applicant confirmation",
      ) as HTMLSelectElement
    ).value,
  ).toBe("off");
  await waitFor(() => expect(onDirty).toHaveBeenLastCalledWith(true));
});

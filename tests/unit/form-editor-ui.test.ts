// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import FormBuilderEditor from "../../src/components/form-builder/editor";
import FormQuestion from "../../src/components/form-question";
import RichTextEditor from "../../src/components/form-builder/rich-text-editor";
import { richTextFromPlain } from "../../src/lib/forms/rich-text";
import { waitFor } from "@testing-library/react";
import type { CustomForm, FormField } from "../../src/lib/data/store";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../src/lib/client/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/client/api")>()),
  api: mocks.api,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => createElement("a", props, children),
}));
let fixture: CustomForm;
beforeEach(() => {
  fixture = {
    id: "editor-ui",
    title: "Admission form",
    description: "Instructions",
    slug: "admission",
    is_active: true,
    type: "registration",
    fields: [
      { id: "fullName", type: "text", label: "Full name", required: true },
      { id: "email", type: "email", label: "Email", required: true },
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
  };
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (url, body) => {
    if (url.includes("/workshops")) return { success: true, workshops: [] };
    if (body?.action === "save_draft")
      return {
        success: true,
        form: {
          ...fixture,
          editor_draft: {
            version: "2026-01-02T00:00:00.000Z",
            base_updated_at: fixture.updated_at,
            values: body.draft,
          },
        },
      };
    return { success: true, form: structuredClone(fixture) };
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function open() {
  render(createElement(FormBuilderEditor, { id: fixture.id }));
  await screen.findByRole("heading", { name: "Admission form", level: 1 });
}

it("adds a question and shows only its contextual settings", async () => {
  await open();
  fireEvent.click(
    within(
      screen.getByRole("complementary", { name: "Field library" }),
    ).getByRole("button", { name: "Short answer" }),
  );
  expect(
    (screen.getByRole("textbox", { name: "Question" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Short answer");
  fireEvent.change(screen.getByRole("textbox", { name: "Question" }), {
    target: { value: "Preferred name" },
  });
  expect(
    within(screen.getByRole("region", { name: "Form canvas" })).getByText(
      "Preferred name",
    ),
  ).toBeTruthy();
  expect(
    screen.queryByText("Automated Google Apps Script Webhook Snippet"),
  ).toBeNull();
});
it("duplicates a question, deletes it and restores it with Undo", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Duplicate Full name" }));
  expect(
    (screen.getByRole("textbox", { name: "Question" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Full name (copy)");
  fireEvent.click(
    screen.getByRole("button", { name: "Delete Full name (copy)" }),
  );
  expect(
    screen.queryByRole("button", { name: "Duplicate Full name (copy)" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(
    screen.getByRole("button", { name: "Duplicate Full name (copy)" }),
  ).toBeTruthy();
});
it("reorders questions using keyboard-accessible move controls", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Move Email up" }));
  const canvas = screen.getByRole("region", { name: "Form canvas" });
  expect(canvas.querySelectorAll("article")[0].textContent).toContain("Email");
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(canvas.querySelectorAll("article")[0].textContent).toContain(
    "Full name",
  );
});
it("previews unsaved question changes without publishing or submitting", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Edit Full name" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Question" }), {
    target: { value: "Applicant full name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  const preview = screen.getByRole("dialog", { name: "Applicant preview" });
  expect(
    within(preview).getByRole("textbox", { name: /Applicant full name/ }),
  ).toBeTruthy();
  expect(
    within(preview).getByText(
      "Includes your latest edits. Responses and uploads are disabled in preview.",
    ),
  ).toBeTruthy();
  expect(
    mocks.api.mock.calls.some(([, body]) => body?.action === "publish"),
  ).toBe(false);
});
it("edits real rich-text structure and rejects unsafe links in the description toolbar", async () => {
  const onChange = vi.fn();
  render(
    createElement(RichTextEditor, {
      value: richTextFromPlain("Application instructions"),
      onChange,
    }),
  );
  const heading = screen.getByRole("button", {
    name: "Heading",
  }) as HTMLButtonElement;
  await waitFor(() => expect(heading.disabled).toBe(false));
  fireEvent.click(heading);
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls.at(-1)?.[0].content[0].type).toBe("heading");
  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Link address" }), {
    target: { value: "javascript:alert(1)" },
  });
  expect(
    (screen.getByRole("button", { name: "Apply link" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("supports multiple checkbox answers and accessible help and validation text", () => {
  const onChange = vi.fn(),
    field: FormField = {
      id: "topics",
      type: "checkbox",
      label: "Topics",
      required: true,
      options: ["Web", "Data"],
      helpText: "Choose your interests",
    };
  const view = render(
    createElement(FormQuestion, {
      field,
      value: ["Web"],
      onChange,
      error: "Choose at most two",
    }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Data" }));
  expect(onChange).toHaveBeenCalledWith(["Web", "Data"]);
  expect(
    screen
      .getByRole("group", { name: "Topics *" })
      .getAttribute("aria-describedby"),
  ).toContain("help-topics");
  expect(screen.getByRole("alert").textContent).toBe("Choose at most two");
  view.rerender(
    createElement(FormQuestion, { field, value: ["Web", "Data"], onChange }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Web" }));
  expect(onChange).toHaveBeenLastCalledWith(["Data"]);
});

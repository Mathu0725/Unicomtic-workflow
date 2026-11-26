// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const request = vi.hoisted(() => vi.fn());
const picker = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/client/api", () => ({ apiResponse: request }));
vi.mock("../../src/lib/client/google-spreadsheet-picker", () => ({ chooseGoogleSpreadsheet: picker }));
import AdminFormsPage from "../../src/app/admin/forms/page";

const form = {
  id: "form-1", title: "Registration", type: "registration", slug: "registration",
  is_active: true, google_sheets_config: { enabled: true, sheet_id: "old-sheet", sheet_name: "Old tab", auto_sync: true },
};
const reply = (data: unknown) => ({ json: async () => data });

beforeEach(() => {
  request.mockReset(); picker.mockReset();
  request.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === "/api/admin/forms" && !options?.method) return reply({ forms: [form], intakes: [] });
    if (url === "/api/admin/integrations") return reply({ google: { email: "staff@example.test", driveAccess: true } });
    if (url.endsWith("/sheets")) {
      const body = JSON.parse(String(options?.body));
      return body.action === "create"
        ? reply({ sheetId: "new-sheet", title: body.title, worksheets: ["Responses", "Other"] })
        : reply({ sheetId: body.sheetId, title: "Existing", worksheets: ["Old tab"] });
    }
    if (url === "/api/admin/forms/form-1" && options?.method === "PATCH") return reply({ success: true });
    throw new Error(`Unexpected request: ${url}`);
  });
});
afterEach(() => { cleanup(); });

async function openSettings() {
  render(<AdminFormsPage />);
  fireEvent.click(await screen.findByTitle("Edit Google Sheet link for this form"));
  await screen.findByText(/Connected Google account/);
  await screen.findByRole("option", { name: "Old tab" });
}

it("creates a spreadsheet, selects its worksheet, and saves it for the form", async () => {
  await openSettings();
  expect((screen.getByLabelText("Use existing") as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByLabelText("Create new"));
  fireEvent.change(screen.getByLabelText("New spreadsheet name"), { target: { value: "Applications 2027" } });
  fireEvent.click(screen.getByRole("button", { name: "Create spreadsheet" }));
  expect(await screen.findByText(/Spreadsheet created/)).toBeTruthy();
  expect((screen.getByDisplayValue("new-sheet") as HTMLInputElement).value).toBe("new-sheet");
  expect((screen.getByRole("button", { name: "Sync Existing Rows Now" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("combobox", { name: "" }), { target: { value: "Other" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith("/api/admin/forms/form-1", expect.objectContaining({ method: "PATCH" })));
  const call = request.mock.calls.find(([url, options]) => url === "/api/admin/forms/form-1" && options?.method === "PATCH");
  expect(JSON.parse(String(call?.[1].body)).google_sheets_config).toMatchObject({ enabled: true, clean_export: true, sheet_id: "new-sheet", sheet_name: "Other" });
});

it("retains the existing destination when creation is unconfirmed", async () => {
  await openSettings();
  request.mockImplementationOnce(async () => { throw Object.assign(new Error("Timed out"), { status: 0 }); });
  fireEvent.click(screen.getByLabelText("Create new"));
  fireEvent.click(screen.getByRole("button", { name: "Create spreadsheet" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/Check Google Drive before creating another spreadsheet/);
  expect((screen.getByDisplayValue("old-sheet") as HTMLInputElement).value).toBe("old-sheet");
});

it("chooses an existing spreadsheet and inspects its worksheets before saving", async () => {
  await openSettings();
  picker.mockResolvedValueOnce({ id: "existing-sheet", name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Choose a spreadsheet from my Google account" }));
  await screen.findByDisplayValue("existing-sheet");
  expect(request).toHaveBeenCalledWith("/api/admin/forms/form-1/sheets", expect.objectContaining({ body: JSON.stringify({ action: "inspect", sheetId: "existing-sheet" }) }));
  expect((screen.getByRole("button", { name: "Sync Existing Rows Now" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith("/api/admin/forms/form-1", expect.objectContaining({ method: "PATCH" })));
  const call = request.mock.calls.find(([url, options]) => url === "/api/admin/forms/form-1" && options?.method === "PATCH");
  expect(JSON.parse(String(call?.[1].body)).google_sheets_config).toMatchObject({ sheet_id: "existing-sheet", sheet_name: "Old tab" });
});

it("enables clean question-only exports independently for each form", async () => {
  await openSettings();
  fireEvent.click(screen.getByLabelText("Only form answers, submission time and status"));
  expect(screen.getByText(/Choose a separate empty worksheet/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Sync Existing Rows Now" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith("/api/admin/forms/form-1", expect.objectContaining({ method: "PATCH" })));
  const call = request.mock.calls.find(([url, options]) => url === "/api/admin/forms/form-1" && options?.method === "PATCH");
  expect(JSON.parse(String(call?.[1].body)).google_sheets_config.clean_export).toBe(true);
});


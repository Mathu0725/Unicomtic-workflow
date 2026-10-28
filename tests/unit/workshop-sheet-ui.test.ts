// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import WorkshopSheetConnection from "../../src/components/workshop-sheet-connection";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  submit: vi.fn(),
  reload: vi.fn(async () => {}),
}));
vi.mock("../../src/components/live-data", async (original) => ({
  ...(await original<any>()),
  api: mocks.api,
}));
vi.mock("../../src/lib/client/submit", () => ({
  pendingPayload: () => undefined,
  submitRequest: mocks.submit,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => createElement("a", props, children),
}));
const workshop = { id: "workshop-1", title: "Workshop One" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockResolvedValue({
    success: true,
    sheetId: "selected-sheet",
    worksheets: ["Registrations", "Dedicated Workshop"],
    message: "Read access verified",
  });
  mocks.submit.mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        message: "Workshop connection saved",
        queued: 2,
      }),
    ),
  );
});
afterEach(() => cleanup());
it("loads tabs and saves this workshop's chosen spreadsheet, tab and automatic sync setting", async () => {
  render(
    createElement(WorkshopSheetConnection, {
      workshop,
      googleConnected: true,
      defaultSpreadsheetId: "admissions",
      onChanged: mocks.reload,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Connect Google Sheet" }));
  fireEvent.change(screen.getByLabelText("Spreadsheet URL or ID"), {
    target: { value: "selected-sheet" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Check spreadsheet & load tabs" }),
  );
  await screen.findByText("Read access verified");
  fireEvent.change(
    screen.getByLabelText("Existing tabs (choose a dedicated workshop tab)"),
    { target: { value: "Dedicated Workshop" } },
  );
  fireEvent.click(
    screen.getByLabelText(
      "Automatically sync new bookings and attendance updates",
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Save Sheet connection" }),
  );
  await screen.findByText("Workshop connection saved");
  expect(mocks.submit).toHaveBeenCalledWith(
    "/api/admin/workshops/workshop-1/sheets/config",
    expect.objectContaining({
      sheetId: "selected-sheet",
      sheetName: "Dedicated Workshop",
      enabled: true,
      autoSync: false,
      syncExisting: true,
      expectedVersion: "",
    }),
  );
});
it("keeps unsaved connection edits when saving fails and shows the error", async () => {
  mocks.submit.mockResolvedValue(
    new Response(
      JSON.stringify({
        success: false,
        message: "Another workshop uses this tab",
        code: "WORKSHOP_SHEET_CONFLICT",
      }),
      { status: 409 },
    ),
  );
  render(
    createElement(WorkshopSheetConnection, {
      workshop,
      googleConnected: true,
      defaultSpreadsheetId: "admissions",
      onChanged: mocks.reload,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Connect Google Sheet" }));
  fireEvent.change(screen.getByLabelText("Workshop tab name"), {
    target: { value: "My dedicated tab" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save Sheet connection" }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Another workshop uses this tab",
  );
  expect(
    (screen.getByLabelText("Workshop tab name") as HTMLInputElement).value,
  ).toBe("My dedicated tab");
});
it("shows sync counts and queues an explicit resync using the saved destination version", async () => {
  render(
    createElement(WorkshopSheetConnection, {
      workshop: {
        ...workshop,
        google_sheets_config: {
          enabled: true,
          sheet_id: "bookings-sheet",
          sheet_name: "Workshop One",
          auto_sync: true,
          version: "version-1",
          updated_at: "2026-10-28T10:00:00Z",
        },
        sheetSync: {
          total: 3,
          synced: 2,
          pending: 1,
          failed: 0,
          lastSyncedAt: null,
          lastError: null,
        },
      },
      googleConnected: true,
      defaultSpreadsheetId: "admissions",
      onChanged: mocks.reload,
    }),
  );
  expect(screen.getByText(/2 of 3 booking rows synced/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sync all bookings" }));
  await waitFor(() =>
    expect(mocks.submit).toHaveBeenCalledWith(
      "/api/admin/workshops/workshop-1/sheets/sync",
      expect.objectContaining({ expectedVersion: "version-1" }),
    ),
  );
  expect(
    screen.getByRole("link", { name: "Open spreadsheet" }).getAttribute("href"),
  ).toContain("bookings-sheet");
});
it("guides disconnected users to Google Integrations and does not create sheets automatically", () => {
  render(
    createElement(WorkshopSheetConnection, {
      workshop,
      googleConnected: false,
      defaultSpreadsheetId: "",
      onChanged: mocks.reload,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Connect Google Sheet" }));
  expect(
    screen.getByRole("link", { name: "Connect Google first" }),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Create a new spreadsheet",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(mocks.api).not.toHaveBeenCalled();
});

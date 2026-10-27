import { describe, expect, it } from "vitest";
import { formSheetTarget } from "../../src/lib/google/sheet-target";
import type { Integrations } from "../../src/lib/data/types";

const integrations: Integrations = {
  email_provider: "gmail", admin_notification_email: "",
  registration_sheet_id: "admissions-reg", application_sheet_id: "admissions-app",
};
const form = {
  type: "registration" as const,
  google_sheets_config: { enabled: false, sheet_id: "old-form-sheet", sheet_name: "Old tab", auto_sync: false },
};

describe("Effective Google Sheet destination", () => {
  it("uses the current admissions sheet when the form override is off", () => {
    expect(formSheetTarget(integrations, form)).toMatchObject({ sheet_id: "admissions-reg", sheet_name: "Registrations", auto_sync: true, source: "admissions" });
  });
  it("uses the applications destination for application forms", () => {
    expect(formSheetTarget(integrations, { ...form, type: "application" })).toMatchObject({ sheet_id: "admissions-app", sheet_name: "Applications" });
  });
  it("honors an explicit separate sheet and its paused auto-sync setting", () => {
    expect(formSheetTarget(integrations, { ...form, google_sheets_config: { ...form.google_sheets_config, enabled: true } })).toMatchObject({ sheet_id: "old-form-sheet", sheet_name: "Old tab", auto_sync: false, source: "form" });
  });
  it("does not silently switch a broken explicit override to another sheet", () => {
    expect(formSheetTarget(integrations, { ...form, google_sheets_config: { ...form.google_sheets_config, enabled: true, sheet_id: "" } })).toBeNull();
  });
  it("reports missing admissions configuration instead of claiming a destination", () => {
    expect(formSheetTarget({ ...integrations, registration_sheet_id: undefined }, form)).toBeNull();
  });
});

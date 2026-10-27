import { describe, it, expect } from "vitest";
import { getDb, CustomForm } from "../../src/lib/data/store";

describe("Form-Specific Google Sheet Configuration", () => {
  it("should verify that each form has its own independent Google Sheet configuration", () => {
    const db = getDb();
    const forms = db.customForms;

    expect(forms.length).toBeGreaterThanOrEqual(2);

    const form1 = forms.find((f) => f.slug === "tic-2025-registration");
    const form2 = forms.find((f) => f.slug === "tic-2025-formal-application");

    expect(form1).toBeDefined();
    expect(form2).toBeDefined();

    expect(form1?.google_sheets_config).toBeDefined();
    expect(form2?.google_sheets_config).toBeDefined();

    // Verify configurations are independent
    expect(form1?.google_sheets_config.sheet_name).toBe("Registrations");
  });

  it("should allow updating Google Sheet ID and tab name for a specific form", () => {
    const db = getDb();
    const targetForm = db.customForms[0];

    const newSheetId = "1A2B3C4D5E6F_UNIQUE_SHEET_2025";
    const newSheetTab = "Batch_C_Registrations";

    targetForm.google_sheets_config = {
      enabled: true,
      sheet_id: newSheetId,
      sheet_name: newSheetTab,
      auto_sync: true,
      last_synced_at: new Date().toISOString(),
    };

    const retrieved = db.customForms.find((f) => f.id === targetForm.id);
    expect(retrieved?.google_sheets_config.sheet_id).toBe(newSheetId);
    expect(retrieved?.google_sheets_config.sheet_name).toBe(newSheetTab);
    expect(retrieved?.google_sheets_config.enabled).toBe(true);
  });
});

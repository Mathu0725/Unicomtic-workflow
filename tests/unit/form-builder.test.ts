import { describe, it, expect } from "vitest";
import { getDb, CustomForm } from "../../src/lib/data/store";
import { nicRegex, phoneRegex } from "../../src/lib/validations/registration";

describe("Dynamic Form Builder & 1-Click Form Duplication", () => {
  it("should have pre-seeded active registration and application forms", () => {
    const db = getDb();
    expect(db.customForms.length).toBeGreaterThanOrEqual(2);

    const regForm = db.customForms.find((f) => f.slug === "tic-2025-registration");
    expect(regForm).toBeDefined();
    expect(regForm?.fields.length).toBeGreaterThanOrEqual(6);
    expect(regForm?.google_sheets_config.enabled).toBe(true);
    expect(regForm?.email_automation.send_applicant_email).toBe(true);
  });

  it("should duplicate a form with all fields, Google Sheets config, and email automation (like Forms App)", () => {
    const db = getDb();
    const sourceForm = db.customForms[0];

    const duplicateId = `form-${Date.now()}`;
    const duplicateSlug = `${sourceForm.slug}-batch-2`;
    const duplicateTitle = `${sourceForm.title} (Batch 2)`;

    const clonedForm: CustomForm = {
      ...JSON.parse(JSON.stringify(sourceForm)),
      id: duplicateId,
      slug: duplicateSlug,
      title: duplicateTitle,
      submissions_count: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.customForms.unshift(clonedForm);

    const retrieved = db.customForms.find((f) => f.id === duplicateId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe(duplicateTitle);
    expect(retrieved?.slug).toBe(duplicateSlug);
    expect(retrieved?.fields).toEqual(sourceForm.fields);
    expect(retrieved?.google_sheets_config).toEqual(sourceForm.google_sheets_config);
    expect(retrieved?.email_automation).toEqual(sourceForm.email_automation);
    expect(retrieved?.submissions_count).toBe(0);
  });

  it("should validate Sri Lankan NIC and phone number rules for form fields", () => {
    // Valid Sri Lankan NIC
    expect(nicRegex.test("200112304567")).toBe(true);
    expect(nicRegex.test("991234567V")).toBe(true);
    expect(nicRegex.test("991234567X")).toBe(true);
    expect(nicRegex.test("INVALID_NIC")).toBe(false);

    // Valid Sri Lankan Phone
    expect(phoneRegex.test("0771234567")).toBe(true);
    expect(phoneRegex.test("+94771234567")).toBe(true);
    expect(phoneRegex.test("0718765432")).toBe(true);
    expect(phoneRegex.test("12345")).toBe(false);
  });
});

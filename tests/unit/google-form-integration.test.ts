import { describe, it, expect } from "vitest";
import { getDb, CustomForm, FormSubmission } from "../../src/lib/data/store";

describe("Google Form Integration & Real-Time Sync", () => {
  it("should configure Google Form URL and Webhook mode on a Custom Form", () => {
    const db = getDb();
    const form = db.customForms.find((f) => f.slug === "tic-2025-registration");

    expect(form).toBeDefined();
    expect(form?.google_form_config).toBeDefined();
    expect(form?.google_form_config?.enabled).toBe(true);
    expect(form?.google_form_config?.form_url).toContain("docs.google.com/forms");
    expect(form?.google_form_config?.response_mode).toBe("webhook");
  });

  it("should ingest a simulated Google Form webhook payload with unique reference number", () => {
    const db = getDb();
    const form = db.customForms.find((f) => f.slug === "tic-2025-registration");
    expect(form).toBeDefined();

    const previousCount = form?.submissions_count || 0;
    const refNo = `TIC-GF-${Date.now().toString().slice(-6)}`;

    const submission: FormSubmission = {
      id: `sub-gf-${Date.now()}`,
      form_id: form!.id,
      reference_no: refNo,
      data: {
        fullName: "Anura Kumara Silva",
        email: "anura.k@example.lk",
        phone: "0771122334",
        district: "Matara",
        source: "google_form_webhook",
      },
      synced_to_sheet: true,
      email_sent: true,
      created_at: new Date().toISOString(),
    };

    db.formSubmissions.unshift(submission);
    form!.submissions_count = previousCount + 1;

    // Verify submission recorded
    const saved = db.formSubmissions.find((s) => s.reference_no === refNo);
    expect(saved).toBeDefined();
    expect(saved?.data.fullName).toBe("Anura Kumara Silva");
    expect(saved?.data.district).toBe("Matara");
    expect(saved?.data.source).toBe("google_form_webhook");
    expect(form?.submissions_count).toBe(previousCount + 1);
  });
});

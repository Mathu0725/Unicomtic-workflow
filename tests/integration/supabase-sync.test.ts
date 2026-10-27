import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getDb } from "../../src/lib/data/store";
import { supabaseSyncService } from "../../src/lib/supabase/sync-service";
beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); });
afterAll(() => { vi.unstubAllEnvs(); });

describe("Real-Time Supabase Synchronization with Form Builder & Google Forms", () => {
  it("should successfully verify connection to Supabase", async () => {
    const health = await supabaseSyncService.checkConnection();
    expect(health.connected).toBe(true);
    expect(health.url).toBeDefined();
  });

  it("should synchronize a newly created Form to Supabase custom_forms", async () => {
    const db = getDb();
    const testForm = {
      ...db.customForms[0],
      id: `form-sb-test-${Date.now()}`,
      slug: `sb-test-${Date.now()}`,
      title: "Supabase Synced Registration Form 2025",
    };

    const result = await supabaseSyncService.syncForm(testForm);
    expect(result.success).toBe(true);
    expect(result.table).toBe("custom_forms");

    // Check audit log recorded in DB
    const log = db.auditLogs.find(
      (l) => l.action === "SUPABASE_FORM_SYNCED" && l.entity_id === testForm.id
    );
    expect(log).toBeDefined();
  });

  it("should dual-sync a form submission to Supabase form_submissions and canonical students/registrations", async () => {
    const db = getDb();
    const form = db.customForms[0];
    const uniqueRef = `TIC-SB-${Date.now().toString().slice(-6)}`;

    const submission = {
      id: `sub-test-${Date.now()}`,
      form_id: form.id,
      reference_no: uniqueRef,
      data: {
        fullName: "Tharindu Mihiran Bandara",
        nic: "199723456789",
        email: "tharindu.b@example.lk",
        phone: "0773344556",
        district: "Anuradhapura",
        source: "google_form_webhook",
      },
      synced_to_sheet: true,
      email_sent: true,
      created_at: new Date().toISOString(),
    };

    const syncRes = await supabaseSyncService.syncSubmission(submission, form);
    expect(syncRes.submissionSync.success).toBe(true);
    expect(syncRes.submissionSync.table).toBe("form_submissions");

    expect(syncRes.studentSync?.success).toBe(true);
    expect(syncRes.registrationSync?.success).toBe(true);

    // Verify canonical student was created in repository
    const student = db.students.find((s) => s.nic === "199723456789");
    expect(student).toBeDefined();
    expect(student?.full_name).toBe("Tharindu Mihiran Bandara");
    expect(student?.district).toBe("Anuradhapura");

    // Verify canonical registration was created
    const reg = db.registrations.find((r) => r.reference_no === uniqueRef);
    expect(reg).toBeDefined();
    expect(reg?.student_id).toBe(student?.id);
    expect(reg?.status).toBe("invited"); // The seeded campaign automatically invites applicants.
  });
});

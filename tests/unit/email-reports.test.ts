import { expect, it } from "vitest";
import { DatabaseStore } from "../../src/lib/data/store";
import { colomboDay, emailDailyReport } from "../../src/lib/email/reports";

it("uses Sri Lanka calendar boundaries and distinguishes provider acceptance from delivery", () => {
  const db = new DatabaseStore();
  db.formSubmissions = [];
  db.outbox = [];
  const form = db.customForms[0];
  db.formSubmissions.push({ id: "before", form_id: form.id, reference_no: "A", data: {}, synced_to_sheet: false, email_sent: false, created_at: "2026-10-29T18:29:00Z" });
  db.formSubmissions.push({ id: "after", form_id: form.id, reference_no: "B", data: {}, synced_to_sheet: false, email_sent: false, created_at: "2026-10-29T18:31:00Z" });
  db.outbox.push({ id: "email-1", key: "email-1", type: "email", status: "sent", attempts: 1, payload: { formId: form.id, scheduledFor: "2026-10-29T18:31:00Z", formCampaignId: "campaign-1" }, email_account_id: "account-1", created_at: "2026-10-29T18:31:00Z", completed_at: "2026-10-29T18:35:00Z" });
  db.outbox.push({ id: "email-2", key: "email-2", type: "email", status: "queued", attempts: 0, payload: { formId: form.id }, email_account_id: "account-1", created_at: "2026-10-29T18:29:00Z" });
  expect(colomboDay("2026-10-29T18:29:00Z")).toBe("2026-10-29");
  expect(colomboDay("2026-10-29T18:31:00Z")).toBe("2026-10-30");
  const report = emailDailyReport(db, "2026-10-30");
  expect(report.totals).toMatchObject({ responses: 1, queued: 1, scheduledForDay: 1, sent: 1, currentPending: 1, delivered: null, bounced: null });
  expect(report.byForm[0]).toMatchObject({ formId: form.id, responses: 1, sent: 1 });
  expect(report.byAccount[0]).toMatchObject({ id: "account-1", queued: 1, sent: 1 });
  expect(report.byCampaign[0]).toMatchObject({ id: "campaign-1", sent: 1 });
  expect(() => emailDailyReport(db, "2026-02-30")).toThrow("valid report date");
});

import type { DatabaseStore } from "../data/store";
import { RequestError } from "../http";

export function colomboDay(value: string | number | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function emailDailyReport(db: DatabaseStore, requestedDay?: string) {
  const day = requestedDay || colomboDay(Date.now());
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== day) throw new RequestError("Choose a valid report date.");
  const responses = db.formSubmissions.filter(item => colomboDay(item.created_at) === day);
  const emails = db.outbox.filter(item => item.type === "email");
  const queued = emails.filter(item => colomboDay(item.created_at) === day);
  const scheduled = emails.filter(item => item.payload.scheduledFor && colomboDay(item.payload.scheduledFor) === day);
  const sent = emails.filter(item => item.status === "sent" && item.completed_at && colomboDay(item.completed_at) === day);
  const failed = emails.filter(item => item.status === "failed" && colomboDay(item.last_attempt_at || item.created_at) === day);
  const pending = emails.filter(item => ["queued", "sending"].includes(item.status));
  const needsReview = emails.filter(item => ["failed", "blocked", "uncertain"].includes(item.status));
  const byForm = db.customForms.map(form => ({ formId: form.id, title: form.title, responses: responses.filter(item => item.form_id === form.id).length, queued: queued.filter(item => item.payload.formId === form.id).length, sent: sent.filter(item => item.payload.formId === form.id).length })).filter(item => item.responses || item.queued || item.sent);
  const accounts = [...new Set([...queued, ...sent].map(item => item.email_account_id || "unknown"))].map(id => ({ id, queued: queued.filter(item => (item.email_account_id || "unknown") === id).length, sent: sent.filter(item => (item.email_account_id || "unknown") === id).length }));
  const campaignIds = [...new Set([...queued, ...sent].map(item => item.payload.formCampaignId).filter(Boolean))];
  const byCampaign = campaignIds.map(id => ({ id, formId: emails.find(item => item.payload.formCampaignId === id)?.payload.formId, queued: queued.filter(item => item.payload.formCampaignId === id).length, sent: sent.filter(item => item.payload.formCampaignId === id).length }));
  return { day, timeZone: "Asia/Colombo", totals: { responses: responses.length, queued: queued.length, scheduledForDay: scheduled.length, sent: sent.length, failed: failed.length, currentPending: pending.length, currentNeedsReview: needsReview.length, delivered: null, bounced: null }, byForm, byAccount: accounts, byCampaign, generatedAt: new Date().toISOString() };
}

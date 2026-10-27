import type { OutboxJob } from "../data/types";

export function emailJobStatus(job: OutboxJob, now = Date.now()) {
  if (job.status === "sent") return { label: "Sent", tone: "success", filter: "sent" };
  if (job.status === "uncertain") return { label: "Not confirmed · review needed", tone: "warning", filter: "uncertain" };
  if (job.status === "failed" || job.status === "blocked") return { label: job.status === "blocked" ? "Failed · repair needed" : "Failed", tone: "error", filter: "failed" };
  if (job.status === "sending") return { label: "Sending", tone: "neutral", filter: "sending" };
  if (job.error) return { label: "Failed · retry scheduled", tone: "error", filter: "failed" };
  if (job.deferred_until && Date.parse(job.deferred_until) > now) return { label: "Waiting for daily limit", tone: "warning", filter: "waiting" };
  return { label: "Queued", tone: "neutral", filter: "queued" };
}

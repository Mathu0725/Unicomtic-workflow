import type { DatabaseStore, SelectionDecision } from "../data/store";
import type { OutboxJob } from "../data/types";

export function decisionNotificationKey(decision: SelectionDecision) {
  const base = `decision:${decision.id}:${decision.final_status}`;
  // Revision zero preserves the identity of notifications queued before versioning.
  return decision.revision ? `${base}:v${decision.revision}` : base;
}

export function decisionJobIsCurrent(db: DatabaseStore, job: OutboxJob) {
  if (!job.payload.decisionId) return true;
  return db.selectionDecisions.some(decision => decision.id === job.payload.decisionId && decisionNotificationKey(decision) === job.key);
}

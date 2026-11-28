import assert from "node:assert/strict";

export function burstStages(raw = "10,25,50,100,200,300") {
  const stages = raw.split(",").map(value => Number(value.trim()));
  assert(stages.length > 0 && stages.length <= 10, "Use 1–10 bounded burst stages");
  assert(stages.every((n, i) => Number.isInteger(n) && n >= 1 && n <= 1000 && (!i || n > stages[i - 1])), "Stages must increase, with integer sizes from 1 to 1000");
  assert(stages.reduce((a, b) => a + b, 0) <= 3000, "Total request budget cannot exceed 3000");
  return stages;
}

export function summarizeBurst(name, results, elapsedMs) {
  const times = results.map(r => r.ms).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = p => times.length ? Math.round(times[Math.max(0, Math.ceil(times.length * p) - 1)]) : null;
  const accepted = results.filter(r => r.status === 200);
  const statuses = {};
  for (const result of results) statuses[result.status] = (statuses[result.status] || 0) + 1;
  return {
    name, requests: results.length, statuses, elapsedMs: Math.round(elapsedMs),
    p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
    accepted: accepted.length, errorRate: results.length ? (results.length - accepted.length) / results.length : 0,
    achievedRequestsPerSecond: elapsedMs > 0 ? Number((results.length * 1000 / elapsedMs).toFixed(2)) : null,
    uniqueReferences: new Set(accepted.map(r => r.referenceNo).filter(Boolean)).size,
    errors: results.filter(r => r.status !== 200).slice(0, 10).map(r => ({ status: r.status, code: r.code || null })),
  };
}

export function burstPasses(result, p95LimitMs = 5000) {
  return result.requests > 0 && result.accepted === result.requests
    && result.uniqueReferences === result.requests && result.unconfirmedSaves === 0
    && result.p95Ms !== null && result.p95Ms <= p95LimitMs;
}

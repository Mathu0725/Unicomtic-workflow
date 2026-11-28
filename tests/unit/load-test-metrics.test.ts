import { expect, it } from "vitest";
import { burstStages, summarizeBurst, burstPasses } from "../../scripts/lib/load-test-metrics.mjs";

it("bounds stage sizes and total generated traffic", () => {
  expect(burstStages("10,50,100")).toEqual([10, 50, 100]);
  for (const invalid of ["", "10,10", "50,10", "-1", "1001", "2.5", "a", "500,600,700,800,900"])
    expect(() => burstStages(invalid)).toThrow();
});
it("records network errors and rejects slow, duplicate or unreconciled successes", () => {
  const summary = summarizeBurst("test", [
    { status: 200, ms: 100, referenceNo: "one" },
    { status: 200, ms: 6000, referenceNo: "two" },
    { status: "network-error", ms: 7000, code: "TimeoutError" },
  ], 7000);
  expect(summary.statuses).toEqual({ "200": 2, "network-error": 1 });
  expect(summary.p95Ms).toBe(7000);
  expect(summary.uniqueReferences).toBe(2);
  expect(burstPasses({ ...summary, unconfirmedSaves: 0 })).toBe(false);
  const good = { requests: 2, accepted: 2, uniqueReferences: 2, unconfirmedSaves: 0, p95Ms: 100 };
  expect(burstPasses(good)).toBe(true);
  expect(burstPasses({ ...good, unconfirmedSaves: 1 })).toBe(false);
  expect(burstPasses({ ...good, uniqueReferences: 1 })).toBe(false);
  expect(burstPasses({ ...good, p95Ms: 5001 })).toBe(false);
});

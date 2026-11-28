import { expect, it } from "vitest";
import { workerDelay } from "../../scripts/lib/worker-delay.mjs";

it("backs off idle polling while resuming the fast interval when work is processed", () => {
  let idleRuns = 0;
  const delays = [];
  for (let i = 0; i < 6; i++) {
    const result = workerDelay({ processed: 0, failures: 0, idleRuns });
    delays.push(result.delayMs); idleRuns = result.idleRuns;
  }
  expect(delays).toEqual([4000, 8000, 16000, 30000, 30000, 30000]);
  expect(workerDelay({ processed: 1, failures: 0, idleRuns })).toEqual({ delayMs: 2000, idleRuns: 0 });
  expect(workerDelay({ processed: 0, failures: 2, idleRuns })).toEqual({ delayMs: 8000, idleRuns: 0 });
});

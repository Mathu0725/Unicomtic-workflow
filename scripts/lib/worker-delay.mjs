// Idle polling is capped below the server's 3-minute worker-staleness threshold.
export function workerDelay({ processed, failures, idleRuns }) {
    if (failures > 0) return { delayMs: Math.min(60000, 2000 * 2 ** Math.min(failures, 5)), idleRuns: 0 };
    if (processed > 0) return { delayMs: 2000, idleRuns: 0 };
    const nextIdleRuns = Math.min(idleRuns + 1, 4);
    return { delayMs: Math.min(30000, 2000 * 2 ** nextIdleRuns), idleRuns: nextIdleRuns };
}

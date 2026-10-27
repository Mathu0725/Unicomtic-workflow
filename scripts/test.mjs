import { startVitest } from "vitest/node";
import path from "node:path";
// Inline configuration also works in restricted Windows workspaces where a
// bundled config loader cannot traverse ancestor folders.
const args = process.argv.slice(2), watch = args.includes("--watch");
const context = await startVitest("test", args.filter(arg => arg !== "--watch"), { run: !watch, watch, config: false, maxWorkers: 4, minWorkers: 1, testTimeout: 15000 }, { resolve: { alias: { "@": path.resolve("src") } } });
if (!context) process.exitCode = 1;
else if (!watch) {
    if (context.state.getFiles().some(file => file.result?.state === "fail") || context.state.getUnhandledErrors().length) process.exitCode = 1;
    await context.close();
}

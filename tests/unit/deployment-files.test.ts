import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prepareDeploymentFiles, verifyDeploymentFiles } from "../../scripts/lib/deployment-files.mjs";

it.each([".data/secret.key", ".data/backups/admissions.json", ".env.local", ".git/config", "tests/fixture.json"])("blocks private build-trace dependency %s", async relative => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tic-trace-")), dist = path.join(root, ".next");
    try {
        await mkdir(dist); await writeFile(path.join(dist, "route.js.nft.json"), JSON.stringify({ files: [`../${relative}`] }));
        await expect(verifyDeploymentFiles(dist, root)).rejects.toThrow("private or non-runtime");
    } finally { await rm(root, { recursive: true, force: true }); }
});
it("accepts runtime dependencies and refuses an empty/malformed build", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tic-trace-")), dist = path.join(root, ".next");
    try {
        await mkdir(dist); await expect(verifyDeploymentFiles(dist, root)).rejects.toThrow("No deployment traces");
        const file = path.join(dist, "route.js.nft.json");
        await writeFile(file, JSON.stringify({ files: ["../node_modules/nodemailer/index.js", "server/chunks/123.js"] }));
        expect(await verifyDeploymentFiles(dist, root)).toMatchObject({ verified: true, privateFilesIncluded: 0 });
        await writeFile(file, "{}"); await expect(verifyDeploymentFiles(dist, root)).rejects.toThrow("Invalid deployment trace");
    } finally { await rm(root, { recursive: true, force: true }); }
});
it("removes only non-runtime trace entries, preserving source data and runtime chunks even in a path with parentheses", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "tic-trace-")), root = path.join(parent, "Project (test)"), dist = path.join(root, ".next");
    try {
        await mkdir(dist, { recursive: true }); await mkdir(path.join(root, ".data"));
        await writeFile(path.join(root, ".data", "platform.json"), "preserved admissions");
        await writeFile(path.join(dist, "route.js.nft.json"), JSON.stringify({ version: 1, files: ["../.data/platform.json", "../.env.local", "server/chunks/runtime.js", "../node_modules/nodemailer/index.js"] }));
        expect(await prepareDeploymentFiles(dist, root)).toMatchObject({ excludedPrivateFiles: 2 });
        expect(await verifyDeploymentFiles(dist, root)).toMatchObject({ verified: true, privateFilesIncluded: 0 });
        const { readFile } = await import("node:fs/promises");
        expect(await readFile(path.join(root, ".data", "platform.json"), "utf8")).toBe("preserved admissions");
        const trace = JSON.parse(await readFile(path.join(dist, "route.js.nft.json"), "utf8"));
        expect(trace.files).toEqual(["server/chunks/runtime.js", "../node_modules/nodemailer/index.js"]);
    } finally { await rm(parent, { recursive: true, force: true }); }
});

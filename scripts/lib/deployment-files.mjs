import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function inspectDeploymentFiles(dist, root, prepare) {
    let traces = 0;
    const unsafe = new Set();
    async function walk(dir) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) await walk(file);
            else if (entry.name.endsWith(".nft.json")) {
                traces++;
                const trace = JSON.parse(await readFile(file, "utf8"));
                if (!Array.isArray(trace.files)) throw new Error("Invalid deployment trace.");
                if (trace.additionalRoots || trace.fileHashes || trace.symlinks) throw new Error("Unsupported trace metadata. This deployment check requires the configured Webpack build.");
                const retained = [];
                for (const item of trace.files) {
                    if (typeof item !== "string") throw new Error("Invalid deployment trace path.");
                    const relative = path.relative(root, path.resolve(path.dirname(file), item)).replaceAll("\\", "/");
                    if (/^(?:\.data(?:\/|$)|\.env[^/]*(?:\/|$)|\.git(?:\/|$)|tests\/|docs\/|scripts\/|supabase\/\.temp\/)/i.test(relative)) unsafe.add(relative);
                    else retained.push(item);
                }
                // Runtime uses Supabase + environment secrets. Local data is
                // never a dependency. Apply the same exclusion independently
                // of Next's glob matcher (Windows paths may contain glob chars).
                if (prepare && retained.length !== trace.files.length)
                    await writeFile(file, JSON.stringify({ ...trace, files: retained }));
            }
        }
    }
    await walk(path.resolve(dist));
    if (!traces) throw new Error("No deployment traces were found. Complete the Next.js build first.");
    // Do not print file names from a private data directory.
    if (unsafe.size && !prepare) throw new Error(`Deployment traces contain ${unsafe.size} private or non-runtime file(s). Check outputFileTracingExcludes before deployment.`);
    return { verified: true, traces, privateFilesIncluded: 0, excludedPrivateFiles: prepare ? unsafe.size : 0 };
}

export const verifyDeploymentFiles = (dist, root = process.cwd()) => inspectDeploymentFiles(dist, root, false);
export const prepareDeploymentFiles = (dist, root = process.cwd()) => inspectDeploymentFiles(dist, root, true);

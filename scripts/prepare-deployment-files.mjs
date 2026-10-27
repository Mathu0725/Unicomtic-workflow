import { prepareDeploymentFiles, verifyDeploymentFiles } from "./lib/deployment-files.mjs";
try {
    const dist = process.env.NEXT_DIST_DIR || ".next";
    const prepared = await prepareDeploymentFiles(dist);
    const verified = await verifyDeploymentFiles(dist);
    console.log(JSON.stringify({ ...verified, excludedPrivateFiles: prepared.excludedPrivateFiles }));
} catch (error) {
    console.error(error instanceof Error ? error.message : "Deployment file preparation failed.");
    process.exitCode = 1;
}

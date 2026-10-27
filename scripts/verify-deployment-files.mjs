import { verifyDeploymentFiles } from "./lib/deployment-files.mjs";
try {
    console.log(JSON.stringify(await verifyDeploymentFiles(process.env.NEXT_DIST_DIR || ".next")));
} catch (error) {
    console.error(error instanceof Error ? error.message : "Deployment file verification failed.");
    process.exitCode = 1;
}

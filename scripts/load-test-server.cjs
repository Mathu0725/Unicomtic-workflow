// A file entry point keeps Next's child workers from inheriting a node -e startup command.
if (!process.env.DATA_DIR || !process.env.NEXT_DIST_DIR || !process.env.LOAD_TEST_SERVER_PORT) {
    throw new Error("Start this isolated server through scripts/load-test.mjs");
}
// Use the supported CLI so Next 16 initializes its dev directory/manifests.
process.argv = [process.execPath, require.resolve("next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", process.env.LOAD_TEST_SERVER_PORT];
require("next/dist/bin/next");

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { transaction } = require(path.join(__dirname, "../../src/lib/data/repository.ts"));
const { submitCustomForm } = require(path.join(__dirname, "../../src/lib/admissions/service.ts"));
process.send({ ready: true });
process.once("message", async ({ offset, count }) => {
    const results = await Promise.all(Array.from({ length: count }, (_, i) => transaction(db => {
        const n = offset + i;
        submitCustomForm(db.customForms[0], { fullName: `Concurrent Applicant ${n}`, nic: String(200000000000 + n), email: `concurrent${n}@example.com`, phone: "07" + String(10000000 + n), terms: true }, { workshopId: "limited-workshop" });
        return "accepted";
    }).catch(error => error.status === 409 ? "full" : `error:${error.message}`)));
    process.send({ results });
    process.disconnect();
});

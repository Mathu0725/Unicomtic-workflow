// Only used by the isolated load-test harness with its random test secret.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { candidateLink, candidateSession, CANDIDATE_COOKIE } = require(path.join(__dirname, "../../src/lib/security/candidate-access.ts"));
module.exports = (db, registration) => {
  const student = db.students.find(student => student.id === registration.student_id);
  const token = new URLSearchParams(new URL(candidateLink(registration, student, "apply")).hash.slice(1)).get("token");
  return `${CANDIDATE_COOKIE}=${candidateSession(db, token).cookie}`;
};

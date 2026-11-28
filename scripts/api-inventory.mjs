import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("src/app/api");
const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
async function walk(dir) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.isDirectory()) found.push(...await walk(path.join(dir, item.name)));
    else if (item.name === "route.ts") found.push(path.join(dir, item.name));
  }
  return found;
}
const inventory = [];
for (const file of (await walk(root)).sort()) {
  const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
  const exported = new Set();
  for (const node of source.statements) {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const item of node.exportClause.elements) if (methods.has(item.name.text)) exported.add(item.name.text);
    }
    if (!node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isVariableStatement(node)) for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && methods.has(decl.name.text)) exported.add(decl.name.text);
    }
    if (ts.isFunctionDeclaration(node) && node.name && methods.has(node.name.text)) exported.add(node.name.text);
  }
  const route = "/api/" + path.relative(root, path.dirname(file)).replaceAll("\\", "/");
  inventory.push({ route: route.replace(/\/$/, ""), methods: [...exported].sort(),
    classification: route.startsWith("/api/admin/") ? "staff authorization required" : "manual caller/permission review required",
    source: path.relative(process.cwd(), file).replaceAll("\\", "/"),
  });
}
const output = path.resolve(".data/security/api-inventory.json");
await mkdir(path.dirname(output), { recursive: true });
const report = { generatedAt: new Date().toISOString(), note: "Explicit source exports only; implicit HEAD/OPTIONS and deployment middleware require separate HTTP verification. Classification is not proof of protection.", routes: inventory };
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ routes: inventory.length, explicitMethods: inventory.reduce((sum, row) => sum + row.methods.length, 0), report: output }));

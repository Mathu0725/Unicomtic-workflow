import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
import { transaction, readDatabase } from "../../src/lib/data/repository";
import { SESSION_COOKIE, signSession } from "../../src/lib/security/session";
import { previewToken } from "../../src/lib/omr/commit-validation";
import { POST as saveSettings } from "../../src/app/api/admin/settings/route";
import { POST as commitMarks } from "../../src/app/api/admin/marks-import/commit/route";
import { PATCH as updateApplication } from "../../src/app/api/admin/applications/route";
import { POST as queueExports } from "../../src/app/api/admin/sheets-sync/route";
let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tic-error-recovery-"));
    vi.stubEnv("DATA_DIR", dir); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "true"); vi.stubEnv("APP_SECRET", "test-secret-only-32-characters-or-more");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await transaction(() => {});
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
function req(url: string, body: unknown, method = "POST") {
    return new NextRequest(`http://localhost${url}`, { method, headers: { cookie: `${SESSION_COOKIE}=${signSession({ name: "Test operator", email: "operator@example.com", role: "super_admin" })}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
it("persists settings and rejects stale saves or a policy change without a new version", async () => {
    const current = (await readDatabase()).settings;
    expect((await saveSettings(req("/api/admin/settings", { ...current, termsContent: "A changed policy requiring a new version before activation." }), undefined)).status).toBe(400);
    const saved = await saveSettings(req("/api/admin/settings", { ...current, termsContent: "A changed policy requiring a new version before activation.", termsVersion: "v2" }), undefined);
    expect(saved.status).toBe(200); expect((await readDatabase()).settings.termsVersion).toBe("v2");
    expect((await saveSettings(req("/api/admin/settings", { ...current, institutionName: "Stale edit" }), undefined)).status).toBe(409);
    expect((await readDatabase()).settings.institutionName).toBe(current.institutionName);
    const latest = (await readDatabase()).settings;
    expect((await saveSettings(req("/api/admin/settings", { ...latest, termsVersion: "v1.0" }), undefined)).status).toBe(409);
    expect((await readDatabase()).policyVersions.map(p => p.version)).toContain("v2");
});
it("revalidates a signed marks import and commits all matching rows atomically", async () => {
    const db = await readDatabase(), exam = db.exams[0], attendee = db.attendance.find(a => db.workshops.some(w => w.id === a.workshop_id && w.campaign_id === exam.campaign_id))!;
    expect(attendee).toBeDefined();
    const rows = [{ studentExamId: attendee.student_exam_id, rawScore: 75, isValid: false }];
    const body = { examId: exam.id, fileName: "marks.csv", validRows: rows, previewToken: previewToken(exam, rows) };
    const result = await commitMarks(req("/api/admin/marks-import/commit", body), undefined);
    expect(result.status).toBe(200);
    expect((await readDatabase()).examResults.find(r => r.exam_id === exam.id && r.student_exam_id === attendee.student_exam_id)?.raw_score).toBe(75);
});
it("rejects changed preview data, out-of-range marks and unmatched candidates without partial writes", async () => {
    const db = await readDatabase(), exam = db.exams[0], before = JSON.stringify(db.examResults);
    const rows = [{ studentExamId: "NOT-A-STUDENT", rawScore: 99, isValid: true }];
    const body = { examId: exam.id, fileName: "tampered.csv", validRows: rows, previewToken: previewToken(exam, rows) };
    expect((await commitMarks(req("/api/admin/marks-import/commit", body), undefined)).status).toBe(400);
    body.validRows[0].rawScore = 10000;
    expect((await commitMarks(req("/api/admin/marks-import/commit", body), undefined)).status).toBe(409);
    body.previewToken = previewToken(exam, body.validRows);
    expect((await commitMarks(req("/api/admin/marks-import/commit", body), undefined)).status).toBe(400);
    expect(JSON.stringify((await readDatabase()).examResults)).toBe(before);
});
it("rejects a stale application edit and invalid lifecycle transition", async () => {
    const app = (await readDatabase()).applications[0];
    const response = await updateApplication(req("/api/admin/applications", { id: app.id, status: "invited" }, "PATCH"), undefined);
    expect(response.status).toBe(409);
    expect((await readDatabase()).applications[0].status).toBe(app.status);
});
it("reports malformed storage without replacing or resetting it", async () => {
    const file = path.join(dir, "platform.json");
    await writeFile(file, '{"version":1,"data":');
    await expect(readDatabase()).rejects.toMatchObject({ code: "STORAGE_CORRUPT" });
    expect(await readFile(file, "utf8")).toBe('{"version":1,"data":');
});
it("does not silently reinitialize a previously initialized local database when its snapshot is missing", async () => {
    await unlink(path.join(dir, "platform.json"));
    await expect(readDatabase()).rejects.toMatchObject({ code: "STORAGE_MISSING", retryable: false });
});
it("rejects a structurally incomplete snapshot instead of filling missing real records with defaults", async () => {
    const file = path.join(dir, "platform.json"), snapshot = JSON.parse(await readFile(file, "utf8"));
    delete snapshot.data.applications;
    await writeFile(file, JSON.stringify(snapshot));
    await expect(readDatabase()).rejects.toMatchObject({ code: "STORAGE_CORRUPT" });
    expect(JSON.parse(await readFile(file, "utf8")).data).not.toHaveProperty("applications");
});
it("reports already exported records instead of claiming they were newly queued", async () => {
    await transaction(db => { db.integrations.registration_sheet_id = "admissions"; db.outbox = []; });
    const first = await queueExports(req("/api/admin/sheets-sync", { syncType: "registrations" }), undefined);
    const count = (await readDatabase()).registrations.length;
    expect((await first.json()).pending).toBe(count);
    await transaction(db => { db.outbox.forEach(j => { j.status = "sent"; }); });
    const second = await queueExports(req("/api/admin/sheets-sync", { syncType: "registrations" }), undefined);
    expect(await second.json()).toMatchObject({ pending: 0, exported: count, attention: 0 });
});

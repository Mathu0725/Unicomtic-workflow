import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import { GET as search, PATCH as assign, POST as mark } from "../../src/app/api/admin/attendance/route";
import { knownExamAttendees, validateCommitRows } from "../../src/lib/omr/commit-validation";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-ut-number-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "true");
  vi.stubEnv("APP_SECRET", "test-secret-only-32-characters-or-more");
  await transaction(() => {});
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

function request(url: string, method = "GET", body?: object, role = "entrance_staff") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      cookie: `${SESSION_COOKIE}=${signSession({ name: "Desk", email: "desk@example.com", role })}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

it("assigns one canonical UT number, finds its suffix and uses the full ID for exam matching", async () => {
  const db = await readDatabase();
  const student = db.students[0], workshop = db.workshops[0];
  await transaction((state) => { state.examResults = state.examResults.filter((result) => result.student_id !== student.id); });
  const body = { workshopId: workshop.id, studentId: student.id, utNumber: "ut011000" };
  expect((await assign(request("/api/admin/attendance", "PATCH", body), undefined)).status).toBe(200);
  expect((await assign(request("/api/admin/attendance", "PATCH", body), undefined)).status).toBe(200);
  const saved = await readDatabase();
  expect(saved.students.find((item) => item.id === student.id)?.ut_number).toBe("UT011000");
  expect(saved.auditLogs.filter((item) => item.action === "STUDENT_UT_NUMBER_ASSIGNED" && item.entity_id === student.id)).toHaveLength(1);
  const found = await search(request(`/api/admin/attendance?workshopId=${workshop.id}&query=1000`), undefined);
  expect((await found.json()).candidates.some((item: { studentId: string; utNumber: string }) => item.studentId === student.id && item.utNumber === "UT011000")).toBe(true);
  const short = await search(request(`/api/admin/attendance?workshopId=${workshop.id}&query=000`), undefined);
  expect((await short.json()).candidates.some((item: { studentId: string }) => item.studentId === student.id)).toBe(true);
  const nic = await search(request(`/api/admin/attendance?workshopId=${workshop.id}&query=${student.nic_last_four}`), undefined);
  expect((await nic.json()).candidates.some((item: { studentId: string }) => item.studentId === student.id)).toBe(true);
  const checked = await mark(request("/api/admin/attendance", "POST", { workshopId: workshop.id, studentId: student.id, status: "attended" }), undefined);
  expect((await checked.json()).assignedExamId).toBe("UT011000");
  const current = await readDatabase(), exam = current.exams.find((item) => item.campaign_id === workshop.campaign_id)!;
  expect(knownExamAttendees(current, exam).some((item) => item.student_id === student.id && item.student_exam_id === "UT011000")).toBe(true);
  expect(validateCommitRows(current, exam, [{ studentExamId: "UT011000", rawScore: 60 }])[0].studentId).toBe(student.id);
  expect(() => validateCommitRows(current, exam, [{ studentExamId: "1000", rawScore: 60 }])).toThrow();
});

it("does not reassign an old exam result without reconciliation", async () => {
  const db = await readDatabase(), student = db.students[0];
  const response = await assign(request("/api/admin/attendance", "PATCH", {
    workshopId: db.workshops[0].id, studentId: student.id, utNumber: "UT011000",
  }), undefined);
  expect(response.status).toBe(409);
  expect((await readDatabase()).students.find((item) => item.id === student.id)?.ut_number).toBeUndefined();
});

it("allows only an administrator to reconcile historical mark IDs with an audit trail", async () => {
  const db = await readDatabase(), student = db.students[0], workshopId = db.workshops[0].id;
  const body = { workshopId, studentId: student.id, utNumber: "UT011000", reconcileMarks: true };
  expect((await assign(request("/api/admin/attendance", "PATCH", body), undefined)).status).toBe(403);
  const saved = await assign(request("/api/admin/attendance", "PATCH", body, "admin"), undefined);
  expect(saved.status).toBe(200);
  expect((await saved.json()).reconciledMarks).toBeGreaterThan(0);
  const current = await readDatabase();
  expect(current.examResults.filter((result) => result.student_id === student.id).every((result) => result.student_exam_id === "UT011000")).toBe(true);
  expect(current.auditLogs.some((item) => item.action === "STUDENT_EXAM_IDS_RECONCILED" && item.entity_id === student.id)).toBe(true);
});

it("rejects duplicate, invalid, and changed UT numbers without changing another student", async () => {
  const db = await readDatabase(), workshopId = db.workshops[0].id;
  await transaction((state) => { state.examResults = []; });
  const save = (studentId: string, utNumber: string) => assign(request("/api/admin/attendance", "PATCH", { workshopId, studentId, utNumber }), undefined);
  expect((await save(db.students[0].id, "UT011000")).status).toBe(200);
  expect((await save(db.students[1].id, "UT011000")).status).toBe(409);
  expect((await save(db.students[0].id, "UT011001")).status).toBe(409);
  expect((await save(db.students[1].id, "UT1000")).status).toBe(400);
  expect((await readDatabase()).students.find((item) => item.id === db.students[1].id)?.ut_number).toBeUndefined();
});

it("never assigns the same UT number to two students in concurrent requests", async () => {
  const db = await readDatabase(), workshopId = db.workshops[0].id;
  await transaction((state) => { state.examResults = []; });
  const responses = await Promise.all(db.students.slice(0, 2).map((student) => assign(request("/api/admin/attendance", "PATCH", {
    workshopId, studentId: student.id, utNumber: "UT011000",
  }), undefined)));
  expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
  expect((await readDatabase()).students.filter((student) => student.ut_number === "UT011000")).toHaveLength(1);
});

import type { DatabaseStore } from "../data/store";
import { RequestError } from "../http";
import { randomUUID } from "node:crypto";

export const UT_NUMBER_PATTERN = /^UT\d{6}$/;

export function normalizeUtNumber(input: string) {
  const value = input.trim().toUpperCase();
  if (!UT_NUMBER_PATTERN.test(value))
    throw new RequestError("Enter a UT number like UT011000 (UT and six digits).", 400);
  return value;
}

export function assignUtNumber(db: DatabaseStore, studentId: string, input: string, actor: string) {
  const student = db.students.find((item) => item.id === studentId);
  if (!student) throw new RequestError("Student not found.", 404);
  const utNumber = normalizeUtNumber(input);
  if (db.students.some((item) => item.id !== studentId && item.ut_number?.toUpperCase() === utNumber))
    throw new RequestError("This UT number already belongs to another student.", 409);
  if (student.ut_number && student.ut_number !== utNumber)
    throw new RequestError("This student already has a different UT number. Ask an administrator to review the record.", 409);
  if (student.ut_number === utNumber) return utNumber;
  student.ut_number = utNumber;
  db.auditLogs.push({ id: randomUUID(), user_email: actor, action: "STUDENT_UT_NUMBER_ASSIGNED", entity_name: "students", entity_id: studentId, changes: { utNumber }, created_at: new Date().toISOString() });
  return utNumber;
}

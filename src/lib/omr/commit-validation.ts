import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { DatabaseStore, Exam } from "../data/store";
import { AppError } from "../errors/app-error";
import { appSecret } from "../security/secrets";
import { stableJson } from "../json";
export const marksRowsSchema = z.array(z.object({ studentExamId: z.string().trim().min(1).max(128), rawScore: z.number().finite().nonnegative(), rowNumber: z.number().int().min(1).optional() })).min(1).max(5000);
const config = (exam: Exam) => createHash("sha256").update(stableJson(exam)).digest("hex");
const rowsHash = (rows: { studentExamId: string; rawScore: number | null }[]) => createHash("sha256").update(stableJson(rows.map(r => ({ id: r.studentExamId.trim().toUpperCase(), score: r.rawScore })))).digest("hex");
export function previewToken(exam: Exam, rows: { studentExamId: string; rawScore: number | null }[]) {
    const body = Buffer.from(JSON.stringify({ examId: exam.id, config: config(exam), rows: rowsHash(rows), expires: Date.now() + 15 * 60000 })).toString("base64url");
    return `${body}.${createHmac("sha256", appSecret()).update(body).digest("base64url")}`;
}
export function verifyPreview(token: unknown, exam: Exam, rows: { studentExamId: string; rawScore: number }[]) {
    try {
        if (typeof token !== "string" || token.length > 2000) throw new Error();
        const [body, signature] = token.split(".");
        const expected = createHmac("sha256", appSecret()).update(body).digest(), actual = Buffer.from(signature, "base64url");
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
        const payload = JSON.parse(Buffer.from(body, "base64url").toString());
        if (payload.expires < Date.now() || payload.examId !== exam.id || payload.config !== config(exam) || payload.rows !== rowsHash(rows)) throw new Error();
    } catch { throw new AppError("PREVIEW_STALE", "The preview expired or examination/import data changed. Preview the file again before committing.", 409); }
}
export function knownExamAttendees(db: DatabaseStore, exam: Exam) {
    return db.attendance.filter(a => db.students.some(s => s.id === a.student_id) && db.registrations.some(r => r.student_id === a.student_id && r.campaign_id === exam.campaign_id && r.status !== "cancelled") && db.workshops.some(w => w.id === a.workshop_id && w.campaign_id === exam.campaign_id) && (!exam.workshop_id || a.workshop_id === exam.workshop_id) && (!exam.requires_workshop_attendance || ["attended", "late"].includes(a.status)));
}
export function validateCommitRows(db: DatabaseStore, exam: Exam, input: unknown) {
    const rows = marksRowsSchema.parse(input), known = knownExamAttendees(db, exam), seen = new Set<string>();
    const errors: Record<string, string[]> = {};
    const validated = rows.map((row, idx) => {
        const id = row.studentExamId.trim().toUpperCase(), attendee = known.find(a => a.student_exam_id.trim().toUpperCase() === id);
        const issues: string[] = [];
        if (!attendee) issues.push("Student ID is not eligible for this examination/intake.");
        if (row.rawScore > exam.max_marks) issues.push("Score exceeds the examination maximum.");
        if (seen.has(id)) issues.push("Duplicate student ID in this import.");
        seen.add(id);
        if (issues.length) errors[`rows.${idx}`] = issues;
        return { studentExamId: id, rawScore: row.rawScore, studentId: attendee?.student_id || "" };
    });
    if (Object.keys(errors).length) throw new AppError("IMPORT_INVALID", "Import validation failed. No marks were saved. Correct the rows and preview again.", 400, { fieldErrors: errors });
    return validated;
}

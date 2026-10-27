import { route, RequestError } from "@/lib/http";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { getSession } from "@/lib/security/session";
import { marksRowsSchema, verifyPreview, validateCommitRows } from "@/lib/omr/commit-validation";
import { z } from "zod";
import { randomUUID } from "node:crypto";
export const dynamic = "force-dynamic";
export const POST = route(async req => {
    const body = z.object({ examId: z.string().min(1).max(128), fileName: z.string().max(255), validRows: marksRowsSchema, previewToken: z.string().max(2000) }).parse(await req.json());
    const db = getDb(), exam = db.exams.find(e => e.id === body.examId);
    if (!exam) throw new RequestError("Examination not found.", 404);
    verifyPreview(body.previewToken, exam, body.validRows);
    const rows = validateCommitRows(db, exam, body.validRows);
    let committedCount = 0, updatedCount = 0;
    for (const row of rows) {
        const existing = db.examResults.find(r => r.exam_id === exam.id && r.student_exam_id.toUpperCase() === row.studentExamId);
        const data = { student_id: row.studentId, student_exam_id: row.studentExamId, raw_score: row.rawScore, calculated_score: row.rawScore, is_passed: row.rawScore >= exam.pass_mark, anomalies: row.rawScore >= exam.pass_mark ? [] : ["Below pass threshold"] };
        if (existing) { Object.assign(existing, data); updatedCount++; }
        else { db.examResults.push({ id: randomUUID(), exam_id: exam.id, ...data }); committedCount++; }
    }
    exam.status = "imported";
    db.auditLogs.push({ id: randomUUID(), user_email: getSession(req)!.email, action: "MARKS_IMPORTED_AND_COMMITTED", entity_name: "exam_results", entity_id: exam.id, changes: { committedCount, updatedCount }, created_at: new Date().toISOString() });
    return NextResponse.json({ success: true, committedCount, updatedCount, totalCommitted: rows.length, message: `Saved ${rows.length} examination marks.` });
}, true);

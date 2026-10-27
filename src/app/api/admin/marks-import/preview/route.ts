import { route, RequestError } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { parseFileToRecords, validateMarksRows } from "@/lib/omr/marks-importer";
import { getDb } from "@/lib/data/store";
import { knownExamAttendees, previewToken } from "@/lib/omr/commit-validation";
import { UPLOAD_MAX_BYTES } from "@/lib/upload-limits";

async function handlePOST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const examId = formData.get("examId") as string | null;
    const studentIdCol = (formData.get("studentIdColumn") as string) || "StudentID";
    const scoreCol = (formData.get("scoreColumn") as string) || "Marks";
    const nameCol = (formData.get("nameColumn") as string) || "CandidateName";

    if (!file) {
      return NextResponse.json(
        { success: false, message: "No file provided for marks import." },
        { status: 400 }
      );
    }

    if (typeof file.arrayBuffer !== "function" || !/\.(csv|xlsx|xls)$/i.test(file.name)) throw new RequestError("Upload a CSV or Excel marks file.", 400, { code: "FILE_TYPE_INVALID" });
    if (file.size > UPLOAD_MAX_BYTES) throw new RequestError("Upload a marks file up to 4 MB.", 413);
    const arrayBuffer = await file.arrayBuffer();
    let parsed;
    try { parsed = parseFileToRecords(arrayBuffer, file.name); }
    catch { throw new RequestError("This file could not be read. Export a new CSV or Excel file and try again.", 400, { code: "FILE_INVALID" }); }
    const { headers, records } = parsed;
    if (records.length > 5000) throw new RequestError("Import at most 5,000 marks per file.", 413);

    if (records.length === 0) {
      return NextResponse.json(
        { success: false, message: "Uploaded file contains no data rows." },
        { status: 400 }
      );
    }

    const db = getDb();
    const exam = db.exams.find((e) => e.id === examId);
    if (!exam) throw new RequestError("Select an available examination.", 404);
    const maxMarks = exam ? exam.max_marks : 100;
    const passMark = exam ? exam.pass_mark : 50;

    // Gather known student exam IDs from attendance
    const knownIds = new Set<string>(
      knownExamAttendees(db, exam).map((a) => a.student_exam_id.trim().toUpperCase())
    );

    // If no explicit mapping provided or columns missing, auto-detect probable columns
    let mappedStudentIdCol = studentIdCol;
    let mappedScoreCol = scoreCol;

    if (!headers.includes(mappedStudentIdCol)) {
      const candidate = headers.find((h) =>
        /^(index|id|student|student_id|candidate_id|exam_id)/i.test(h)
      );
      if (candidate) mappedStudentIdCol = candidate;
    }

    if (!headers.includes(mappedScoreCol)) {
      const candidate = headers.find((h) =>
        /^(score|marks|raw_score|mark|result|total)/i.test(h)
      );
      if (candidate) mappedScoreCol = candidate;
    }

    const validationSummary = validateMarksRows(
      records,
      {
        studentIdColumn: mappedStudentIdCol,
        scoreColumn: mappedScoreCol,
        nameColumn: headers.includes(nameCol) ? nameCol : undefined,
      },
      maxMarks,
      0,
      knownIds
    );

    return NextResponse.json({
      success: true,
      commitRows: validationSummary.rows,
      previewToken: previewToken(exam, validationSummary.rows),
      fileName: file.name,
      fileSize: file.size,
      headers,
      detectedMapping: {
        studentIdColumn: mappedStudentIdCol,
        scoreColumn: mappedScoreCol,
        nameColumn: headers.includes(nameCol) ? nameCol : "",
      },
      summary: {
        totalRows: validationSummary.totalRows,
        validRows: validationSummary.validRows,
        invalidRows: validationSummary.invalidRows,
        duplicateRows: validationSummary.duplicateRows,
        outOfRangeRows: validationSummary.outOfRangeRows,
        maxMarksAllowed: maxMarks,
        passMark,
      },
      rowsPreview: validationSummary.rows.slice(0, 100), // Preview up to 100 rows
    });
  } catch (err: any) {
    throw err;
  }
}

export const POST = route(handlePOST, true, { readOnly: true });

import { route, RequestError } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { queueWorkshopBooking } from "@/lib/workshops/sheet-sync";
import { getDb } from "@/lib/data/store";
import { generateStudentExamId, maskNic, maskPhone, maskEmail } from "@/lib/attendance/id-generator";
import { attendanceSchema, requireStudentInCampaign } from "@/lib/validations/admin";
import { getSession } from "@/lib/security/session";
import { assignUtNumber } from "@/lib/attendance/ut-number";
import { z } from "zod";
import { randomUUID } from "node:crypto";

// Search endpoint for entrance desk staff
async function handleGET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workshopId = searchParams.get("workshopId");
  const query = searchParams.get("query")?.trim();

  const db = getDb();

  // If no query, return recent attendance records for workshop
  if (!query) {
    const list = db.attendance
      .filter((a) => !workshopId || a.workshop_id === workshopId)
      .map((att) => {
        const student = db.students.find((s) => s.id === att.student_id);
        const workshop = db.workshops.find((w) => w.id === att.workshop_id);
        return {
          ...att,
          studentName: student?.full_name || "Unknown",
          maskedNic: maskNic(student?.nic),
          maskedPhone: maskPhone(student?.phone),
          district: student?.district || "Unknown",
          utNumber: student?.ut_number || null,
          workshopTitle: workshop?.title || "Workshop",
        };
      });

    return NextResponse.json({ success: true, attendance: list });
  }

  // Fast Entrance Desk Search
  // A short numeric query can match several NIC or UT suffixes. Return every match.
  const cleanQuery = query.toLowerCase();
  const matchedStudents = db.students.filter((s) => {
    if (workshopId) {
      const workshop = db.workshops.find((item) => item.id === workshopId);
      if (!workshop || !db.registrations.some((r) => r.student_id === s.id && r.campaign_id === workshop.campaign_id && r.status !== "cancelled")) return false;
    }
    return (
      s.nic_last_four.toLowerCase() === cleanQuery ||
      s.nic.toLowerCase() === cleanQuery ||
      (Boolean(s.ut_number) && (s.ut_number!.toLowerCase() === cleanQuery ||
        (/^\d{3,4}$/.test(cleanQuery) && s.ut_number!.endsWith(cleanQuery)))) ||
      db.registrations.some((r) => r.student_id === s.id && r.reference_no.toLowerCase() === cleanQuery) ||
      s.phone.replace(/[\s+-]/g, "").includes(cleanQuery) ||
      s.email.toLowerCase().includes(cleanQuery) ||
      s.full_name.toLowerCase().includes(cleanQuery)
    );
  });

  const results = matchedStudents.map((student) => {
    const registration = db.registrations.find((r) => r.student_id === student.id);
    const existingAttendance = workshopId
      ? db.attendance.find((a) => a.student_id === student.id && a.workshop_id === workshopId)
      : db.attendance.find((a) => a.student_id === student.id);

    // Any existing student/exam ID already assigned to this student in any workshop
    const existingIdRecord = db.attendance.find(
      (a) => a.student_id === student.id && Boolean(a.student_exam_id)
    );

    return {
      studentId: student.id,
      fullName: student.full_name,
      nameWithInitials: student.name_with_initials,
      maskedNic: maskNic(student.nic),
      nicLastFour: student.nic_last_four,
      maskedPhone: maskPhone(student.phone),
      maskedEmail: maskEmail(student.email),
      district: student.district,
      registrationRef: registration?.reference_no || "N/A",
      hasAttended: Boolean(existingAttendance),
      attendanceStatus: existingAttendance?.status || "unmarked",
      studentExamId: student.ut_number || existingIdRecord?.student_exam_id || null,
      utNumber: student.ut_number || null,
      existingMarksCount: db.examResults.filter((result) => result.student_id === student.id).length,
      attendanceId: existingAttendance?.id || null,
    };
  });

  return NextResponse.json({
    success: true,
    count: results.length,
    requiresExtraVerification: results.length > 1,
    canReconcileMarks: ["admin", "super_admin"].includes(getSession(req)!.role),
    candidates: results,
  });
}

// Mark attendance & generate/assign unique Student Exam ID
async function handlePOST(req: NextRequest) {
  try {
    const body = attendanceSchema.parse(await req.json());
    const { workshopId, studentId, status, notes } = body;
    const markedBy = getSession(req)!.email;

    if (!workshopId || !studentId) {
      return NextResponse.json(
        { success: false, message: "Workshop ID and Student ID are required." },
        { status: 400 }
      );
    }

    const db = getDb();
    const workshop = db.workshops.find((w) => w.id === workshopId);
    const student = db.students.find((s) => s.id === studentId);

    if (!workshop || !student) {
      return NextResponse.json(
        { success: false, message: "Workshop or Student not found in database." },
        { status: 404 }
      );
    }

    // Check if attendance already recorded for this workshop
    requireStudentInCampaign(studentId, workshop.campaign_id);
    let existingRecord = db.attendance.find(
      (a) => a.workshop_id === workshopId && a.student_id === studentId
    );

    // Reuse existing ID if already assigned to this student in this campaign
    const existingExamIdRecord = db.attendance.find(
      (a) => a.student_id === studentId && Boolean(a.student_exam_id) && db.workshops.some(w => w.id === a.workshop_id && w.campaign_id === workshop.campaign_id)
    );

    let assignedExamId = student.ut_number || existingExamIdRecord?.student_exam_id;

    if (!assignedExamId) {
      // Generate new sequential Student / Exam ID
      const currentYear = new Date().getFullYear();
      const nextSequence = db.attendance.length + 1;
      assignedExamId = generateStudentExamId({
        campaignYear: currentYear,
        sequenceNumber: nextSequence,
        prefix: "TIC",
      });
    }

    if (existingRecord) {
      existingRecord.status = status;
      existingRecord.marked_at = new Date().toISOString();
      existingRecord.marked_by = markedBy;
      if (notes) existingRecord.notes = notes;
      if (student.ut_number) existingRecord.student_exam_id = student.ut_number;
    } else {
      existingRecord = {
        id: `att-${Date.now()}`,
        workshop_id: workshopId,
        student_id: studentId,
        status,
        student_exam_id: assignedExamId,
        marked_by: markedBy,
        marked_at: new Date().toISOString(),
        verification_method: "nic_last4_and_canonical_record",
        notes,
      };
      db.attendance.push(existingRecord);
    }

    for(const booking of db.workshopBookings.filter(item=>item.workshop_id===workshopId&&item.student_id===studentId))queueWorkshopBooking(db,booking.id);
    db.auditLogs.push({
      id: `log-${Date.now()}`,
      user_email: markedBy,
      action: "WORKSHOP_ATTENDANCE_RECORDED",
      entity_name: "attendance",
      entity_id: existingRecord.id,
      changes: {
        workshopId,
        studentId,
        status,
        assignedExamId,
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      attendance: existingRecord,
      assignedExamId,
      studentName: student.full_name,
      message: `Attendance marked as '${status}'. Unique Exam ID: ${assignedExamId}`,
    });
  } catch (err: any) {
    throw err;
  }
}

export const GET = route(handleGET, true);

export const POST = route(handlePOST, true);

export const PATCH = route(async (req) => {
  const input = z.object({ workshopId: z.string().min(1), studentId: z.string().min(1), utNumber: z.string().trim().min(1), reconcileMarks: z.boolean().optional() }).parse(await req.json());
  const db = getDb();
  const workshop = db.workshops.find((item) => item.id === input.workshopId);
  if (!workshop) throw new RequestError("Workshop not found.", 404);
  requireStudentInCampaign(input.studentId, workshop.campaign_id);
  const session = getSession(req)!;
  const utNumber = input.utNumber.trim().toUpperCase();
  const attendance = db.attendance.filter((item) => item.student_id === input.studentId);
  const existingMarks = db.examResults.filter((result) => result.student_id === input.studentId && result.student_exam_id.toUpperCase() !== utNumber);
  if (existingMarks.length && !input.reconcileMarks)
    throw new RequestError("Existing exam marks use a different ID. An administrator can select 'Update existing marks IDs' after verifying this student.", 409);
  if (input.reconcileMarks && !["admin", "super_admin"].includes(session.role))
    throw new RequestError("Only an administrator can reconcile existing exam marks.", 403);
  if (db.attendance.some((record) => record.student_id !== input.studentId && record.student_exam_id.toUpperCase() === utNumber) ||
      db.examResults.some((result) => result.student_id !== input.studentId && result.student_exam_id.toUpperCase() === utNumber))
    throw new RequestError("This UT number conflicts with another student's attendance or marks.", 409);
  if (existingMarks.some((mark) => db.examResults.some((other) => other.id !== mark.id && other.exam_id === mark.exam_id && other.student_exam_id.toUpperCase() === utNumber)))
    throw new RequestError("This exam already has a result under the UT number. Review the duplicate result before reconciling.", 409);
  const savedNumber = assignUtNumber(db, input.studentId, utNumber, session.email);
  if (existingMarks.length) {
    const oldIds = [...new Set(existingMarks.map((result) => result.student_exam_id))];
    for (const result of existingMarks) result.student_exam_id = savedNumber;
    db.auditLogs.push({ id: randomUUID(), user_email: session.email, action: "STUDENT_EXAM_IDS_RECONCILED", entity_name: "students", entity_id: input.studentId, changes: { oldIds, utNumber: savedNumber, resultIds: existingMarks.map((result) => result.id) }, created_at: new Date().toISOString() });
  }
  for (const record of attendance) record.student_exam_id = savedNumber;
  for (const booking of db.workshopBookings.filter((item) => item.student_id === input.studentId)) queueWorkshopBooking(db, booking.id);
  return NextResponse.json({ success: true, utNumber: savedNumber, reconciledMarks: existingMarks.length, message: `${savedNumber} saved for this student${existingMarks.length ? `; ${existingMarks.length} existing mark record(s) reconciled` : ""}.` });
}, true);

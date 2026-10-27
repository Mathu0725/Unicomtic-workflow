import { route, RequestError } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { maskNic, maskPhone } from "@/lib/attendance/id-generator";
import { requireCandidateAccess } from "@/lib/security/candidate-access";
import { emailCandidateResolver } from "@/lib/email/candidates";

async function handleGET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref")?.trim();
  if (searchParams.has("nic")) throw new RequestError("Use your secure email link to view admissions progress.", 403);
  const access = requireCandidateAccess(getDb(), req);
  if (ref && ref.toUpperCase() !== access.registration.reference_no.toUpperCase()) throw new RequestError("This secure session belongs to a different registration.", 403);
  const registration = access.registration, student = access.student, db = getDb();
  const resolveCandidate = emailCandidateResolver(db);

  const application = db.applications.find((a) => a.registration_id === registration.id);
  const attendance = db.attendance.find((att) => att.student_id === student.id && db.workshops.some(w => w.id === att.workshop_id && w.campaign_id === registration.campaign_id));
  const examResult = db.examResults.find((er) => er.student_id === student.id && db.exams.some(e => e.id === er.exam_id && e.campaign_id === registration.campaign_id));
  const interviewCandidate = db.interviewCandidates.find((ic) => ic.student_id === student.id && db.interviews.some(i => i.id === ic.interview_id && i.campaign_id === registration.campaign_id));
  const selectionDecision = db.selectionDecisions.find((sd) => sd.student_id === student.id && sd.campaign_id === registration.campaign_id);
  const campaign = db.campaigns.find((c) => c.id === registration.campaign_id);

  // Compute current stage
  let currentStage = "Stage 1: Registration Completed";
  let stageIndex = 1;

  if (selectionDecision) {
    currentStage = `Stage 6: Final Selection (${selectionDecision.final_status.toUpperCase()})`;
    stageIndex = 6;
  } else if (interviewCandidate) {
    currentStage = `Stage 5: Interview (${interviewCandidate.status.toUpperCase()})`;
    stageIndex = 5;
  } else if (examResult) {
    currentStage = `Stage 4: Examination Evaluated (${examResult.is_passed ? "PASSED" : "REVIEW"})`;
    stageIndex = 4;
  } else if (attendance) {
    currentStage = `Stage 3: Workshop Attended (ID: ${attendance.student_exam_id})`;
    stageIndex = 3;
  } else if (application) {
    currentStage = `Stage 2: Application ${application.status.toUpperCase()}`;
    stageIndex = 2;
  } else if (registration.status === "invited") {
    currentStage = "Stage 2: Invited to Complete Application";
    stageIndex = 2;
  }

  return NextResponse.json({
    success: true,
    data: {
      studentName: student.full_name,
      maskedNic: maskNic(student.nic),
      maskedPhone: maskPhone(student.phone),
      district: student.district,
      referenceNo: registration.reference_no,
      campaignTitle: campaign?.title || "Unicom TIC Intake",
      registeredAt: registration.created_at,
      applicationNo: application?.application_no || null,
      applicationStatus: application?.status || (registration.status === "invited" ? "invited" : "not_started"),
      studentExamId: attendance?.student_exam_id || null,
      workshopAttended: attendance ? attendance.status === "attended" : false,
      examPassed: examResult ? examResult.is_passed : null,
      interviewStatus: interviewCandidate?.status || null,
      finalStatus: selectionDecision?.final_status || "in_evaluation",
      currentStage,
      stageIndex,
      workshops: db.workshopBookings.filter(b => b.registration_id === registration.id && b.status === "confirmed").map(b => { const w = db.workshops.find(w => w.id === b.workshop_id); return w ? { title: w.title, startsAt: w.start_time, venue: w.venue, address: w.address, mapsUrl: w.google_maps_url, bookingStatus: b.status } : null; }).filter(Boolean),
      notifications: db.outbox.filter(j => j.type === "email" && j.payload.to === student.email && resolveCandidate(j)?.registrationId === registration.id).slice(-30).map(j => ({ subject: j.payload.subject, status: j.status, sentAt: j.completed_at || null })),
    },
  });
}

export const GET = route(handleGET, false, { candidate: true });

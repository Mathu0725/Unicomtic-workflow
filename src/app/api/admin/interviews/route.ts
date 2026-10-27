import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { queueEmail } from "@/lib/jobs/outbox";
import { interviewCreateSchema, interviewAssignSchema, requireCampaign, requireStudentInCampaign } from "@/lib/validations/admin";
import { interviewEvaluationSchema } from "@/lib/validations/interview";
import { RequestError } from "@/lib/http";
import { escaped } from "@/lib/admissions/service";

async function handleGET() {
  const db = getDb();
  const interviewsWithCandidates = db.interviews.map((intv) => {
    const candidates = db.interviewCandidates
      .filter((ic) => ic.interview_id === intv.id)
      .map((ic) => {
        const student = db.students.find((s) => s.id === ic.student_id);
        const evalRecord = db.interviewEvaluations.find((e) => e.candidate_id === ic.id);
        return {
          ...ic,
          studentName: student?.full_name || "Unknown",
          email: student?.email || "Unknown",
          phone: student?.phone || "Unknown",
          district: student?.district || "Unknown",
          evaluation: evalRecord || null,
        };
      });

    return {
      ...intv,
      totalCandidates: candidates.length,
      candidates,
    };
  });

  return NextResponse.json({ success: true, interviews: interviewsWithCandidates });
}

async function handlePOST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const db = getDb();

    if (action === "create_session") {
      const { campaignId, title, date, venue, meetingUrl, panelMembers } = interviewCreateSchema.parse(body);
      const campaign = requireCampaign(campaignId);
      const newInterview = {
        id: `int-${Date.now()}`,
        campaign_id: campaign.id,
        title,
        date,
        venue,
        meeting_url: meetingUrl,
        panel_members: panelMembers || ["Admissions Board"],
        status: "scheduled" as const,
      };
      db.interviews.push(newInterview);
      return NextResponse.json({ success: true, interview: newInterview, message: "Interview session created." });
    }

    if (action === "assign_candidates") {
      const { interviewId, studentIds, startTime } = interviewAssignSchema.parse(body);
      const intv = db.interviews.find((i) => i.id === interviewId);
      if (!intv) return NextResponse.json({ success: false, message: "Interview not found" }, { status: 404 });
      if (intv.status === "completed") throw new RequestError("This interview is completed.", 409);
      studentIds.forEach(id => requireStudentInCampaign(id, intv.campaign_id));
      if (studentIds.some((_, idx) => db.interviewCandidates.some(c => c.interview_id === interviewId && !studentIds.includes(c.student_id) && c.status !== "cancelled" && c.time_slot === new Date(Date.parse(startTime || intv.date) + idx * 30 * 60000).toISOString()))) throw new RequestError("An interview time slot is already occupied. Choose a different start time.", 409);

      let assignedCount = 0;
      studentIds.forEach((studentId: string, idx: number) => {
        const existing = db.interviewCandidates.find(
          (ic) => ic.interview_id === interviewId && ic.student_id === studentId
        );
        if (!existing) {
          const candidateId = `ic-${Date.now()}-${idx}`;
          const slot = new Date(new Date(startTime || intv.date).getTime() + idx * 30 * 60000).toISOString();
          db.interviewCandidates.push({
            id: candidateId,
            interview_id: interviewId,
            student_id: studentId,
            time_slot: slot,
            status: "invited",
            invitation_sent_at: new Date().toISOString(),
          });
          assignedCount++;

          const student = db.students.find((s) => s.id === studentId);
          if (student) {
            queueEmail({
              to: student.email,
              toName: student.full_name,
              subject: `Interview Invitation - Unicom TIC Admissions [${intv.title}]`,
              html: `<p>Dear <strong>${escaped(student.full_name)}</strong>,</p>
                     <p>You are invited for the Unicom TIC Admissions Interview.</p>
                     <p><strong>Session:</strong> ${escaped(intv.title)}<br>
                     <strong>Venue:</strong> ${escaped(intv.venue)}<br>
                     <strong>Date & Time:</strong> ${slot}</p>`,
            }, `interview:${candidateId}`);
          }
        }
      });

      return NextResponse.json({ success: true, assignedCount, message: `Assigned ${assignedCount} candidates to interview.` });
    }

    if (action === "submit_evaluation") {
      const { candidateId, interviewerName, communicationScore, technicalScore, analyticalScore, overallScore, recommendation, notes } = interviewEvaluationSchema.parse(body);
      const candidate = db.interviewCandidates.find(c => c.id === candidateId);
      if (!candidate || candidate.status === "cancelled") throw new RequestError("Select an available interview candidate.", 404);

      const evalRecord = {
        id: `eval-${Date.now()}`,
        candidate_id: candidateId,
        interviewer_name: interviewerName,
        communication_score: Number(communicationScore),
        technical_score: Number(technicalScore),
        analytical_score: Number(analyticalScore),
        overall_score: Number(overallScore),
        recommendation,
        notes,
        submitted_at: new Date().toISOString(),
      };

      const existingIndex = db.interviewEvaluations.findIndex((e) => e.candidate_id === candidateId);
      if (body.expectedSubmittedAt !== undefined && (existingIndex >= 0 ? db.interviewEvaluations[existingIndex].submitted_at : null) !== body.expectedSubmittedAt) throw new RequestError("This evaluation changed in another session. Reload before saving.", 409);
      if (existingIndex >= 0) {
        db.interviewEvaluations[existingIndex] = evalRecord;
      } else {
        db.interviewEvaluations.push(evalRecord);
      }

      // Mark candidate attended
      const cand = db.interviewCandidates.find((c) => c.id === candidateId);
      if (cand) cand.status = "attended";

      return NextResponse.json({ success: true, evaluation: evalRecord, message: "Evaluation saved." });
    }

    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    throw err;
  }
}

export const GET = route(handleGET, true);

export const POST = route(handlePOST, true);

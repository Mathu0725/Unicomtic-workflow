import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { evaluateCandidates, CandidateProfile } from "@/lib/eligibility/engine";
import { eligibilitySchema, requireCampaign } from "@/lib/validations/admin";

async function handlePOST(req: NextRequest) {
  try {
    const body = eligibilitySchema.parse(await req.json());
    const {
      campaignId,
      minExamScore = 50,
      requireWorkshopAttendance = true,
      requireApplicationSubmission = true,
      maxShortlistCount,
      tieBreakRule = "higher_al_results",
    } = body;

    const db = getDb();
    const campaign = requireCampaign(campaignId);

    // Build complete student candidate profiles
    const candidateProfiles: CandidateProfile[] = db.students.filter(s => db.registrations.some(r => r.student_id === s.id && r.campaign_id === campaign.id && r.status !== "cancelled")).map((student) => {
      const reg = db.registrations.find((r) => r.student_id === student.id && r.campaign_id === campaign.id);
      const app = db.applications.find((a) => a.student_id === student.id && a.campaign_id === campaign.id);
      const attendance = db.attendance.find((att) => att.student_id === student.id && ["attended", "late"].includes(att.status) && db.workshops.some(w => w.id === att.workshop_id && w.campaign_id === campaign.id));
      const examRes = db.examResults.find((er) => er.student_id === student.id && db.exams.some(e => e.id === er.exam_id && e.campaign_id === campaign.id));

      return {
        studentId: student.id,
        studentName: student.full_name,
        registrationRef: reg?.reference_no || "N/A",
        studentExamId: attendance?.student_exam_id || "N/A",
        district: student.district,
        hasAttendedWorkshop: Boolean(attendance),
        hasSubmittedApplication: app ? ["submitted", "under_review", "approved"].includes(app.status) : false,
        examScore: examRes ? examRes.raw_score : null,
        registrationDate: reg?.created_at || student.created_at,
        alZScore: app?.al_results.z_score ? parseFloat(app.al_results.z_score) : null,
      };
    });

    const report = evaluateCandidates(candidateProfiles, {
      minExamScore: Number(minExamScore),
      requireWorkshopAttendance: Boolean(requireWorkshopAttendance),
      requireApplicationSubmission: Boolean(requireApplicationSubmission),
      maxShortlistCount: maxShortlistCount ? Number(maxShortlistCount) : undefined,
      tieBreakRule,
    });

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      campaigns: db.campaigns.map(item => ({ id: item.id, title: item.title, is_active: item.is_active })),
      campaignTitle: campaign?.title,
      criteriaApplied: {
        minExamScore,
        requireWorkshopAttendance,
        requireApplicationSubmission,
        maxShortlistCount,
        tieBreakRule,
      },
      report,
    });
  } catch (err: any) {
    throw err;
  }
}

export const POST = route(handlePOST, true, { readOnly: true });

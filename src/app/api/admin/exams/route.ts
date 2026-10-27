import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { examSchema } from "@/lib/validations/exam";
import { getDb } from "@/lib/data/store";
import { requireCampaign } from "@/lib/validations/admin";
import { RequestError } from "@/lib/http";
import { getSession } from "@/lib/security/session";

async function handleGET() {
  const db = getDb();
  const examsWithStats = db.exams.map((exam) => {
    const results = db.examResults.filter((r) => r.exam_id === exam.id);
    const passed = results.filter((r) => r.is_passed).length;
    const workshop = db.workshops.find((w) => w.id === exam.workshop_id);
    const campaign = db.campaigns.find((c) => c.id === exam.campaign_id);

    return {
      ...exam,
      campaignTitle: campaign?.title || "Intake",
      workshopTitle: workshop?.title || "All Attendees",
      totalCandidates: results.length,
      passedCandidates: passed,
      failedCandidates: results.length - passed,
      averageScore:
        results.length > 0
          ? Math.round((results.reduce((acc, r) => acc + r.raw_score, 0) / results.length) * 10) / 10
          : 0,
    };
  });

  return NextResponse.json({ success: true, exams: examsWithStats });
}

async function handlePOST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = examSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, errors: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = validated.data;
    const db = getDb();
    requireCampaign(data.campaignId);
    if (data.passMark > data.maxMarks) throw new RequestError("Pass mark cannot exceed maximum marks.");
    if (data.workshopId && !db.workshops.some(w => w.id === data.workshopId && w.campaign_id === data.campaignId)) throw new RequestError("Select a workshop from the examination intake.");
    const id = `exam-${Date.now()}`;

    const newExam = {
      id,
      campaign_id: data.campaignId,
      workshop_id: data.workshopId || undefined,
      name: data.name,
      exam_date: data.examDate,
      max_marks: data.maxMarks,
      pass_mark: data.passMark,
      weightage: data.weightage,
      requires_workshop_attendance: data.requiresWorkshopAttendance,
      status: "scheduled" as const,
    };

    db.exams.push(newExam);

    db.auditLogs.push({
      id: `log-${Date.now()}`,
      user_email: getSession(req)!.email,
      action: "EXAM_CONFIGURED",
      entity_name: "exams",
      entity_id: id,
      changes: { name: data.name, pass_mark: data.passMark, max_marks: data.maxMarks },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      exam: newExam,
      message: "Examination created successfully.",
    });
  } catch (err: any) {
    throw err;
  }
}

export const GET = route(handleGET, true);

export const POST = route(handlePOST, true);

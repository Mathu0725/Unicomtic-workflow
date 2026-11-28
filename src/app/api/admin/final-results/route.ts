import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { queueEmail } from "@/lib/jobs/outbox";
import { admissionEmailVariables, renderNotification } from "@/lib/email/notification-templates";
import { decisionSchema, decisionNotifySchema, requireCampaign, requireStudentInCampaign } from "@/lib/validations/admin";
import { RequestError } from "@/lib/http";
import { getSession } from "@/lib/security/session";
import { randomUUID } from "node:crypto";
import { decisionNotificationKey } from "@/lib/admissions/decision-notifications";
import { workflowOptions } from "@/lib/admissions/staff-workflow";

async function handleGET() {
  const db = getDb();
  const decisions = db.selectionDecisions.map((sd) => {
    const student = db.students.find((s) => s.id === sd.student_id);
    const reg = db.registrations.find((r) => r.student_id === sd.student_id && r.campaign_id === sd.campaign_id);
    const app = db.applications.find((a) => a.student_id === sd.student_id && a.campaign_id === sd.campaign_id);
    const att = db.attendance.find((a) => a.student_id === sd.student_id && db.workshops.some(w => w.id === a.workshop_id && w.campaign_id === sd.campaign_id));
    const examRes = db.examResults.find((er) => er.student_id === sd.student_id && db.exams.some(e => e.id === er.exam_id && e.campaign_id === sd.campaign_id));

    return {
      ...sd,
      studentName: student?.full_name || "Unknown",
      email: student?.email || "Unknown",
      phone: student?.phone || "Unknown",
      district: student?.district || "Unknown",
      studentExamId: student?.ut_number || att?.student_exam_id || "N/A",
      registrationRef: reg?.reference_no,
      campaignTitle: db.campaigns.find(c => c.id === sd.campaign_id)?.title,
      examScore: examRes?.raw_score ?? null,
      courseId: app?.course_id || null,
    };
  });

  return NextResponse.json({ success: true, decisions, ...workflowOptions(db) });
}

async function handlePOST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const db = getDb();

    if (action === "update_decision") {
      const { studentId, finalStatus, rank, compositeScore, notes, expectedStatus, expectedDecisionId, expectedRevision } = decisionSchema.parse(body);
      const campaignId = requireCampaign(body.campaignId).id;
      requireStudentInCampaign(studentId, campaignId);
      const approvedBy = getSession(req)!.email;

      let decision = db.selectionDecisions.find((sd) => sd.student_id === studentId && sd.campaign_id === campaignId);
      if (expectedDecisionId !== undefined && (decision?.id || null) !== expectedDecisionId || expectedRevision !== undefined && (decision?.revision || 0) !== expectedRevision) throw new RequestError("This decision changed. Reload and review before saving.", 409);
      if (expectedStatus && (decision?.final_status || "pending") !== expectedStatus) throw new RequestError("This decision changed. Reload and review before saving.", 409);
      const changed = decision && (decision.final_status !== finalStatus || rank !== undefined && rank !== decision.rank || compositeScore !== undefined && compositeScore !== decision.composite_score || notes !== undefined && notes !== decision.notes);
      if (changed && db.outbox.some(j => j.payload.decisionId === decision!.id && ["sending", "uncertain"].includes(j.status))) throw new RequestError("Resolve the pending notification before changing this decision.", 409);
      if (decision) {
        if (changed) {
          db.outbox.filter(j => j.payload.decisionId === decision!.id && ["queued", "blocked"].includes(j.status)).forEach(j => { j.status = "failed"; j.error_code = "DECISION_SUPERSEDED"; j.error = "The decision changed before this notification was sent."; });
          decision.notification_status = "pending";
          decision.notified_at = undefined;
          decision.revision = (decision.revision || 0) + 1;
        }
        decision.final_status = finalStatus;
        if (rank !== undefined) decision.rank = rank;
        if (compositeScore !== undefined) decision.composite_score = compositeScore;
        if (notes !== undefined) decision.notes = notes;
        decision.approved_by = approvedBy;
        decision.approved_at = new Date().toISOString();
      } else {
        decision = {
          id: `sel-${randomUUID()}`,
          revision: 1,
          campaign_id: campaignId,
          student_id: studentId,
          final_status: finalStatus,
          rank,
          composite_score: compositeScore,
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
          notification_status: "pending",
          notes,
        };
        db.selectionDecisions.push(decision);
      }

      return NextResponse.json({ success: true, decision, message: "Selection decision recorded." });
    }

    if (action === "send_notifications") {
      const { studentIds, statusFilter, campaignId: selectedCampaign } = decisionNotifySchema.parse(body);
      const campaignId = requireCampaign(selectedCampaign).id;
      const targetDecisions = db.selectionDecisions.filter(
        (sd) => sd.campaign_id === campaignId && (!studentIds || studentIds.includes(sd.student_id)) && (!statusFilter || sd.final_status === statusFilter)
      );

      let sentCount = 0;
      for (const dec of targetDecisions) {
        const student = db.students.find((s) => s.id === dec.student_id);
        const att = db.attendance.find((a) => a.student_id === dec.student_id && db.workshops.some(w => w.id === a.workshop_id && w.campaign_id === campaignId));
        if (!student) continue;

        if (["selected", "waiting_list", "unsuccessful"].includes(dec.final_status)) {
          const key = decisionNotificationKey(dec);
          if (db.outbox.some(j => j.key === key)) continue;
          queueEmail({
            to: student.email,
            toName: student.full_name,
            ...renderNotification(db, dec.final_status === "selected" ? "selection_selected" : dec.final_status === "waiting_list" ? "selection_waiting_list" : "selection_unsuccessful", { ...admissionEmailVariables(db, student, db.registrations.find(r => r.student_id === student.id && r.campaign_id === campaignId)), studentId: student.ut_number || att?.student_exam_id || "Confirmed", rank: dec.rank || "N/A" }),
            decisionId: dec.id,
          }, key);

          dec.notification_status = "pending";

          sentCount++;
        }
      }

      return NextResponse.json({
        success: true,
        sentCount,
        message: `Queued ${sentCount} decision notifications.`,
      });
    }

    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    throw err;
  }
}

export const GET = route(handleGET, true);

export const POST = route(handlePOST, true);

import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { queueEmail } from "@/lib/jobs/outbox";
import { decisionSchema, decisionNotifySchema, requireCampaign, requireStudentInCampaign } from "@/lib/validations/admin";
import { RequestError } from "@/lib/http";
import { getSession } from "@/lib/security/session";
import { escaped } from "@/lib/admissions/service";

async function handleGET() {
  const db = getDb();
  const decisions = db.selectionDecisions.map((sd) => {
    const student = db.students.find((s) => s.id === sd.student_id);
    const reg = db.registrations.find((r) => r.student_id === sd.student_id);
    const app = db.applications.find((a) => a.student_id === sd.student_id);
    const att = db.attendance.find((a) => a.student_id === sd.student_id);
    const examRes = db.examResults.find((er) => er.student_id === sd.student_id);

    return {
      ...sd,
      studentName: student?.full_name || "Unknown",
      email: student?.email || "Unknown",
      phone: student?.phone || "Unknown",
      district: student?.district || "Unknown",
      studentExamId: att?.student_exam_id || "N/A",
      examScore: examRes?.raw_score ?? null,
      courseId: app?.course_id || null,
    };
  });

  return NextResponse.json({ success: true, decisions });
}

async function handlePOST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const db = getDb();

    if (action === "update_decision") {
      const { studentId, finalStatus, rank, compositeScore, notes, expectedStatus } = decisionSchema.parse(body);
      const campaignId = requireCampaign(body.campaignId).id;
      requireStudentInCampaign(studentId, campaignId);
      const approvedBy = getSession(req)!.email;

      let decision = db.selectionDecisions.find((sd) => sd.student_id === studentId && sd.campaign_id === campaignId);
      if (expectedStatus && (decision?.final_status || "pending") !== expectedStatus) throw new RequestError("This decision changed. Reload and review before saving.", 409);
      if (decision && decision.final_status !== finalStatus && db.outbox.some(j => j.payload.decisionId === decision!.id && ["sending", "uncertain"].includes(j.status))) throw new RequestError("Resolve the pending notification before changing this decision.", 409);
      if (decision) {
        if (decision.final_status !== finalStatus) {
          db.outbox.filter(j => j.payload.decisionId === decision!.id && ["queued", "blocked"].includes(j.status)).forEach(j => { j.status = "failed"; j.error_code = "DECISION_SUPERSEDED"; j.error = "The decision changed before this notification was sent."; });
          decision.notification_status = "pending";
        }
        decision.final_status = finalStatus;
        if (rank !== undefined) decision.rank = rank;
        if (compositeScore !== undefined) decision.composite_score = compositeScore;
        if (notes !== undefined) decision.notes = notes;
        decision.approved_by = approvedBy;
        decision.approved_at = new Date().toISOString();
      } else {
        decision = {
          id: `sel-${Date.now()}`,
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
        const att = db.attendance.find((a) => a.student_id === dec.student_id);
        if (!student) continue;

        let subject = "";
        let htmlBody = "";

        if (dec.final_status === "selected") {
          subject = `Congratulations! Admission Offer for Unicom TIC Intake`;
          htmlBody = `<p>Dear <strong>${student.full_name}</strong>,</p>
                      <p>Congratulations! You have been <strong>SELECTED</strong> for admission to Unicom TIC.</p>
                      <p>Student ID: <strong>${att?.student_exam_id || "Confirmed"}</strong></p>
                      <p>Please check your portal for enrollment deadlines.</p>`;
        } else if (dec.final_status === "waiting_list") {
          subject = `Application Update: Waiting List Placement - Unicom TIC`;
          htmlBody = `<p>Dear <strong>${student.full_name}</strong>,</p>
                      <p>You have been placed on the <strong>Waiting List</strong> (Rank: ${dec.rank || "N/A"}).</p>
                      <p>We will contact you immediately if an enrollment seat becomes available.</p>`;
        } else if (dec.final_status === "unsuccessful") {
          subject = `Update Regarding Your Application - Unicom TIC`;
          htmlBody = `<p>Dear <strong>${student.full_name}</strong>,</p>
                      <p>Thank you for participating in the selection process. Due to cohort capacity limits, we are unable to offer you admission for this intake.</p>
                      <p>We wish you the very best in your academic journey and welcome you to apply in future intakes.</p>`;
        }

        if (subject) {
          const key = `decision:${dec.id}:${dec.final_status}`;
          if (db.outbox.some(j => j.key === key)) continue;
          queueEmail({
            to: student.email,
            toName: student.full_name,
            subject,
            html: htmlBody.replace(student.full_name, escaped(student.full_name)),
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

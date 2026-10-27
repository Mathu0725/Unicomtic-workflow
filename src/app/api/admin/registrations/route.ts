import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { queueEmail } from "@/lib/jobs/outbox";
import { admissionEmailVariables, renderNotification } from "@/lib/email/notification-templates";
import { idsSchema } from "@/lib/validations/admin";
import { RequestError } from "@/lib/http";
import { getSession } from "@/lib/security/session";

async function handleGET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const district = searchParams.get("district");
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.toLowerCase();

  const db = getDb();
  let items = db.registrations.map((r) => {
    const student = db.students.find((s) => s.id === r.student_id);
    const app = db.applications.find((a) => a.registration_id === r.id);
    return {
      ...r,
      studentName: student?.full_name || "Unknown",
      email: student?.email || "Unknown",
      phone: student?.phone || "Unknown",
      nic: student?.nic || "Unknown",
      district: student?.district || "Unknown",
      province: student?.province || "Unknown",
      hasApplication: Boolean(app),
      applicationNo: app?.application_no || null,
    };
  });

  if (district && district !== "All") {
    items = items.filter((i) => i.district === district);
  }
  if (status && status !== "All") {
    items = items.filter((i) => i.status === status);
  }
  if (search) {
    items = items.filter(
      (i) =>
        i.studentName.toLowerCase().includes(search) ||
        i.email.toLowerCase().includes(search) ||
        i.reference_no.toLowerCase().includes(search) ||
        i.nic.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({
    success: true,
    total: items.length,
    registrations: items,
  });
}

// Bulk invite action (Stage 2 manual mode)
async function handlePOST(req: NextRequest) {
  try {
    const body = await req.json();
    const registrationIds = idsSchema.parse(body.registrationIds);

    if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "Please select at least one student to invite." },
        { status: 400 }
      );
    }

    const db = getDb();
    if (registrationIds.some(id => !db.registrations.some(r => r.id === id))) throw new RequestError("Some registrations no longer exist. Refresh and select again.", 409);
    let invitedCount = 0;

    for (const regId of registrationIds) {
      const reg = db.registrations.find((r) => r.id === regId);
      if (reg && reg.status === "registered") {
        reg.status = "invited";
        invitedCount++;

        const student = db.students.find((s) => s.id === reg.student_id);
        if (student) {
          const appUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/apply?ref=${reg.reference_no}`;
          queueEmail({
            to: student.email,
            toName: student.full_name,
            ...renderNotification(db, "application_invitation", admissionEmailVariables(db, student, reg), appUrl),
          });
        }
      }
    }

    db.auditLogs.push({
      id: `log-${Date.now()}`,
      user_email: getSession(req)!.email,
      action: "MANUAL_APPLICATION_INVITATIONS_SENT",
      entity_name: "registrations",
      entity_id: "bulk",
      changes: { invitedCount, totalSelected: registrationIds.length },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      invitedCount,
      message: `Successfully invited ${invitedCount} candidate(s) to complete their application.`,
    });
  } catch (err: any) {
    throw err;
  }
}

export const GET = route(handleGET, true);

export const POST = route(handlePOST, true);

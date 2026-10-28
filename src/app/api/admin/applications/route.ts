import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { applicationPatchSchema } from "@/lib/validations/admin";
import { RequestError } from "@/lib/http";
import { getSession } from "@/lib/security/session";
import { canChangeApplicationStatus } from "@/lib/admissions/application-review";

async function handleGET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const courseId = searchParams.get("courseId");
  const search = searchParams.get("search")?.toLowerCase();

  const db = getDb();
  let items = db.applications.map((app) => {
    const student = db.students.find((s) => s.id === app.student_id);
    const reg = db.registrations.find((r) => r.id === app.registration_id);
    const course = db.courses.find((c) => c.id === app.course_id);

    return {
      ...app,
      studentName: student?.full_name || "Unknown",
      email: student?.email || "Unknown",
      phone: student?.phone || "Unknown",
      nic: student?.nic || "Unknown",
      district: student?.district || "Unknown",
      registrationRef: reg?.reference_no || "Unknown",
      courseName: course?.name || "Unassigned",
    };
  });

  if (status && status !== "All") {
    items = items.filter((i) => i.status === status);
  }
  if (courseId && courseId !== "All") {
    items = items.filter((i) => i.course_id === courseId);
  }
  if (search) {
    items = items.filter(
      (i) =>
        i.studentName.toLowerCase().includes(search) ||
        i.application_no.toLowerCase().includes(search) ||
        i.registrationRef.toLowerCase().includes(search) ||
        i.email.toLowerCase().includes(search),
    );
  }

  return NextResponse.json({
    success: true,
    total: items.length,
    applications: items,
  });
}

async function handlePATCH(req: NextRequest) {
  try {
    const body = applicationPatchSchema.parse(await req.json());
    const { id, status, review_notes } = body;
    const db = getDb();

    const application = db.applications.find((a) => a.id === id);
    if (!application) {
      return NextResponse.json(
        { success: false, message: "Application not found" },
        { status: 404 },
      );
    }

    if (body.expectedStatus && body.expectedStatus !== application.status)
      throw new RequestError(
        "This application changed. Reload before saving.",
        409,
      );
    if (
      status &&
      status !== application.status &&
      !canChangeApplicationStatus(application.status, status)
    )
      throw new RequestError(
        "This application status change is not allowed.",
        409,
        { code: "INVALID_TRANSITION" },
      );
    if (status) application.status = status;
    if (review_notes !== undefined) application.review_notes = review_notes;

    db.auditLogs.push({
      id: `log-${Date.now()}`,
      user_email: getSession(req)!.email,
      action: "APPLICATION_STATUS_UPDATED",
      entity_name: "applications",
      entity_id: id,
      changes: { status, review_notes },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      application,
      message: "Application updated successfully.",
    });
  } catch (err: any) {
    throw err;
  }
}

export const GET = route(handleGET, true);

export const PATCH = route(handlePATCH, true);

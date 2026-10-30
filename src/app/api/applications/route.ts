import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { applicationSchema } from "@/lib/validations/application";
import { getDb } from "@/lib/data/store";
import { legacyWorkshopConfig } from "@/lib/workshops/legacy";
import { applicationFor, bookWorkshop, notifySubmission } from "@/lib/admissions/service";
import { requireCandidateAccess } from "@/lib/security/candidate-access";
export const POST = route(async (req) => {
    const body = await req.json(), parsed = applicationSchema.safeParse(body);
    if (!parsed.success)
        throw new RequestError("Please correct the required fields.", 400, { errors: parsed.error.flatten().fieldErrors });
    const db = getDb(), data = parsed.data;
    const access = requireCandidateAccess(db, req);
    if (data.registrationRef.trim().toUpperCase() !== access.registration.reference_no.toUpperCase()) throw new RequestError("This secure session belongs to a different registration.", 403);
    const reg = db.registrations.find(r => r.reference_no.toUpperCase() === data.registrationRef.trim().toUpperCase());
    if (!reg)
        throw new RequestError("Registration reference not found.", 404);
    if (!["invited", "applied"].includes(reg.status)) throw new RequestError("An application invitation is required. Contact admissions.", 403);
    const student = db.students.find(s => s.id === reg.student_id)!;
    const app = applicationFor(student, reg, data);
    bookWorkshop(body.workshopId, student, reg, legacyWorkshopConfig(db, reg.campaign_id, "application"));
    notifySubmission(student, reg, app);
    return NextResponse.json({ success: true, referenceNo: reg.reference_no, applicationNo: app.application_no, studentName: student.full_name, notificationStatus: "queued", message: "Application saved. Your notification is queued." });
}, false, { submission: true, candidate: true });

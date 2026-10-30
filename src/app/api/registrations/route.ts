import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { registrationSchema } from "@/lib/validations/registration";
import { getDb } from "@/lib/data/store";
import { legacyWorkshopConfig } from "@/lib/workshops/legacy";
import { canonicalStudent, registrationFor, bookWorkshop, notifySubmission, normalizeEmail, normalizeNic, normalizePhone } from "@/lib/admissions/service";
export const POST = route(async (req) => {
    const body = await req.json();
    const parsed = registrationSchema.safeParse({ ...body, email: normalizeEmail(body.email), nic: normalizeNic(body.nic), phone: normalizePhone(body.phone), whatsapp: normalizePhone(body.whatsapp) });
    if (!parsed.success)
        throw new RequestError("Please correct the required fields.", 400, { errors: parsed.error.flatten().fieldErrors });
    if (parsed.data.termsVersion !== getDb().settings.termsVersion) throw new RequestError("The Terms & Conditions changed. Refresh the policy and accept the current version before submitting.", 409, { code: "POLICY_CHANGED" });
    const data = parsed.data, student = canonicalStudent(data), reg = registrationFor(student, data.campaignId);
    reg.terms_version = data.termsVersion;
    bookWorkshop(body.workshopId, student, reg, legacyWorkshopConfig(getDb(), reg.campaign_id, "registration"));
    notifySubmission(student, reg);
    return NextResponse.json({ success: true, referenceNo: reg.reference_no, studentName: student.full_name, district: student.district, autoInvited: reg.status === "invited", notificationStatus: "queued", message: "Registration saved. Your notification is queued." });
}, false, { submission: true });

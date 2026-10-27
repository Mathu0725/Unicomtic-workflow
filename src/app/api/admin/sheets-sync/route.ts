import { NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { route, RequestError } from "@/lib/http";
import { queueSheet } from "@/lib/jobs/outbox";
export const dynamic = "force-dynamic";
export const GET = route(async () => {
    const db = getDb();
    return NextResponse.json({ success: true, syncJobs: db.outbox.filter(j => j.type === "sheet").reverse().map(j => ({ ...j, sync_type: j.payload.sheetName, total_synced: j.status === "sent" ? j.payload.rows.length : 0, triggered_by: "portal", error_message: j.error })), isServiceAccountConfigured: Boolean(db.integrations.google), registrationSheetId: db.integrations.registration_sheet_id, applicationSheetId: db.integrations.application_sheet_id });
}, true);
export const POST = route(async (req) => {
    const { syncType } = await req.json(), db = getDb(), applications = syncType === "applications";
    if (!["registrations", "applications"].includes(syncType)) throw new RequestError("Choose registrations or applications to export.");
    const id = applications ? db.integrations.application_sheet_id : db.integrations.registration_sheet_id;
    if (!id)
        throw new RequestError("Configure the admissions spreadsheet in Google Integrations first.");
    const items = applications ? db.applications : db.registrations;
    const counts = { pending: 0, exported: 0, attention: 0 };
    for (const item of items) {
        const student = db.students.find(s => s.id === item.student_id)!;
        const job = queueSheet(db, id, applications ? "Applications" : "Registrations", { referenceNo: "application_no" in item ? item.application_no : item.reference_no, fullName: student.full_name, email: student.email, phone: student.phone, district: student.district, status: item.status, createdAt: item.created_at });
        if (job.status === "sent") counts.exported++; else if (["queued", "sending"].includes(job.status)) counts.pending++; else counts.attention++;
    }
    return NextResponse.json({ success: true, ...counts, message: `${counts.pending} pending exports, ${counts.exported} previously exported, ${counts.attention} needing repair. See Email Center for provider status.` });
}, true);

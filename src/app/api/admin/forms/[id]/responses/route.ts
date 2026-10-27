import { NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { route, RequestError } from "@/lib/http";
import { queueSheet } from "@/lib/jobs/outbox";
import { formSheetTarget } from "@/lib/google/sheet-target";
import { spreadsheetId } from "@/lib/google/sheets-service";
import { submissionSheetRow } from "@/lib/admissions/service";
export const dynamic = "force-dynamic";
export const GET = route(async (req, { params }: {
    params: {
        id: string;
    };
}) => {
    const db = getDb(), form = db.customForms.find(f => f.id === params.id || f.slug === params.id);
    if (!form)
        throw new RequestError("Form not found.", 404);
    const target = formSheetTarget(db.integrations, form);
    const submissions = db.formSubmissions.filter(s => s.form_id === form.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(sub => {
        const exports = target ? db.outbox.filter(job => {
            if (job.type !== "sheet" || job.status !== "sent" || job.payload.sheetName !== target.sheet_name || !(job.payload.sourceId === sub.id || job.payload.rows?.some((row: any) => row.referenceNo === sub.reference_no))) return false;
            try { return spreadsheetId(job.payload.sheetId) === spreadsheetId(target.sheet_id); }
            catch { return false; }
        }) : [];
        const latest = exports.reduce<typeof exports[number] | undefined>((previous, job) => !previous || Date.parse(job.completed_at || job.created_at) >= Date.parse(previous.completed_at || previous.created_at) ? job : previous, undefined);
        const currentEmail = db.students.find(student => student.id === sub.student_id)?.email;
        return { ...sub, synced_to_sheet: Boolean(latest && (!currentEmail || latest.payload.rows?.some((row: any) => row.referenceNo === sub.reference_no && String(row.email || "").toLowerCase() === currentEmail.toLowerCase()))) };
    });
    return NextResponse.json({ success: true, formTitle: form.title, fields: form.fields, googleSheetsConfig: target, googleFormConfig: form.google_form_config, total: submissions.length, submissions });
}, true);
export const POST = route(async (req, { params }: {
    params: {
        id: string;
    };
}) => {
    const db = getDb(), form = db.customForms.find(f => f.id === params.id || f.slug === params.id);
    if (!form)
        throw new RequestError("Form not found.", 404);
    const config = formSheetTarget(db.integrations, form);
    if (!config)
        throw new RequestError("Configure the admissions spreadsheet in Google Integrations, or select a separate sheet in this form's Builder.");
    const submissions = db.formSubmissions.filter(s => s.form_id === form.id);
    const counts = { pending: 0, exported: 0, attention: 0 };
    for (const sub of submissions) {
        const student = db.students.find(s => s.id === sub.student_id);
        const reg = db.registrations.find(r => r.id === sub.registration_id);
        const app = db.applications.find(a => a.id === sub.application_id);
        const row = student && reg ? submissionSheetRow(student, reg, app, sub) : { ...sub.data, referenceNo: sub.reference_no, createdAt: sub.created_at };
        const job = queueSheet(db, config.sheet_id, config.sheet_name, row, sub.id);
        if (job.status === "sent") counts.exported++; else if (["queued", "sending"].includes(job.status)) counts.pending++; else counts.attention++;
    }
    return NextResponse.json({ success: true, queuedCount: counts.pending, ...counts, message: `${counts.pending} pending exports, ${counts.exported} previously exported, ${counts.attention} needing repair. See Email Center for provider status.` });
}, true);

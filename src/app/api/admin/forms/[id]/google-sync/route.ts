import { NextResponse } from "next/server";
import { databaseContext } from "@/lib/data/store";
import { route, RequestError } from "@/lib/http";
import { readDatabase, transaction } from "@/lib/data/repository";
import { googleSheetsService, spreadsheetId } from "@/lib/google/sheets-service";
import { submitCustomForm } from "@/lib/admissions/service";
import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors/app-error";
export const dynamic = "force-dynamic";
export const POST = route(async (_req, { params }: { params: { id: string } }) => {
    const snapshot = await readDatabase(), source = snapshot.customForms.find(f => f.id === params.id || f.slug === params.id);
    if (!source?.is_active || !source.google_form_config?.enabled || !source.google_form_config.response_sheet_url) throw new RequestError("Save the Google Form response spreadsheet URL and tab in Builder first.");
    const rows = await databaseContext.run(snapshot, () => googleSheetsService.readRows(spreadsheetId(source.google_form_config!.response_sheet_url!), source.google_form_config!.response_sheet_name || "Form Responses 1"));
    if (rows.length > 500) throw new RequestError("This response sheet has more than 500 rows. Import a separate tab containing at most 500 rows per operation.", 413);
    return transaction(db => {
        const form = db.customForms.find(f => f.id === source.id);
        if (!form?.is_active || form.updated_at !== source.updated_at) throw new RequestError("The form changed during import. Reload and review its settings before retrying.", 409);
        let ingestedCount = 0, duplicateCount = 0;
        const errors: { row: number; message: string }[] = [];
        for (const [index, row] of rows.entries()) {
            const data = Object.fromEntries(form.fields.map(f => [f.id, f.type === "terms" ? /true|yes|agree/i.test(row[f.id] || row[f.label] || "") : row[f.id] ?? row[f.label]]));
            const id = `sheet:${createHash("sha256").update(JSON.stringify(row)).digest("hex")}`, before = structuredClone(db);
            try {
                const result = submitCustomForm(db.customForms.find(f => f.id === form.id)!, data, { externalId: id, workshopId: row.workshopId });
                if (result.duplicate) duplicateCount++; else ingestedCount++;
            } catch (e) {
                Object.assign(db, before);
                if (e instanceof AppError && e.status === 409 && e.details.isDuplicate) duplicateCount++;
                else errors.push({ row: index + 2, message: e instanceof AppError ? e.message : "This row could not be imported. Check its fields or contact admissions." });
            }
        }
        const saved = db.customForms.find(f => f.id === form.id)!;
        saved.google_form_config!.last_synced_at = new Date().toISOString();
        saved.google_form_config!.synced_count = db.formSubmissions.filter(s => s.form_id === form.id && s.external_id).length;
        return NextResponse.json({ success: true, ingestedCount, duplicateCount, errors, totalSubmissions: saved.submissions_count, lastSyncedAt: saved.google_form_config!.last_synced_at, message: `Imported ${ingestedCount}, skipped ${duplicateCount} duplicates; ${errors.length} rows need correction.` });
    }, { maxConflictRetries: 8 });
}, true, { database: false });

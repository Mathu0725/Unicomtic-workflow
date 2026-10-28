import type { DatabaseStore } from "../data/store";
import type { OutboxJob } from "../data/types";
import { formSheetTarget } from "./sheet-target";
import { workshopSheetTarget, sheetTabKey } from "../workshops/sheet-config";
const id = (value: unknown) => typeof value === "string" ? value.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || value.trim() : "";
/** Unbound legacy exports retain their explicit destination; known portal exports follow their configured binding. */
export function sheetTargetChanged(db: DatabaseStore, job: OutboxJob) {
    if (job.type !== "sheet") return false;
    if (job.payload.workshopId) {
        const target=workshopSheetTarget(db.workshops.find(workshop=>workshop.id===job.payload.workshopId));
        return !target||id(job.payload.sheetId)!==id(target.sheet_id)||sheetTabKey(job.payload.sheetName||"")!==sheetTabKey(target.sheet_name)||job.payload.workshopSheetVersion!==target.version;
    }
    const submission = db.formSubmissions.find(s => s.id === job.payload.sourceId);
    const form = submission ? db.customForms.find(f => f.id === submission.form_id) : undefined;
    const kind = job.payload.sheetName === "Applications" ? "applications" : job.payload.sheetName === "Registrations" ? "registrations" : undefined;
    if (!form && !kind) return false;
    const target = formSheetTarget(db.integrations, form, kind);
    return !target || id(job.payload.sheetId) !== id(target.sheet_id) || job.payload.sheetName !== target.sheet_name;
}

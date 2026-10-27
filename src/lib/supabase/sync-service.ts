import { getDb, CustomForm, FormSubmission } from "../data/store";
import { readDatabase, storageMode } from "../data/repository";
import { canonicalStudent, registrationFor } from "../admissions/service";
export interface SupabaseSyncResult {
    success: boolean;
    table: string;
    action: "insert" | "update" | "upsert" | "skipped";
    id?: string;
    error?: string;
}
// Compatibility facade. The repository commits forms, students and outbox atomically
// in platform_state. Never write a second, divergent copy into the old SQL tables.
class SupabaseSyncService {
    async checkConnection() {
        try {
            await readDatabase();
            return { connected: true, url: process.env.NEXT_PUBLIC_SUPABASE_URL || "local persistent disk", mode: storageMode() === "supabase" ? "live" : "local_persistent", message: "Durable admissions repository available." };
        }
        catch (err: any) {
            return { connected: false, mode: storageMode(), url: "", message: "Admissions storage is unavailable. Review server health and configuration." };
        }
    }
    async syncForm(form: CustomForm): Promise<SupabaseSyncResult> {
        getDb().auditLogs.push({ id: crypto.randomUUID(), user_email: "repository", action: "SUPABASE_FORM_SYNCED", entity_name: "custom_forms", entity_id: form.id, changes: { slug: form.slug }, created_at: new Date().toISOString() });
        return { success: true, table: "custom_forms", action: "upsert", id: form.id };
    }
    async syncSubmission(sub: FormSubmission, form: CustomForm) {
        const db = getDb();
        const student = canonicalStudent(sub.data), reg = registrationFor(student, form.campaign_id, true);
        if (!db.registrations.some(r => r.reference_no === sub.reference_no))
            reg.reference_no = sub.reference_no;
        return { submissionSync: { success: true, table: "form_submissions", action: "insert", id: sub.id }, studentSync: { success: true, table: "students", action: "upsert", id: student.id }, registrationSync: { success: true, table: "registrations", action: "insert", id: reg.id } };
    }
}
export const supabaseSyncService = new SupabaseSyncService();

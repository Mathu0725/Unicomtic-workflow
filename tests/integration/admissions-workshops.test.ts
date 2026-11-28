import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { transaction, readDatabase, initialDatabase } from "../../src/lib/data/repository";
import { databaseContext, CustomForm } from "../../src/lib/data/store";
import { submitCustomForm, canonicalStudent, registrationFor, submissionSheetRow } from "../../src/lib/admissions/service";
import { queueSheet } from "../../src/lib/jobs/outbox";
import { getSession, signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import { NextRequest } from "next/server";
import { encrypt, decrypt } from "../../src/lib/security/secrets";
let dir: string;
const person = (n = 1) => ({ fullName: `Test Student ${n}`, nameWithInitials: `T. Student ${n}`, email: `student${n}@example.com`, phone: `07712345${String(n).padStart(2, "0")}`, nic: `2000123456${String(n).padStart(2, "0")}`, terms: true });
function form(db: ReturnType<typeof initialDatabase>, type: CustomForm["type"] = "registration") {
    const f = db.customForms[type === "application" ? 1 : 0];
    f.fields = [{ id: "fullName", type: "text", label: "Name", required: true }, { id: "nic", type: "nic", label: "NIC", required: true }, { id: "email", type: "email", label: "Email", required: true }, { id: "phone", type: "phone", label: "Phone", required: true }, { id: "terms", type: "terms", label: "Consent", required: true }];
    return f;
}
beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tic-admissions-test-"));
    vi.stubEnv("DATA_DIR", dir);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
    vi.stubEnv("SEED_DEMO_DATA", "false");
    vi.stubEnv("APP_SECRET", "test-secret-with-at-least-32-characters");
});
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
describe("Durable admissions, duplicate protection and workshop capacity", () => {
    it("queues inherited admissions-sheet exports and reuses the same job for manual replay", async () => {
        await transaction(db => {
            db.integrations.registration_sheet_id = "current-admissions-sheet";
            const f = form(db);
            f.google_sheets_config = { enabled: false, sheet_id: "old-form-sheet", sheet_name: "Old tab", auto_sync: false };
            const { submission } = submitCustomForm(f, person());
            const job = db.outbox.find(j => j.type === "sheet")!;
            expect(job.payload).toMatchObject({ sheetId: "current-admissions-sheet", sheetName: "Registrations", sourceId: submission.id });
            const student = db.students.find(s => s.id === submission.student_id)!;
            const reg = db.registrations.find(r => r.id === submission.registration_id)!;
            queueSheet(db, "current-admissions-sheet", "Registrations", submissionSheetRow(student, reg, undefined, submission), submission.id);
            expect(db.outbox.filter(j => j.type === "sheet")).toHaveLength(1);
            expect(job.payload.rows[0]).toMatchObject({ referenceNo: `SUB-${submission.id}`, responseReference: submission.reference_no, nic: student.nic, status: reg.status });
        });
    });
    it("persists accepted submissions and notification jobs across repository reads", async () => {
        const accepted = await transaction(db => submitCustomForm(form(db), person()));
        const db = await readDatabase();
        expect(db.students).toHaveLength(1);
        expect(db.registrations).toHaveLength(1);
        expect(db.formSubmissions[0].reference_no).toBe(accepted.submission.reference_no);
        expect(db.outbox[0].status).toBe("queued");
        expect(db.formSubmissions[0].email_sent).toBe(false);
    });
    it("allows only one registration when concurrent requests submit the same identity", async () => {
        const responses = await Promise.allSettled(Array.from({ length: 12 }, () => transaction(db => submitCustomForm(form(db), person()))));
        expect(responses.filter(r => r.status === "fulfilled")).toHaveLength(1);
        const db = await readDatabase();
        expect(db.registrations).toHaveLength(1);
        expect(db.students).toHaveLength(1);
        expect(db.formSubmissions).toHaveLength(1);
        expect(db.outbox).toHaveLength(1);
    });
    it("normalizes email case, NIC spacing and international phone before duplicate checks", async () => {
        await transaction(db => submitCustomForm(form(db), person()));
        await expect(transaction(db => submitCustomForm(form(db), { ...person(), email: " STUDENT1@EXAMPLE.COM ", nic: "2000 12345601", phone: "+94 77 123 4501" }))).rejects.toMatchObject({ status: 409 });
        expect((await readDatabase()).students).toHaveLength(1);
    });
    it("creates an application for an existing registration without duplicating the student", async () => {
        await transaction(db => submitCustomForm(form(db), person()));
        const application = await transaction(db => submitCustomForm(form(db, "application"), person()));
        expect(application.submission.reference_no).toMatch(/^APP-/);
        const db = await readDatabase();
        expect(db.students).toHaveLength(1);
        expect(db.registrations).toHaveLength(1);
        expect(db.applications).toHaveLength(1);
        expect(db.registrations[0].status).toBe("applied");
        await expect(transaction(db => submitCustomForm(form(db, "application"), person()))).rejects.toMatchObject({ status: 409 });
        expect((await readDatabase()).applications).toHaveLength(1);
    });
    it("does not merge two conflicting identities that share an email or NIC", async () => {
        await transaction(() => registrationFor(canonicalStudent(person()), "camp-2025"));
        await expect(transaction(() => canonicalStudent({ ...person(2), nic: person().nic }))).rejects.toMatchObject({ status: 409 });
        expect((await readDatabase()).students).toHaveLength(1);
    });
    it("accepts a retried webhook response id exactly once", async () => {
        const first = await transaction(db => submitCustomForm(form(db), person(), { externalId: "google-response-123" }));
        const retry = await transaction(db => submitCustomForm(form(db), person(), { externalId: "google-response-123" }));
        expect(retry.duplicate).toBe(true);
        expect(retry.submission.id).toBe(first.submission.id);
        expect((await readDatabase()).outbox).toHaveLength(1);
    });
    it("cannot overbook the last seat and rolls back a rejected student's records", async () => {
        await transaction(db => {
            const f = form(db);
            f.workshop_config = { enabled: true, required: true, workshop_ids: [] };
            db.workshops.push({ id: "future-workshop", campaign_id: "camp-2025", title: "Orientation", description: "", venue: "Campus", address: "Campus Road", google_maps_url: "", start_time: new Date(Date.now() + 86400000 * 5).toISOString(), end_time: new Date(Date.now() + 86400000 * 5 + 3600000).toISOString(), reminder_schedule: { days_before: [3, 1] }, capacity: 1, is_active: true, created_at: new Date().toISOString() });
        });
        const results = await Promise.allSettled([1, 2].map(n => transaction(db => submitCustomForm(db.customForms[0], person(n), { workshopId: "future-workshop" }))));
        expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
        const db = await readDatabase();
        expect(db.workshopBookings).toHaveLength(1);
        expect(db.students).toHaveLength(1);
        expect(db.registrations).toHaveLength(1);
        expect(db.outbox).toHaveLength(2); // Booking and submission confirmations.
    });
    it("rejects missing required workshop, closed workshops and unaccepted terms", async () => {
        const db = initialDatabase(), f = form(db);
        f.workshop_config = { enabled: true, required: true, workshop_ids: [] };
        await expect(databaseContext.run(db, async () => submitCustomForm(f, person()))).rejects.toMatchObject({ message: "Please select a workshop." });
        await expect(transaction(state => submitCustomForm(form(state), { ...person(), terms: "yes" }))).rejects.toMatchObject({ status: 400 });
        await expect(transaction(state => { const f = form(state); f.workshop_config = { enabled: true, required: true, workshop_ids: [] }; return submitCustomForm(f, person(), { workshopId: "closed-or-other-intake" }); })).rejects.toMatchObject({ message: "This workshop is closed or unavailable." });
    });
    it("ignores extra payload fields that could overwrite a Google Sheet reference", async () => {
        const accepted = await transaction(db => { db.integrations.registration_sheet_id = "sheet123"; return submitCustomForm(form(db), { ...person(), referenceNo: "VICTIM-REF", status: "selected" }); });
        const db = await readDatabase(), sheet = db.outbox.find(j => j.type === "sheet")!;
        expect(sheet.payload.rows[0].referenceNo).toBe(`SUB-${accepted.submission.id}`);
        expect(db.formSubmissions[0].data.referenceNo).toBeUndefined();
        expect(sheet.payload.rows[0].status).not.toBe("selected");
    });
    it("maps newly designed identity questions before deduplicating students", async () => {
        await transaction(db => { const f = form(db); f.fields[0] = { ...f.fields[0], id: "custom_name", systemKey: "fullName" }; return submitCustomForm(f, { ...person(), fullName: undefined, custom_name: "Mapped Student" }); });
        expect((await readDatabase()).students[0].full_name).toBe("Mapped Student");
    });
});
describe("Session and credential protection", () => {
    it("rejects forged staff cookies and accepts only signed, unexpired sessions", () => {
        const user = { email: "owner@gmail.com", name: "Owner", role: "super_admin" };
        expect(getSession(new NextRequest("http://localhost/admin", { headers: { cookie: `${SESSION_COOKIE}=${JSON.stringify(user)}` } }))).toBeNull();
        const token = signSession(user);
        expect(getSession(new NextRequest("http://localhost/admin", { headers: { cookie: `${SESSION_COOKIE}=${token}` } }))?.email).toBe(user.email);
        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + 8 * 86400000);
        expect(getSession(new NextRequest("http://localhost/admin", { headers: { cookie: `${SESSION_COOKIE}=${token}` } }))).toBeNull();
    });
    it("encrypts stored tokens with authenticated encryption", () => {
        const value = encrypt("secret-refresh-token");
        expect(value).not.toContain("secret-refresh-token");
        expect(decrypt(value)).toBe("secret-refresh-token");
        expect(() => decrypt(value.slice(0, -4) + "AAAA")).toThrow();
    });
});

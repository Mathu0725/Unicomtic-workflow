import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb, databaseContext } from "@/lib/data/store";
import { googleConfig, googleRequest } from "@/lib/google/oauth";
import { googleSheetsService, spreadsheetId } from "@/lib/google/sheets-service";
import { encrypt } from "@/lib/security/secrets";
import { storageMode, readDatabase, transaction } from "@/lib/data/repository";
import { AppError } from "@/lib/errors/app-error";
import { resolveSmtpHost } from "@/lib/email/smtp-network";
export const dynamic = "force-dynamic";
export const GET = route(async () => {
    const db = getDb(), { google, smtp, ...settings } = db.integrations;
    const sheetOverrides = db.customForms.filter(form => form.google_sheets_config?.enabled).map(form => ({ formId: form.id, title: form.title, sheetId: form.google_sheets_config.sheet_id, sheetName: form.google_sheets_config.sheet_name }));
    return NextResponse.json({ success: true, settings, sheetOverrides, google: google ? { email: google.email, connected_at: google.connected_at } : null, smtp: smtp ? { ...smtp, password: undefined, passwordSaved: Boolean(smtp.password) } : null, oauthConfigured: googleConfig().ready, redirectUri: googleConfig().redirectUri, storageMode: storageMode() });
}, true);
export const POST = route(async req => {
    const body = await req.json();
    if (body.action === "save_smtp") await resolveSmtpHost(String(body.host || ""));
    if (body.action === "check_google") {
        const snapshot = await readDatabase();
        await databaseContext.run(snapshot, () => googleRequest("https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId(String(body.sheetId || "")) + "?fields=spreadsheetId,properties.title"));
        return NextResponse.json({ success: true, message: "Google access and spreadsheet verified. Release blocked jobs in Email Center after checking the effective destination." });
    }
    if (body.action === "create_sheet") {
        const title = z.string().trim().min(1).max(255).parse(body.title || "Unicom TIC Admissions"), snapshot = await readDatabase();
        let created: any;
        try { created = await databaseContext.run(snapshot, () => googleSheetsService.createSpreadsheet(title)); }
        catch (error) {
            if (error instanceof AppError && !error.retryable) throw error;
            throw new RequestError("Spreadsheet creation was not confirmed. Check Google Drive before creating another; save an existing spreadsheet URL manually if it was created.", 503, { code: "SHEET_CREATE_UNCONFIRMED" });
        }
        try {
            await transaction(db => {
                if (db.integrations.google?.email !== snapshot.integrations.google?.email) throw new Error("Connection changed");
                if (db.outbox.some(j => j.type === "sheet" && j.status === "sending")) throw new Error("Export in progress");
                db.integrations.registration_sheet_id = created.spreadsheetId;
                db.integrations.application_sheet_id = created.spreadsheetId;
            }, { maxConflictRetries: 8 });
        } catch { throw new RequestError("The spreadsheet was created but its destination save could not be confirmed. Find it in Google Drive and save its URL manually.", 503, { code: "SHEET_CREATED_SETTINGS_UNSAVED", sheetId: created.spreadsheetId, url: created.spreadsheetUrl }); }
        return NextResponse.json({ success: true, sheetId: created.spreadsheetId, url: created.spreadsheetUrl, message: "Spreadsheet created and its destination saved." });
    }
    return transaction(db => {
        if (body.action === "disconnect") {
            db.integrations.google = undefined;
            return NextResponse.json({ success: true, message: "Google account disconnected from this portal." });
        }
        if (body.action === "save") {
            const data = z.object({ email_provider: z.enum(["gmail", "smtp"]), admin_notification_email: z.string().email().or(z.literal("")), registration_sheet_id: z.string().max(500).optional(), application_sheet_id: z.string().max(500).optional() }).parse(body);
            if (data.registration_sheet_id) data.registration_sheet_id = spreadsheetId(data.registration_sheet_id);
            if (data.application_sheet_id) data.application_sheet_id = spreadsheetId(data.application_sheet_id);
            if (db.outbox.some(j => j.type === "sheet" && j.status === "sending") && (data.registration_sheet_id !== db.integrations.registration_sheet_id || data.application_sheet_id !== db.integrations.application_sheet_id)) throw new RequestError("An export is currently running. Wait for it to finish before changing destinations.", 409);
            if (data.email_provider !== db.integrations.email_provider) db.integrations.default_email_account_id = undefined;
            Object.assign(db.integrations, data);
            return NextResponse.json({ success: true, message: "Integration settings saved. Retry affected blocked jobs after verifying the connection." });
        }
        if (body.action === "save_smtp") {
            const data = z.object({ host: z.string().trim().min(3).max(255), port: z.coerce.number().int().min(1).max(65535), secure: z.boolean(), username: z.string().min(1).max(255), password: z.string().max(2000), from_name: z.string().min(1).max(255), from_email: z.string().email() }).parse(body);
            const password = data.password ? encrypt(data.password) : db.integrations.smtp?.password;
            if (!password) throw new RequestError("An SMTP app password is required.");
            db.integrations.smtp = { ...data, password };
            db.integrations.email_provider = "smtp";
            db.integrations.default_email_account_id = "legacy-smtp";
            return NextResponse.json({ success: true, message: "SMTP configuration saved. Verify it before releasing blocked sender jobs." });
        }
        throw new RequestError("Unknown action.");
    }, { maxConflictRetries: 8 });
}, true, { database: false });

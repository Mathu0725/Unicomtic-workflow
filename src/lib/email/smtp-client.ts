import nodemailer from "nodemailer";
import { getDb } from "../data/store";
import { decrypt } from "../security/secrets";
import { googleRequest } from "../google/oauth";
import { ProviderError, providerFailure, type FailureKind } from "../errors/provider-error";
import { emailValidationMessage } from "../validations/email";
export interface SmtpConfig {
    host: string;
    port: number;
    secure?: boolean;
    username: string;
    password: string;
    fromName: string;
    fromEmail: string;
}
export interface SendEmailPayload {
    to: string;
    toName?: string;
    subject: string;
    html: string;
    text?: string;
    messageId?: string;
}
export interface SendEmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
    provider?: string;
    uncertain?: boolean;
    retryAfterMs?: number;
    errorCode?: string;
    failureKind?: FailureKind;
    action?: string;
}
export function getDefaultSmtpConfig(): SmtpConfig {
    const saved = getDb().integrations.smtp;
    if (saved)
        return { ...saved, password: decrypt(saved.password), fromName: saved.from_name, fromEmail: saved.from_email };
    return { host: process.env.SMTP_HOST || "smtp.gmail.com", port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", username: process.env.SMTP_USER || "", password: process.env.SMTP_PASS || "", fromName: process.env.SMTP_FROM_NAME || "Unicom TIC Admissions", fromEmail: process.env.SMTP_FROM_EMAIL || "" };
}
export function createSmtpTransporter(config: SmtpConfig) {
    return nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure ?? config.port === 465, auth: { user: config.username, pass: config.password }, requireTLS: !(config.secure ?? config.port === 465), tls: { rejectUnauthorized: true }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
}
export async function verifySmtpConnection(config: SmtpConfig) {
    if (!config.username || !config.password || /mock|your-app/.test(config.password))
        return { success: false, message: "Enter a real SMTP username and app password." };
    const transport = createSmtpTransporter(config);
    try {
        await transport.verify();
        return { success: true, message: "SMTP connection verified." };
    }
    catch (err: any) {
        const failure = providerFailure(err);
        return { success: false, message: failure.message, code: failure.code };
    }
    finally {
        transport.close();
    }
}
export async function sendEmail(payload: SendEmailPayload, config?: SmtpConfig): Promise<SendEmailResult> {
    let transport: ReturnType<typeof createSmtpTransporter> | undefined;
    let sending = false;
    try {
        const db = getDb();
        const recipientError = emailValidationMessage(payload.to);
        if (recipientError || typeof payload.subject !== "string" || typeof payload.html !== "string") throw new ProviderError("INVALID_EMAIL_JOB", recipientError || "This notification has an invalid recipient or message. Correct the source data.", "permanent");
        if (!config && db.integrations.email_provider === "gmail") {
            if (!db.integrations.google)
                throw new ProviderError("GOOGLE_NOT_CONNECTED", "Connect Gmail or configure SMTP in Email Center.", "blocked", 0, "reconnect_google");
            const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
            const message = await composer.sendMail({ from: { name: "Unicom TIC Admissions", address: db.integrations.google.email }, to: { name: payload.toName || "", address: payload.to }, subject: payload.subject, html: payload.html, text: payload.text, messageId: payload.messageId });
            if (!Buffer.isBuffer(message.message))
                throw new Error("Could not build email message.");
            const result = await googleRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw: Buffer.from(message.message).toString("base64url") }) });
            if (!result.id) throw new ProviderError("SEND_UNCERTAIN", "Google did not confirm the message ID. Check Gmail Sent before retrying.", "uncertain");
            return { success: true, messageId: result.id, provider: "gmail" };
        }
        const active = config || getDefaultSmtpConfig();
        if (!active.username || !active.password || /mock|your-app/.test(active.password))
            throw new ProviderError("SMTP_NOT_CONFIGURED", "Configure SMTP before sending email.", "blocked");
        transport = createSmtpTransporter(active);
        sending = true;
        const result = await transport.sendMail({ from: { name: active.fromName, address: active.fromEmail }, to: { name: payload.toName || "", address: payload.to }, subject: payload.subject, html: payload.html, text: payload.text, messageId: payload.messageId });
        if (!result.accepted?.length)
            throw new ProviderError("RECIPIENT_REJECTED", "SMTP did not accept this recipient. Check the address.", "permanent");
        return { success: true, messageId: result.messageId, provider: "smtp" };
    }
    catch (err: any) {
        const failure = providerFailure(err, sending);
        return { success: false, error: failure.message, errorCode: failure.code, failureKind: failure.kind, action: failure.action, retryAfterMs: failure.retryAfterMs, uncertain: failure.kind === "uncertain" };
    }
    finally {
        transport?.close();
    }
}

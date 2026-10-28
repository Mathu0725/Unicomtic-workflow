import nodemailer from "nodemailer";
import { getDb } from "../data/store";
import { decrypt } from "../security/secrets";
import { googleRequest } from "../google/oauth";
import {
  ProviderError,
  providerFailure,
  type FailureKind,
} from "../errors/provider-error";
import { emailValidationMessage } from "../validations/email";
import {
  configuredEmailAccount,
  defaultEmailAccountId,
  GMAIL_ACCOUNT,
  LEGACY_SMTP_ACCOUNT,
} from "./accounts";
import { resolveSmtpHost } from "./smtp-network";
import { htmlEmailText } from "./template-catalog";
import { sanitizeEmailHtml } from "./sanitize";
export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  timeoutMs?: number;
}
export interface SendEmailPayload {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  messageId?: string;
  smtpAccountId?: string;
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
  providerResponse?: string;
}
export function getDefaultSmtpConfig(
  accountId = defaultEmailAccountId(getDb()),
): SmtpConfig {
  if (accountId !== LEGACY_SMTP_ACCOUNT && accountId !== GMAIL_ACCOUNT) {
    const account = configuredEmailAccount(getDb(), accountId)!;
    try {
      return {
        host: account.host,
        port: account.port,
        secure: account.encryption
          ? account.encryption === "tls"
          : account.secure,
        username: account.username,
        password: decrypt(account.password!),
        fromName: account.from_name,
        fromEmail: account.from_email,
        replyTo: account.reply_to,
        timeoutMs: account.timeout_ms,
      };
    } catch {
      throw new ProviderError(
        "SMTP_SECRET_UNREADABLE",
        "The saved SMTP credential could not be read. Re-enter its app password in SMTP Configuration.",
        "blocked",
      );
    }
  }
  const saved = getDb().integrations.smtp;
  if (saved)
    return {
      ...saved,
      password: decrypt(saved.password),
      fromName: saved.from_name,
      fromEmail: saved.from_email,
    };
  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    username: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASS || "",
    fromName: process.env.SMTP_FROM_NAME || "Unicom TIC Admissions",
    fromEmail: process.env.SMTP_FROM_EMAIL || "",
  };
}
export async function createSmtpTransporter(config: SmtpConfig) {
  const address = await resolveSmtpHost(config.host);
  return nodemailer.createTransport({
    host: address,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: { user: config.username, pass: config.password },
    requireTLS: !(config.secure ?? config.port === 465),
    tls: {
      rejectUnauthorized: true,
      servername: config.host,
      minVersion: "TLSv1.2",
    },
    connectionTimeout: config.timeoutMs || 10000,
    greetingTimeout: config.timeoutMs || 10000,
    socketTimeout: config.timeoutMs || 20000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
export async function verifySmtpConnection(config: SmtpConfig) {
  if (
    !config.username ||
    !config.password ||
    /mock|your-app/.test(config.password)
  )
    return {
      success: false,
      message: "Enter a real SMTP username and app password.",
    };
  let transport: Awaited<ReturnType<typeof createSmtpTransporter>> | undefined;
  try {
    transport = await createSmtpTransporter(config);
    await transport.verify();
    return { success: true, message: "SMTP connection verified." };
  } catch (err: any) {
    const failure = providerFailure(err);
    return { success: false, message: failure.message, code: failure.code };
  } finally {
    transport?.close();
  }
}
export async function sendEmail(
  payload: SendEmailPayload,
  config?: SmtpConfig,
): Promise<SendEmailResult> {
  let transport: Awaited<ReturnType<typeof createSmtpTransporter>> | undefined;
  let sending = false;
  try {
    const db = getDb();
    const recipientError = emailValidationMessage(payload.to);
    if (
      recipientError ||
      typeof payload.subject !== "string" ||
      typeof payload.html !== "string"
    )
      throw new ProviderError(
        "INVALID_EMAIL_JOB",
        recipientError ||
          "This notification has an invalid recipient or message. Correct the source data.",
        "permanent",
      );
    payload = { ...payload, html: sanitizeEmailHtml(payload.html) };
    const accountId = payload.smtpAccountId || defaultEmailAccountId(db);
    if (!config && accountId === GMAIL_ACCOUNT) {
      if (!db.integrations.google)
        throw new ProviderError(
          "GOOGLE_NOT_CONNECTED",
          "Connect Gmail or configure SMTP in Email Center.",
          "blocked",
          0,
          "reconnect_google",
        );
      const composer = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        newline: "windows",
      });
      const message = await composer.sendMail({
        from: {
          name: "Unicom TIC Admissions",
          address: db.integrations.google.email,
        },
        to: { name: payload.toName || "", address: payload.to },
        subject: payload.subject,
        html: payload.html,
        text: payload.text || htmlEmailText(payload.html),
        messageId: payload.messageId,
      });
      if (!Buffer.isBuffer(message.message))
        throw new Error("Could not build email message.");
      const result = await googleRequest(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          body: JSON.stringify({
            raw: Buffer.from(message.message).toString("base64url"),
          }),
        },
      );
      if (!result.id)
        throw new ProviderError(
          "SEND_UNCERTAIN",
          "Google did not confirm the message ID. Check Gmail Sent before retrying.",
          "uncertain",
        );
      return {
        success: true,
        messageId: result.id,
        provider: "gmail",
        providerResponse: "Gmail API accepted message",
      };
    }
    const active = config || getDefaultSmtpConfig(accountId);
    if (
      !active.username ||
      !active.password ||
      /mock|your-app/.test(active.password)
    )
      throw new ProviderError(
        "SMTP_NOT_CONFIGURED",
        "Configure SMTP before sending email.",
        "blocked",
      );
    transport = await createSmtpTransporter(active);
    sending = true;
    const result = await transport.sendMail({
      from: { name: active.fromName, address: active.fromEmail },
      replyTo: active.replyTo,
      to: { name: payload.toName || "", address: payload.to },
      subject: payload.subject,
      html: payload.html,
      text: payload.text || htmlEmailText(payload.html),
      messageId: payload.messageId,
    });
    if (!result.accepted?.length)
      throw new ProviderError(
        "RECIPIENT_REJECTED",
        "SMTP did not accept this recipient. Check the address.",
        "permanent",
      );
    return {
      success: true,
      messageId: result.messageId,
      provider: "smtp",
      providerResponse: `${String(result.response || "").match(/^2\d\d\b/)?.[0] || "SMTP"} accepted message`,
    };
  } catch (err: any) {
    const failure = providerFailure(err, sending);
    return {
      success: false,
      error: failure.message,
      errorCode: failure.code,
      failureKind: failure.kind,
      action: failure.action,
      retryAfterMs: failure.retryAfterMs,
      uncertain: failure.kind === "uncertain",
    };
  } finally {
    transport?.close();
  }
}

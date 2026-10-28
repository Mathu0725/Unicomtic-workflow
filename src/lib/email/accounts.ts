import { z } from "zod";
import type { DatabaseStore, EmailAccount } from "../data/store";
import { ProviderError } from "../errors/provider-error";
import { candidateEmailSchema } from "../validations/email";

export const GMAIL_ACCOUNT = "gmail";
export const LEGACY_SMTP_ACCOUNT = "legacy-smtp";
const singleLine = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !/[\r\n\x00]/.test(value), "Use one line.");
export const smtpAccountSchema = z
  .object({
    name: singleLine,
    host: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(253)
      .refine(
        (value) => /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z\d-]+$/.test(value),
        "Enter a public SMTP hostname without a URL, port or path.",
      ),
    port: z.number().int().min(1).max(65535),
    username: singleLine,
    password: z.string().max(2000).optional(),
    encryption: z.enum(["starttls", "tls"]),
    from_name: singleLine,
    from_email: candidateEmailSchema,
    reply_to: candidateEmailSchema.or(z.literal("")).optional(),
    timeout_ms: z.number().int().min(3000).max(20000).default(10000),
    daily_limit: z.number().int().min(1).max(500).nullable().optional(),
    is_active: z.boolean(),
  })
  .strict();

export function defaultEmailAccountId(db: DatabaseStore): string {
  return (
    db.integrations.default_email_account_id ||
    (db.integrations.email_provider === "gmail"
      ? GMAIL_ACCOUNT
      : LEGACY_SMTP_ACCOUNT)
  );
}
export function safeSmtpAccount(account: EmailAccount) {
  // Explicit projection: adding a future server-only property cannot leak it.
  return {
    id: account.id,
    name: account.name,
    host: account.host,
    port: account.port,
    username: account.username,
    encryption: account.encryption || (account.secure ? "tls" : "starttls"),
    from_name: account.from_name,
    from_email: account.from_email,
    reply_to: account.reply_to || "",
    timeout_ms: account.timeout_ms || 10000,
    daily_limit: account.daily_limit ?? null,
    is_active: account.is_active,
    passwordSaved: Boolean(account.password),
    created_at: account.created_at,
    updated_at: account.updated_at,
    last_test: account.last_test,
  };
}
export function emailAccountOptions(db: DatabaseStore) {
  return [
    {
      id: GMAIL_ACCOUNT,
      name: `Connected Gmail${db.integrations.google ? ` · ${db.integrations.google.email}` : " (not connected)"}`,
      active: Boolean(db.integrations.google),
      provider: "gmail",
    },
    ...(db.integrations.smtp || process.env.SMTP_USER
      ? [
          {
            id: LEGACY_SMTP_ACCOUNT,
            name: "Existing SMTP configuration",
            active: true,
            provider: "smtp",
          },
        ]
      : []),
    ...db.emailAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      active: account.is_active && Boolean(account.password),
      provider: "smtp",
    })),
  ];
}
export function validateEmailAccount(db: DatabaseStore, id?: string) {
  if (
    id &&
    !emailAccountOptions(db).some(
      (account) => account.id === id && account.active,
    )
  )
    throw new ProviderError(
      "SMTP_ACCOUNT_UNAVAILABLE",
      "The selected sending account is inactive or not configured. Review SMTP Configuration.",
      "blocked",
    );
}
export function configuredEmailAccount(
  db: DatabaseStore,
  id = defaultEmailAccountId(db),
) {
  const account = db.emailAccounts.find((account) => account.id === id);
  if (
    id !== GMAIL_ACCOUNT &&
    id !== LEGACY_SMTP_ACCOUNT &&
    (!account?.is_active || !account.password)
  )
    throw new ProviderError(
      "SMTP_ACCOUNT_UNAVAILABLE",
      "The selected SMTP account is inactive or not configured. Review SMTP Configuration.",
      "blocked",
    );
  return account;
}

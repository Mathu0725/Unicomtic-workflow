import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { databaseContext } from "@/lib/data/store";
import { readDatabase, transaction } from "@/lib/data/repository";
import { getSession } from "@/lib/security/session";
import { encrypt } from "@/lib/security/secrets";
import {
  smtpAccountSchema,
  safeSmtpAccount,
  emailAccountOptions,
  defaultEmailAccountId,
  validateEmailAccount,
  GMAIL_ACCOUNT,
} from "@/lib/email/accounts";
import { resolveSmtpHost } from "@/lib/email/smtp-network";
import {
  getDefaultSmtpConfig,
  verifySmtpConnection,
} from "@/lib/email/smtp-client";
import { emailBudget, emailSender } from "@/lib/email/sending-budget";
import { providerFailure } from "@/lib/errors/provider-error";
export const dynamic = "force-dynamic";
export const GET = route(
  async () => {
    const db = await readDatabase();
    return NextResponse.json(
      {
        success: true,
        defaultAccountId: defaultEmailAccountId(db),
        options: emailAccountOptions(db),
        accounts: db.emailAccounts.map((account) => ({
          ...safeSmtpAccount(account),
          budget: emailBudget(
            db,
            Date.now(),
            emailSender(db, account.id),
            account.id,
          ),
          recentErrors: db.outbox
            .flatMap((job) => {
              const attempts =
                job.delivery_attempts?.filter(
                  (attempt) =>
                    attempt.account_id === account.id &&
                    ["rejected", "uncertain"].includes(attempt.outcome),
                ) || [];
              if (attempts.length)
                return attempts.map((attempt) => ({
                  jobId: job.id,
                  code: attempt.code,
                  message:
                    attempt.outcome === "uncertain"
                      ? "Acceptance is uncertain. Verify provider records before retrying."
                      : "A sending attempt was rejected. Review Delivery Activity for its account history.",
                  at: attempt.at,
                }));
              return job.email_account_id === account.id && job.error
                ? [
                    {
                      jobId: job.id,
                      code: job.error_code,
                      message: job.error,
                      at: job.last_attempt_at || job.created_at,
                    },
                  ]
                : [];
            })
            .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
            .slice(0, 5),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  true,
  { database: false },
);

const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("save"),
      id: z.string().max(128).optional(),
      expectedUpdatedAt: z.string().max(100).optional(),
      account: smtpAccountSchema,
    })
    .strict(),
  z.object({ action: z.literal("default"), id: z.string().max(128) }).strict(),
  z.object({ action: z.literal("verify"), id: z.string().max(128) }).strict(),
]);
export const POST = route(
  async (req) => {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success)
      throw new RequestError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(" "),
      );
    const input = parsed.data,
      actor = getSession(req)!.email;
    if (input.action === "verify") {
      const db = await readDatabase(),
        account = db.emailAccounts.find((account) => account.id === input.id);
      if (!account?.password)
        throw new RequestError(
          "Save an SMTP account with an app password first.",
        );
      const version = account.updated_at;
      let result: { success: boolean; message: string; code?: string };
      try {
        result = await databaseContext.run(db, () =>
          verifySmtpConnection(getDefaultSmtpConfig(input.id)),
        );
      } catch (error) {
        const failure = providerFailure(error);
        result = {
          success: false,
          message: failure.message,
          code: failure.code,
        };
      }
      await transaction(
        (state) => {
          const current = state.emailAccounts.find(
            (account) => account.id === input.id,
          );
          if (current && current.updated_at === version)
            current.last_test = { at: new Date().toISOString(), ...result };
          state.auditLogs.push({
            id: crypto.randomUUID(),
            user_email: actor,
            action: "SMTP_CONNECTION_TESTED",
            entity_name: "email_accounts",
            entity_id: input.id,
            changes: { success: result.success, code: result.code },
            created_at: new Date().toISOString(),
          });
        },
        { maxConflictRetries: 8 },
      );
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }
    if (input.action === "save") await resolveSmtpHost(input.account.host);
    return transaction(
      (db) => {
        if (input.action === "default") {
          validateEmailAccount(db, input.id);
          db.integrations.default_email_account_id = input.id;
          db.integrations.email_provider =
            input.id === GMAIL_ACCOUNT ? "gmail" : "smtp";
          for (const account of db.emailAccounts)
            account.is_default = account.id === input.id;
        } else {
          const existing = input.id
            ? db.emailAccounts.find((account) => account.id === input.id)
            : undefined;
          if (!input.id && db.emailAccounts.length >= 50)
            throw new RequestError(
              "Up to 50 SMTP accounts are supported. Edit an existing account.",
            );
          if (input.id && !existing)
            throw new RequestError("SMTP account not found.", 404);
          if (
            existing &&
            (existing.updated_at || "") !== (input.expectedUpdatedAt || "")
          )
            throw new RequestError(
              "This SMTP account changed. Reload before saving.",
              409,
            );
          if (
            existing &&
            !input.account.is_active &&
            defaultEmailAccountId(db) === existing.id
          )
            throw new RequestError(
              "Choose another default sender before disabling this account.",
            );
          const password = input.account.password
            ? encrypt(input.account.password)
            : existing?.password;
          if (!password)
            throw new RequestError(
              "Enter an SMTP app password. A blank password keeps an existing credential.",
            );
          const now = new Date(
            Math.max(
              Date.now(),
              Date.parse(existing?.updated_at || "") + 1 || 0,
            ),
          ).toISOString();
          const next = {
            ...input.account,
            daily_limit: input.account.daily_limit || undefined,
            password,
            id: existing?.id || crypto.randomUUID(),
            secure: input.account.encryption === "tls",
            is_default: existing?.is_default || false,
            created_at: existing?.created_at || now,
            updated_at: now,
          };
          if (existing) Object.assign(existing, next, { last_test: undefined });
          else db.emailAccounts.push(next);
        }
        db.auditLogs.push({
          id: crypto.randomUUID(),
          user_email: actor,
          action:
            input.action === "default"
              ? "EMAIL_DEFAULT_ACCOUNT_UPDATED"
              : "SMTP_ACCOUNT_SAVED",
          entity_name: "email_accounts",
          entity_id: input.id || db.emailAccounts.at(-1)!.id,
          changes: {
            ...(input.action === "save"
              ? {
                  active: input.account.is_active,
                  credentialChanged: Boolean(input.account.password),
                }
              : {}),
          },
          created_at: new Date().toISOString(),
        });
        return NextResponse.json({
          success: true,
          message:
            input.action === "default"
              ? "Default sender saved. Existing jobs keep their selected account."
              : "SMTP account saved. Verify its connection before routing messages to it.",
        });
      },
      { maxConflictRetries: 8 },
    );
  },
  true,
  { database: false, bodyLimit: 8192 },
);

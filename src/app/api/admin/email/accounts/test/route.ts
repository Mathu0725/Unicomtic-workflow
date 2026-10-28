import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { getSession } from "@/lib/security/session";
import { candidateEmailSchema } from "@/lib/validations/email";
import { validateEmailAccount } from "@/lib/email/accounts";
import { renderNotification } from "@/lib/email/notification-templates";
import { enqueue } from "@/lib/jobs/outbox";
export const dynamic = "force-dynamic";
export const POST = route(
  async (req) => {
    if (!req.headers.get("idempotency-key"))
      throw new RequestError("A message retry key is required.");
    const { accountId, recipient } = z
      .object({
        accountId: z.string().min(1).max(128),
        recipient: candidateEmailSchema,
        clientAttemptId: z.string().uuid().optional(),
      })
      .strict()
      .parse(await req.json());
    const db = getDb();
    validateEmailAccount(db, accountId);
    const actor = getSession(req)!.email;
    const job = enqueue(db, "email", `smtp-test:${crypto.randomUUID()}`, {
      to: recipient,
      ...renderNotification(db, "test_notification", {
        institution: db.settings.institutionName || "Unicom TIC",
      }),
      smtpAccountId: accountId,
      initiatedBy: actor,
      notificationEvent: "test_notification",
    });
    db.auditLogs.push({
      id: crypto.randomUUID(),
      user_email: actor,
      action: "SMTP_TEST_EMAIL_QUEUED",
      entity_name: "outbox",
      entity_id: job.id,
      changes: { accountId },
      created_at: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      jobId: job.id,
      message:
        "Test email queued for the entered recipient. Delivery activity shows provider acceptance.",
    });
  },
  true,
  { submission: true },
);

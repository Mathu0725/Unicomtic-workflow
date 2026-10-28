import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { getSession } from "@/lib/security/session";
import {
  manualTemplateIds,
  manualVariables,
  prepareManualEmail,
} from "@/lib/email/manual";
import { savedTemplate } from "@/lib/email/notification-templates";
import { templateDefinition } from "@/lib/email/template-catalog";
import {
  emailAccountOptions,
  defaultEmailAccountId,
} from "@/lib/email/accounts";
import { enqueue } from "@/lib/jobs/outbox";
export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const db = getDb(),
    batchId = req.nextUrl.searchParams.get("batchId");
  const jobs = batchId
    ? db.outbox.filter((job) => job.payload.manualBatchId === batchId)
    : [];
  return NextResponse.json({
    success: true,
    accounts: emailAccountOptions(db),
    defaultAccountId: defaultEmailAccountId(db),
    variables: manualVariables,
    templates: manualTemplateIds.map((id) => ({
      id,
      title: templateDefinition(id).title,
      ...savedTemplate(db, id),
    })),
    ...(batchId
      ? {
          progress: {
            total: jobs.length,
            statuses: Object.fromEntries(
              [
                "queued",
                "sending",
                "sent",
                "blocked",
                "failed",
                "uncertain",
              ].map((status) => [
                status,
                jobs.filter((job) => job.status === status).length,
              ]),
            ),
          },
        }
      : {}),
  });
}, true);
export const POST = route(
  async (req) => {
    const key = req.headers.get("idempotency-key");
    if (!key) throw new RequestError("A message retry key is required.");
    const db = getDb(),
      { input, messages, duplicateCount } = prepareManualEmail(
        db,
        await req.json(),
      );
    if (
      !input.testRecipient &&
      messages.length > 1 &&
      input.confirmRecipientCount !== messages.length
    )
      throw new RequestError(
        `Review and confirm the ${messages.length} unique recipients before sending.`,
      );
    const actor = getSession(req)!.email,
      batchId = createHash("sha256").update(`${actor}:${key}`).digest("hex");
    const outgoing = input.testRecipient
      ? [
          {
            ...messages[0],
            to: input.testRecipient,
            toName: "Test recipient",
            candidateMessage: undefined,
          },
        ]
      : messages;
    const jobs = outgoing.map((message) =>
      enqueue(
        db,
        "email",
        `manual:${batchId}:${createHash("sha256").update(message.to).digest("hex")}`,
        {
          ...message,
          smtpAccountId: input.accountId || undefined,
          initiatedBy: actor,
          notificationEvent: input.testRecipient
            ? "manual_test"
            : "manual_message",
          manualBatchId: batchId,
          templateId: input.templateId || "manual_custom",
          templateVersion: input.templateId
            ? savedTemplate(db, input.templateId).version
            : 0,
        },
      ),
    );
    db.auditLogs.push({
      id: crypto.randomUUID(),
      user_email: actor,
      action: input.testRecipient
        ? "MANUAL_EMAIL_TEST_QUEUED"
        : "MANUAL_EMAIL_BATCH_QUEUED",
      entity_name: "outbox",
      entity_id: batchId,
      changes: {
        recipientCount: jobs.length,
        duplicateCount,
        accountId: jobs[0].email_account_id,
        templateId: input.templateId || "manual_custom",
      },
      created_at: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      batchId,
      jobIds: jobs.map((job) => job.id),
      recipientCount: jobs.length,
      duplicateCount,
      message: `${jobs.length} separate email${jobs.length === 1 ? "" : "s"} saved to the delivery queue.`,
    });
  },
  true,
  { submission: true, authorize: (req) => getSession(req)!.email },
);

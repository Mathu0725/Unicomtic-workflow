import { randomUUID } from "node:crypto";
import type { DatabaseStore } from "../data/store";
import type { OutboxJob, EmailDispatch } from "../data/types";
import {
  defaultEmailAccountId,
  GMAIL_ACCOUNT,
  LEGACY_SMTP_ACCOUNT,
} from "./accounts";

export const EMAIL_DAY_MS = 24 * 60 * 60 * 1000;
export const EMAIL_DAILY_MAX = 500;
function normalizeAccount(value: string) {
  const email = value.trim().toLowerCase();
  const [local, domain] = email.split("@");
  return domain === "gmail.com" || domain === "googlemail.com"
    ? `${local.split("+")[0].replace(/\./g, "")}@gmail.com`
    : email;
}
export function emailSender(
  db: DatabaseStore,
  accountId = defaultEmailAccountId(db),
) {
  if (accountId === GMAIL_ACCOUNT)
    return normalizeAccount(
      db.integrations.google?.email || "unconfigured:gmail",
    );
  if (accountId !== LEGACY_SMTP_ACCOUNT) {
    const account = db.emailAccounts.find(
      (account) => account.id === accountId,
    );
    return account?.username.includes("@")
      ? normalizeAccount(account.username)
      : `smtp:${account?.host || accountId}:${account?.username || "unconfigured"}`;
  }
  const username =
    db.integrations.smtp?.username || process.env.SMTP_USER || "";
  return username.includes("@")
    ? normalizeAccount(username)
    : `smtp:${(db.integrations.smtp?.host || process.env.SMTP_HOST || "unconfigured").toLowerCase()}:${username}`;
}
function legacyDispatches(db: DatabaseStore, now: number): EmailDispatch[] {
  return db.outbox
    .filter(
      (job) =>
        job.type === "email" &&
        !job.email_budget_recorded &&
        ["sent", "uncertain", "sending"].includes(job.status),
    )
    .map((job) => ({
      id: `legacy:${job.id}`,
      job_id: job.id,
      sender: job.sender_identity || emailSender(db, job.email_account_id),
      account_id: job.email_account_id,
      at:
        Date.parse(job.completed_at || job.last_attempt_at || job.created_at) ||
        now,
      status:
        job.status === "sent"
          ? "accepted"
          : job.status === "sending"
            ? "reserved"
            : "uncertain",
    }));
}
export function emailBudget(
  db: DatabaseStore,
  now = Date.now(),
  sender = emailSender(db),
  accountId = defaultEmailAccountId(db),
) {
  const configured = db.integrations.email_daily_limit;
  const accountLimit =
    db.emailAccounts.find((account) => account.id === accountId)?.daily_limit ||
    EMAIL_DAILY_MAX;
  const limit = Math.min(
    accountLimit,
    Number.isSafeInteger(configured)
      ? Math.max(1, Math.min(EMAIL_DAILY_MAX, configured!))
      : EMAIL_DAILY_MAX,
  );
  const records = [
    ...(db.queueControl.email_dispatches || []),
    ...legacyDispatches(db, now),
  ].filter(
    (record) => record.sender === sender && record.at > now - EMAIL_DAY_MS,
  );
  const used = records.length,
    remaining = Math.max(0, limit - used);
  const availableAfter =
    records.length >= limit
      ? records.map((record) => record.at).sort((a, b) => a - b)[
          records.length - limit
        ] + EMAIL_DAY_MS
      : now;
  const cooldown = db.queueControl.email_cooldowns?.[sender];
  const pausedUntil = cooldown && cooldown.until > now ? cooldown.until : 0;
  const nextAvailableAt = Math.max(availableAfter, pausedUntil);
  return {
    sender,
    limit,
    used,
    accepted: records.filter((record) => record.status === "accepted").length,
    reserved: records.filter((record) => record.status === "reserved").length,
    uncertain: records.filter((record) => record.status === "uncertain").length,
    remaining,
    paused: pausedUntil > now,
    pauseReason: pausedUntil ? cooldown!.message : "",
    canSend: remaining > 0 && !pausedUntil,
    nextAvailableAt:
      nextAvailableAt > now ? new Date(nextAvailableAt).toISOString() : null,
  };
}
export function reserveEmailDispatch(
  db: DatabaseStore,
  job: OutboxJob,
  now: number,
) {
  const existing = db.queueControl.email_dispatches || [];
  db.queueControl.email_dispatches = [
    ...existing,
    ...legacyDispatches(db, now),
  ].filter((record) => record.at > now - EMAIL_DAY_MS);
  for (const previous of db.outbox)
    if (
      previous.type === "email" &&
      ["sent", "sending", "uncertain"].includes(previous.status)
    )
      previous.email_budget_recorded = true;
  const budget = emailBudget(
    db,
    now,
    emailSender(db, job.email_account_id),
    job.email_account_id,
  );
  if (!budget.canSend) return false;
  const record: EmailDispatch = {
    id: randomUUID(),
    job_id: job.id,
    sender: budget.sender,
    account_id: job.email_account_id,
    at: now,
    status: "reserved",
  };
  db.queueControl.email_dispatches.push(record);
  job.email_dispatch_id = record.id;
  job.email_budget_recorded = true;
  job.sender_identity = budget.sender;
  return true;
}
export function settleEmailDispatch(
  db: DatabaseStore,
  job: OutboxJob,
  outcome: "accepted" | "uncertain" | "rejected",
  now: number,
) {
  const records = db.queueControl.email_dispatches || [];
  const record = records.find((record) => record.id === job.email_dispatch_id);
  if (!record) return;
  if (outcome === "rejected")
    db.queueControl.email_dispatches = records.filter(
      (item) => item.id !== record.id,
    );
  else {
    record.status = outcome;
    record.at = now;
  }
}

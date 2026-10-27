import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { EMAIL_DAILY_MAX, emailBudget } from "@/lib/email/sending-budget";
import { getSession } from "@/lib/security/session";
export const dynamic = "force-dynamic";
export const GET = route(async () => NextResponse.json({ success: true, budget: emailBudget(getDb()) }), true);
export const POST = route(async req => {
  const { limit } = await req.json();
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > EMAIL_DAILY_MAX) throw new RequestError(`Enter a daily limit from 1 to ${EMAIL_DAILY_MAX}.`);
  const db = getDb();
  db.integrations.email_daily_limit = limit;
  db.auditLogs.push({ id: randomUUID(), user_email: getSession(req)!.email, action: "EMAIL_DAILY_LIMIT_CHANGED", entity_name: "integrations", entity_id: "email", changes: { limit }, created_at: new Date().toISOString() });
  return NextResponse.json({ success: true, budget: emailBudget(db), message: "Daily email limit saved. Previous sends still count." });
}, true);

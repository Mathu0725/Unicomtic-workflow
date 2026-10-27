import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { getSession } from "@/lib/security/session";
import { reminderCohorts, reminderDeliveryState } from "@/lib/reminders/eligibility";
import { reminderToken, queueReminders, reminderActionUrl } from "@/lib/reminders/service";
import { reminderKinds, hasUnknownReminderVariable } from "@/lib/reminders/templates";
import { savedTemplate } from "@/lib/email/notification-templates";
export const dynamic = "force-dynamic";
const kindSchema = z.enum(reminderKinds);
const template = (max: number) => z.string().trim().min(1).max(max).refine(value => !hasUnknownReminderVariable(value), "Use only the supported message variables.");
const sendSchema = z.object({
    kind: kindSchema, campaignId: z.string().max(128).optional(), expiresAt: z.number().int(),
    recipients: z.array(z.object({ id: z.string().min(1).max(256), token: z.string().regex(/^[a-f0-9]{64}$/) })).min(1).max(500).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Remove duplicate recipients."),
    subject: template(200), body: template(6000), actionUrl: z.string().trim().max(2048).optional(),
});
export const GET = route(async req => {
    const kind = kindSchema.parse(req.nextUrl.searchParams.get("kind") || reminderKinds[0]);
    const campaignId = req.nextUrl.searchParams.get("campaignId") || "", db = getDb(), now = Date.now(), expiresAt = now + 15 * 60000;
    // Filter before counting as well, so attendance review belongs to this intake.
    const source = campaignId ? Object.assign(Object.create(Object.getPrototypeOf(db)), db, { registrations: db.registrations.filter(r => r.campaign_id === campaignId) }) : db;
    const cohorts = reminderCohorts(source, now);
    const matching = cohorts.candidates.filter(c => c.kind === kind);
    const recipients = matching.slice(0, 500).map(candidate => ({ ...candidate, ...reminderDeliveryState(db, candidate, now), actionUrl: reminderActionUrl(candidate), token: reminderToken(candidate, expiresAt) }));
    const lastSeen = db.queueControl.last_worker_at || 0;
    return NextResponse.json({ success: true, recipients, total: matching.length, expiresAt, attendanceReview: cohorts.attendanceReview,
        counts: Object.fromEntries(reminderKinds.map(value => [value, cohorts.candidates.filter(c => c.kind === value).length])),
        campaigns: db.campaigns.filter(c => c.is_active).map(c => ({ id: c.id, title: c.title })),
        workerStale: now - lastSeen > 120000, sender: db.integrations.email_provider,
        templates: Object.fromEntries(reminderKinds.map(id => [id, savedTemplate(db, id)])),
    });
}, true);
export const POST = route(async req => {
    const parsed = sendSchema.safeParse(await req.json());
    if (!parsed.success) throw new RequestError("Review the recipients and message fields.", 400, { errors: parsed.error.flatten().fieldErrors });
    if (/\r|\n/.test(parsed.data.subject)) throw new RequestError("Use a single line for the subject.");
    const db = getDb(), result = queueReminders(db, parsed.data);
    db.auditLogs.push({ id: crypto.randomUUID(), user_email: getSession(req)!.email, action: "REMINDERS_QUEUED", entity_name: "reminders", entity_id: parsed.data.kind, changes: { campaignId: parsed.data.campaignId, ...result }, created_at: new Date().toISOString() });
    return NextResponse.json({ success: true, ...result, message: `${result.queued} reminder(s) queued; ${result.skipped} already queued or recently reminded. Delivery is tracked in Email Center.` });
}, true, { submission: true });

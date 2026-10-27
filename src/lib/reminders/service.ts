import { createHmac, randomUUID } from "node:crypto";
import type { DatabaseStore } from "../data/store";
import { appSecret } from "../security/secrets";
import { safeEqual } from "../security/session";
import { enqueue } from "../jobs/outbox";
import { RequestError } from "../http";
import { reminderCohorts, reminderDeliveryState, type ReminderCandidate } from "./eligibility";
import { renderReminderText, type ReminderKind } from "./templates";

export function reminderToken(candidate: ReminderCandidate, expiresAt: number) {
    return createHmac("sha256", appSecret()).update(JSON.stringify([candidate, expiresAt])).digest("hex");
}
const escaped = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
export function reminderActionUrl(candidate: ReminderCandidate, override = "") {
    const target = override || candidate.defaultActionUrl;
    if (!target) return "";
    const url = new URL(target, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new RequestError("Use an http or https action link without a username or password.");
    return url.href;
}
export function queueReminders(db: DatabaseStore, input: { kind: ReminderKind; campaignId?: string; expiresAt: number; recipients: { id: string; token: string }[]; subject: string; body: string; actionUrl?: string }, now = Date.now()) {
    if (input.expiresAt < now || input.expiresAt > now + 16 * 60000) throw new RequestError("This preview expired. Refresh recipients and review them again.", 409);
    const candidates = new Map(reminderCohorts(db, now).candidates.filter(c => c.kind === input.kind && (!input.campaignId || c.campaignId === input.campaignId)).map(c => [c.id, c]));
    const selected = input.recipients.map(recipient => {
        const candidate = candidates.get(recipient.id);
        if (!candidate || !safeEqual(recipient.token, reminderToken(candidate, input.expiresAt))) throw new RequestError("Selected recipients changed. Refresh and review before sending.", 409);
        return candidate;
    });
    let queued = 0, skipped = 0;
    for (const candidate of selected) {
        if (!reminderDeliveryState(db, candidate, now).canQueue) { skipped++; continue; }
        const url = reminderActionUrl(candidate, input.actionUrl);
        const subject = renderReminderText(input.subject, candidate), body = renderReminderText(input.body, candidate);
        if (/\r|\n/.test(subject) || subject.length > 250) throw new RequestError("The personalized subject must be one line and at most 250 characters. Review the subject and recipient name.");
        enqueue(db, "email", `admissions-reminder:${candidate.id}:${randomUUID()}`, {
            to: candidate.email, toName: candidate.name, subject,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${escaped(body).replace(/\n/g, "<br>")}${url ? `<p><a href="${escaped(url)}">${input.kind === "application_pending" ? "Complete your application" : "Workshop booking"}</a></p>` : ""}</div>`,
            admissionsReminder: { candidateId: candidate.id, kind: candidate.kind, registrationId: candidate.registrationId, bookingId: candidate.bookingId, defaultActionUrl: input.actionUrl ? "" : candidate.defaultActionUrl },
        });
        queued++;
    }
    return { queued, skipped };
}

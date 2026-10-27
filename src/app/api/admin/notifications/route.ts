import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { queueEmail } from "@/lib/jobs/outbox";
import { z } from "zod";
import { sheetTargetChanged } from "@/lib/google/job-target";
import { reminderCohorts, reminderMatches } from "@/lib/reminders/eligibility";
import { emailBudget } from "@/lib/email/sending-budget";
import { emailCandidateResolver } from "@/lib/email/candidates";
import { emailJobStatus } from "@/lib/email/job-status";
export const dynamic = "force-dynamic";
export const GET = route(async req => {
    const db = getDb(), lastSeen = db.queueControl.last_worker_at || 0, budget = emailBudget(db), resolveCandidate = emailCandidateResolver(db), params = req.nextUrl.searchParams;
    const search = (params.get("search") || "").trim().toLowerCase(), page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1)), pageSize = 50;
    const jobs = [...db.outbox].reverse().map(job => {
        const candidate = resolveCandidate(job);
        const deferred = job.type === "email" && job.status === "queued" && !budget.canSend;
        return { ...job, ...(deferred ? { deferred_until: budget.nextAvailableAt || undefined, deferred_reason: budget.paused ? "EMAIL_PROVIDER_DAILY_LIMIT" : "EMAIL_DAILY_LIMIT" } : {}), candidate };
    }).filter(job => (!params.get("type") || params.get("type") === "all" || job.type === params.get("type"))
        && (!params.get("stage") || params.get("stage") === "all" || job.candidate?.stage === params.get("stage"))
        && (!params.get("candidate") || job.candidate?.id === params.get("candidate"))
        && (!params.get("status") || params.get("status") === "all" || emailJobStatus(job).filter === params.get("status"))
        && (!search || [job.payload.to, job.payload.subject, job.candidate?.name, job.candidate?.reference, job.candidate?.registrationReference].some(value => typeof value === "string" && value.toLowerCase().includes(search))));
    return NextResponse.json({ success: true, jobs: jobs.slice((page - 1) * pageSize, page * pageSize), total: jobs.length, page, pageSize, budget, worker: { lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null, stale: Date.now() - lastSeen > 120000 }, pending: db.outbox.filter(j => j.status === "queued").length });
}, true);
export const POST = route(async (req) => {
    const body = await req.json();
    if (body.action === "test_email") {
        if (!z.string().email().safeParse(body.to).success)
            throw new RequestError("Enter a valid test recipient.");
        queueEmail({ to: body.to, subject: "Unicom TIC notification test", html: "<p>Your admissions notification connection is working.</p>" }, `test:${crypto.randomUUID()}`);
    }
    else if (body.action === "retry") {
        const job = getDb().outbox.find(j => j.id === body.jobId);
        if (!job || !["failed", "uncertain", "blocked"].includes(job.status))
            throw new RequestError("Select a failed, uncertain or blocked job.");
        if (job.error_code === "DECISION_SUPERSEDED") throw new RequestError("This notification belongs to an older decision and cannot be resent.", 409);
        if (job.error_code === "CANDIDATE_CONTACT_CHANGED") throw new RequestError("The candidate's contact details changed. Review the candidate and compose a new email.", 409);
        if (job.error_code === "CANDIDATE_EXPORT_CHANGED") throw new RequestError("The candidate's contact details changed. Queue a fresh export from form responses or Sheets Synchronization.", 409);
        if (job.error_code === "REMINDER_SUPERSEDED" || !reminderMatches(job, new Map(reminderCohorts(getDb()).candidates.map(c => [c.id, c])))) throw new RequestError("This reminder no longer applies. Review recipients in Reminders.", 409);
        if (sheetTargetChanged(getDb(), job)) throw new RequestError("This export has an older destination. Queue records to the current destination from the form responses or Sheets Synchronization page.", 409, { code: "SHEET_DESTINATION_CHANGED" });
        if (job.payload.decisionId && !getDb().selectionDecisions.some(d => d.id === job.payload.decisionId && job.key === `decision:${d.id}:${d.final_status}`)) throw new RequestError("This job does not match the current decision. Queue the current decision notification instead.", 409);
        if (job.status === "uncertain" && body.confirmProviderChecked !== true)
            throw new RequestError("Check Gmail Sent or your SMTP provider before retrying an uncertain send.");
        job.status = "queued";
        job.next_attempt_at = undefined;
        job.attempts = 0;
        job.error = undefined;
        job.error_code = undefined;
        job.repair_action = undefined;
    }
    else if (body.action === "release_blocked") {
        for (const job of getDb().outbox.filter(j => j.status === "blocked")) {
            if (["REMINDER_SUPERSEDED", "CANDIDATE_CONTACT_CHANGED", "CANDIDATE_EXPORT_CHANGED"].includes(job.error_code || "")) continue;
            if (sheetTargetChanged(getDb(), job)) continue;
            job.status = "queued"; job.attempts = 0; job.next_attempt_at = undefined; job.error = undefined; job.error_code = undefined; job.repair_action = undefined;
        }
    }
    else if (body.action !== "process")
        throw new RequestError("Unknown action.");
    return NextResponse.json({ success: true, message: "Queue action saved. Refresh to see the confirmed provider status." });
}, true, { processJobs: true });

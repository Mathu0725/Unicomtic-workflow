import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { emailCandidates } from "@/lib/email/candidates";
import { enqueue } from "@/lib/jobs/outbox";
import { getSession } from "@/lib/security/session";
import { candidateEmailSchema } from "@/lib/validations/email";
import { savedTemplate } from "@/lib/email/notification-templates";
export const dynamic = "force-dynamic";

export const GET = route(async req => {
  const params = req.nextUrl.searchParams;
  const stage = params.get("stage") === "application" ? "application" : "registration";
  const all = emailCandidates(getDb(), stage), search = (params.get("search") || "").trim().toLowerCase();
  const statuses = [...new Set(all.map(candidate => candidate.status))].sort();
  const filtered = all.filter(candidate => (!params.get("candidate") || candidate.id === params.get("candidate"))
    && (!params.get("intake") || candidate.campaignId === params.get("intake"))
    && (!params.get("form") || candidate.formIds?.includes(params.get("form")!))
    && (!params.get("workshop") || candidate.workshopIds?.includes(params.get("workshop")!))
    && (!params.get("status") || candidate.status === params.get("status"))
    && (!search || [candidate.name, candidate.email, candidate.reference, candidate.registrationReference].some(value => value.toLowerCase().includes(search))));
  const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1)), pageSize = 20;
  const pageCandidates = filtered.slice((page - 1) * pageSize, page * pageSize), db = getDb();
  return NextResponse.json({ success: true, candidates: pageCandidates, total: filtered.length, page, pageSize, statuses, messageTemplate: savedTemplate(db, "candidate_message"), filters: { intakes: db.campaigns.map(item => ({id:item.id,title:item.title})), forms: db.customForms.map(item => ({id:item.id,title:item.title})), workshops: db.workshops.map(item => ({id:item.id,title:item.title})) }, intakeTitles: Object.fromEntries(pageCandidates.map(candidate => [candidate.id, db.campaigns.find(campaign => campaign.id === db.registrations.find(registration => registration.id === candidate.registrationId)?.campaign_id)?.title || "Unicom TIC"])) });
}, true);

const messageSchema = z.object({ stage: z.enum(["registration", "application"]), recordId: z.string().min(1).max(200), expectedEmail: candidateEmailSchema, subject: z.string().trim().min(1).max(250).refine(value => !/[\r\n]/.test(value), "Subject must be one line."), body: z.string().trim().min(1).max(10000), clientAttemptId: z.string().uuid() }).strict();
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
export const POST = route(async req => {
  const parsed = messageSchema.safeParse(await req.json());
  if (!parsed.success) throw new RequestError(parsed.error.issues.find(issue => issue.path[0] === "expectedEmail")?.message || "Choose a candidate and enter a subject (up to 250 characters) and message (up to 10,000 characters).");
  const key = req.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new RequestError("A valid message retry key is required.");
  const input = parsed.data, db = getDb();
  const candidate = emailCandidates(db, input.stage).find(candidate => candidate.id === input.recordId);
  if (!candidate) throw new RequestError("This candidate record no longer exists. Refresh the candidate list.", 404);
  if (candidate.email.toLowerCase() !== input.expectedEmail.toLowerCase()) throw new RequestError("The candidate's email address changed. Refresh and review the recipient before sending.", 409);
  const job = enqueue(db, "email", `candidate:${createHash("sha256").update(key).digest("hex")}`, {
    to: candidate.email, toName: candidate.name, subject: input.subject,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(input.body).replace(/\r?\n/g, "<br />")}</div>`,
    candidateMessage: { stage: candidate.stage, recordId: candidate.id, studentId: candidate.studentId, registrationId: candidate.registrationId, applicationId: candidate.applicationId, reference: candidate.reference },
  });
  db.auditLogs.push({ id: randomUUID(), user_email: getSession(req)!.email, action: "CANDIDATE_EMAIL_QUEUED", entity_name: input.stage, entity_id: candidate.id, changes: { jobId: job.id, reference: candidate.reference }, created_at: new Date().toISOString() });
  return NextResponse.json({ success: true, jobId: job.id, status: job.status, message: "Email saved to the delivery queue." });
}, true, { submission: true });

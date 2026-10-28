import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { getSession } from "@/lib/security/session";
import { candidateEmailSchema } from "@/lib/validations/email";
import { emailCandidateResolver } from "@/lib/email/candidates";
import { queueWorkshopBooking } from "@/lib/workshops/sheet-sync";
export const dynamic = "force-dynamic";
const schema = z.object({ studentId: z.string().min(1).max(200), expectedEmail: z.string().max(500), email: candidateEmailSchema }).strict();
const normalized = (value: unknown) => String(value || "").trim().toLowerCase();
export const PATCH = route(async req => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) throw new RequestError(parsed.error.issues[0].message, 400, { errors: parsed.error.flatten().fieldErrors });
  const { studentId, expectedEmail, email } = parsed.data, db = getDb();
  const student = db.students.find(student => student.id === studentId);
  if (!student) throw new RequestError("Candidate not found. Refresh the list.", 404);
  if (student.email === email) return NextResponse.json({ success: true, studentId, email, message: "Candidate email is already saved." });
  if (student.email !== expectedEmail) throw new RequestError("This candidate's email changed. Refresh and review the current address before saving.", 409);
  if (db.students.some(other => other.id !== studentId && normalized(other.email) === email)) throw new RequestError("This email belongs to another candidate. Check the address before saving.", 409, { code: "IDENTITY_CONFLICT" });
  const previous = student.email, resolveCandidate = emailCandidateResolver(db);
  const references = new Set([...db.registrations.filter(record => record.student_id === studentId).map(record => record.reference_no), ...db.applications.filter(record => record.student_id === studentId).map(record => record.application_no)]);
  const submissions = db.formSubmissions.filter(submission => submission.student_id === studentId || references.has(submission.reference_no));
  const submissionIds = new Set(submissions.map(submission => submission.id));
  const affectedEmails = db.outbox.filter(job => {
    if (job.type !== "email" || normalized(job.payload.to) !== normalized(previous)) return false;
    if (resolveCandidate(job)?.studentId === studentId || submissionIds.has(job.payload.sourceId)) return true;
    if (job.payload.decisionId && db.selectionDecisions.some(decision => decision.id === job.payload.decisionId && decision.student_id === studentId)) return true;
    if (db.workshopBookings.some(booking => booking.student_id === studentId && (job.key === `booking:${booking.id}` || job.key.startsWith(`reminder:${booking.id}:`)))) return true;
    if (db.interviewCandidates.some(candidate => candidate.student_id === studentId && job.key === `interview:${candidate.id}`)) return true;
    return [...references].some(reference => String(job.payload.subject || "").includes(reference));
  });
  const bookingIds=new Set(db.workshopBookings.filter(booking=>booking.student_id===studentId).map(booking=>booking.id));
  const affectedExports = db.outbox.filter(job => job.type === "sheet" && (bookingIds.has(job.payload.bookingId) || submissionIds.has(job.payload.sourceId) || job.payload.rows?.some((row: any) => references.has(row.referenceNo))));
  if ([...affectedEmails, ...affectedExports].some(job => job.status === "sending")) throw new RequestError("A message or export for this candidate is currently sending. Wait for it to finish, then refresh and save the correction.", 409);
  student.email = email;
  for (const submission of submissions) {
    const fields = db.customForms.find(form => form.id === submission.form_id)?.fields || [];
    for (const id of new Set(["email", ...fields.filter(field => field.systemKey === "email").map(field => field.id)])) {
      if (normalized(submission.data[id]) === normalized(previous)) submission.data[id] = email;
    }
    submission.synced_to_sheet = false;
  }
  let pausedEmails = 0, pausedExports = 0;
  for (const job of affectedEmails.filter(job => ["queued", "blocked", "failed", "uncertain"].includes(job.status))) {
    const uncertain = job.status === "uncertain";
    job.status = uncertain ? "uncertain" : "blocked"; job.error_code = "CANDIDATE_CONTACT_CHANGED";
    job.error = `${uncertain ? "Original delivery remains unconfirmed. " : ""}The candidate's email was corrected. Review the current address and compose a new email; this old recipient will not be retried.`;
    job.next_attempt_at = undefined; job.deferred_until = undefined; job.deferred_reason = undefined;
    pausedEmails++;
  }
  for (const job of affectedExports.filter(job => ["queued", "blocked", "failed"].includes(job.status))) {
    job.status = "blocked"; job.error_code = "CANDIDATE_EXPORT_CHANGED";
    job.error = "The candidate's email was corrected. Queue a fresh export from form responses or Sheets Synchronization.";
    job.next_attempt_at = undefined; pausedExports++;
  }
  for(const bookingId of bookingIds)queueWorkshopBooking(db,bookingId);
  db.auditLogs.push({ id: randomUUID(), user_email: getSession(req)!.email, action: "CANDIDATE_EMAIL_CORRECTED", entity_name: "students", entity_id: studentId, changes: { previousEmail: previous, email, pausedEmails, pausedExports }, created_at: new Date().toISOString() });
  return NextResponse.json({ success: true, studentId, email, pausedEmails, pausedExports, message: `Candidate email updated.${pausedEmails ? ` ${pausedEmails} old-address email(s) paused for review.` : ""}${submissions.length || affectedExports.length ? " Re-export linked records to update connected Sheets." : ""}` });
}, true, { submission: true });

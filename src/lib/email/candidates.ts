import type { DatabaseStore } from "../data/store";
import type { OutboxJob } from "../data/types";

export type CandidateStage = "registration" | "application";
export type EmailCandidate = {
  id: string;
  stage: CandidateStage;
  studentId: string;
  registrationId: string;
  applicationId?: string;
  name: string;
  email: string;
  reference: string;
  registrationReference: string;
  status: string;
  district: string;
  campaignId?: string;
  formIds?: string[];
  workshopIds?: string[];
};
export function emailCandidates(
  db: DatabaseStore,
  stage: CandidateStage,
): EmailCandidate[] {
  const students = new Map(db.students.map((student) => [student.id, student]));
  const registrations = new Map(
    db.registrations.map((registration) => [registration.id, registration]),
  );
  const formsByRecord = new Map<string, Set<string>>(),
    workshopsByRegistration = new Map<string, Set<string>>();
  for (const submission of db.formSubmissions) {
    const id =
      stage === "application"
        ? submission.application_id
        : submission.registration_id;
    if (!id) continue;
    if (!formsByRecord.has(id)) formsByRecord.set(id, new Set());
    formsByRecord.get(id)!.add(submission.form_id);
  }
  for (const booking of db.workshopBookings) {
    if (booking.status !== "confirmed") continue;
    if (!workshopsByRegistration.has(booking.registration_id))
      workshopsByRegistration.set(booking.registration_id, new Set());
    workshopsByRegistration
      .get(booking.registration_id)!
      .add(booking.workshop_id);
  }
  return (
    stage === "registration" ? db.registrations : db.applications
  ).flatMap((record) => {
    const student = students.get(record.student_id);
    const registration =
      "registration_id" in record
        ? registrations.get(record.registration_id)
        : record;
    if (!student || !registration) return [];
    return [
      {
        id: record.id,
        stage,
        studentId: student.id,
        registrationId: registration.id,
        applicationId: "application_no" in record ? record.id : undefined,
        name: student.full_name,
        email: student.email,
        reference:
          "application_no" in record
            ? record.application_no
            : record.reference_no,
        registrationReference: registration.reference_no,
        status: record.status,
        district: student.district,
        campaignId: registration.campaign_id,
        formIds: [...(formsByRecord.get(record.id) || [])],
        workshopIds: [...(workshopsByRegistration.get(registration.id) || [])],
      },
    ];
  });
}
/** Resolve legacy confirmations and reminders as well as newly composed messages. */
export function emailCandidateResolver(db: DatabaseStore) {
  const registrations = emailCandidates(db, "registration"),
    applications = emailCandidates(db, "application");
  const byId = new Map(
    [...registrations, ...applications].map((candidate) => [
      candidate.id,
      candidate,
    ]),
  );
  const byReference = new Map(
    [...registrations, ...applications].map((candidate) => [
      candidate.reference,
      candidate,
    ]),
  );
  const submissions = new Map(
    db.formSubmissions.map((submission) => [submission.id, submission]),
  );
  return (job: OutboxJob): EmailCandidate | undefined => {
    const context =
      job.payload.candidateMessage || job.payload.candidateContext;
    if (context) return byId.get(context.recordId);
    const reminder = job.payload.admissionsReminder;
    if (reminder) return byId.get(reminder.registrationId);
    const keyId = job.key.startsWith("submission:")
      ? job.key.split(":")[1]
      : undefined;
    const submission = submissions.get(job.payload.sourceId || keyId);
    if (submission)
      return (
        byId.get(
          submission.application_id || submission.registration_id || "",
        ) || byReference.get(submission.reference_no)
      );
    if (keyId) return byId.get(keyId);
    // A reference is stable even if the student later changes their email address.
    const reference = job.payload.rows?.[0]?.referenceNo;
    return reference ? byReference.get(reference) : undefined;
  };
}

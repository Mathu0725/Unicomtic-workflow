import type { Application, FormSubmission, Registration, Student } from "../data/store";

// Response rows and canonical admissions rows have separate identities. Keep the
// public reference in its own column; it can legitimately occur in several forms.
export function submissionSheetIdentity(sub: FormSubmission) {
  return { referenceNo: `SUB-${sub.id}`, responseReference: sub.reference_no, submissionId: sub.id, formId: sub.form_id };
}

export function submissionSheetRow(student: Student, reg: Registration, app?: Application, sub?: FormSubmission) {
  return {
    ...(sub?.data || {}),
    ...(sub ? submissionSheetIdentity(sub) : { referenceNo: app?.application_no || reg.reference_no }),
    registrationRef: reg.reference_no,
    fullName: student.full_name, email: student.email, phone: student.phone,
    nic: student.nic, district: student.district, status: app?.status || reg.status,
    createdAt: sub?.created_at || app?.created_at || reg.created_at,
  };
}

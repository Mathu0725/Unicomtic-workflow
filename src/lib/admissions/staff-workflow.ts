import type { DatabaseStore } from "../data/store";

export function workflowOptions(db: DatabaseStore) {
  const students = new Map(db.students.map(student => [student.id, student]));
  return {
    campaigns: db.campaigns.map(campaign => ({ id: campaign.id, title: campaign.title, is_active: campaign.is_active })),
    candidates: db.registrations.filter(registration => registration.status !== "cancelled" && students.has(registration.student_id)).map(registration => {
      const student = students.get(registration.student_id)!;
      return { studentId: student.id, campaignId: registration.campaign_id, studentName: student.full_name, email: student.email, reference: registration.reference_no, utNumber: student.ut_number || "" };
    }),
  };
}

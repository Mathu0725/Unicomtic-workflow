import type { Application, Registration, Student } from "@/lib/data/store";

const DAY = 86_400_000;
const COLOMBO_OFFSET = 330 * 60_000;

function dayKey(time: number) {
  return new Date(time + COLOMBO_OFFSET).toISOString().slice(0, 10);
}

export function dashboardActivity(
  registrations: Pick<Registration, "created_at">[],
  applications: Pick<Application, "id" | "student_id" | "application_no" | "created_at" | "status">[],
  students: Pick<Student, "id" | "full_name">[],
  now = Date.now(),
) {
  const today = Math.floor((now + COLOMBO_OFFSET) / DAY) * DAY - COLOMBO_OFFSET;
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: dayKey(today - (6 - index) * DAY), registrations: 0, applications: 0,
  }));
  const byDay = new Map(days.map(day => [day.date, day]));
  for (const [records, key] of [[registrations, "registrations"], [applications, "applications"]] as const) {
    for (const record of records) {
      const timestamp = Date.parse(record.created_at);
      if (!Number.isFinite(timestamp) || timestamp > now) continue;
      const day = byDay.get(dayKey(timestamp));
      if (day) day[key]++;
    }
  }
  const studentNames = new Map(students.map(student => [student.id, student.full_name]));
  const recentApplications = applications
    .filter(application => Number.isFinite(Date.parse(application.created_at)) && Date.parse(application.created_at) <= now)
    .slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 5)
    .map(application => ({ id: application.id, reference: application.application_no,
      name: studentNames.get(application.student_id) || "Unknown applicant",
      createdAt: application.created_at, status: application.status }));
  return { days, recentApplications };
}

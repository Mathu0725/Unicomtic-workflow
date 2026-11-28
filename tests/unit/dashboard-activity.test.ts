import { expect, it } from "vitest";
import { dashboardActivity } from "../../src/lib/admissions/dashboard";

it("groups the last seven calendar days in Sri Lanka time and previews only the newest five applications", () => {
  const now = Date.parse("2026-11-25T18:45:00Z"); // 26 Nov, 00:15 in Sri Lanka
  const registrations = [
    { created_at: "2026-11-25T18:29:59Z" },
    { created_at: "2026-11-25T18:30:00Z" },
    { created_at: "2026-11-19T18:29:59Z" },
    { created_at: "2026-11-25T19:00:00Z" },
    { created_at: "invalid" },
  ];
  const applications = Array.from({ length: 6 }, (_, index) => ({
    id: String(index), student_id: "student", application_no: `APP-${index}`,
    created_at: `2026-11-25T18:${30 + index}:00Z`, status: "submitted" as const,
  }));
  const result = dashboardActivity(registrations, applications, [{ id: "student", full_name: "Test applicant" }], now);
  expect(result.days.map(day => day.date)).toEqual(["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]);
  expect(result.days.at(-2)?.registrations).toBe(1);
  expect(result.days.at(-1)).toMatchObject({ registrations: 1, applications: 6 });
  expect(result.days.reduce((sum, day) => sum + day.registrations, 0)).toBe(2);
  expect(result.recentApplications).toHaveLength(5);
  expect(result.recentApplications[0]).toMatchObject({ reference: "APP-5", name: "Test applicant" });
});

export const staffRoleOptions = [
  { value: "entrance_staff", label: "Entrance Desk", description: "Workshops, bookings, attendance and student IDs." },
  { value: "examiner", label: "Examiner", description: "Exams, marks import, eligibility and interviews." },
  { value: "admin", label: "Admissions Officer", description: "All admissions modules and system settings. Cannot create staff users." },
] as const;

export type ManagedStaffRole = typeof staffRoleOptions[number]["value"];

export function staffRoleLabel(role: string) {
  return role === "super_admin" ? "Super Admin" : staffRoleOptions.find(option => option.value === role)?.label || role;
}

export function staffHomePath(role: string) {
  if (role === "entrance_staff") return "/admin/attendance";
  if (role === "examiner") return "/admin/exams";
  return "/admin";
}

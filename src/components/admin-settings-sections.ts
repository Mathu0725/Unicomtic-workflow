import { FileSpreadsheet, Globe, History, Settings, Shield, ShieldAlert } from "lucide-react";

export const adminSettingsSections = [
  {
    name: "General & policy",
    href: "/admin/settings/general",
    icon: Settings,
    group: "Portal",
    description: "Institution details, admissions contact and application terms.",
  },
  {
    name: "Admin users & roles",
    href: "/admin/users",
    icon: Shield,
    group: "Portal",
    description: "Review staff accounts, roles and access permissions.",
  },
  {
    name: "Google integrations",
    href: "/admin/google-integrations",
    icon: Globe,
    group: "Connections",
    description: "Connect Google Drive for student documents, Sheets and Gmail.",
  },
  {
    name: "Sheets synchronization",
    href: "/admin/sheets-sync",
    icon: FileSpreadsheet,
    group: "Connections",
    description: "Manage spreadsheet mappings and review synchronization jobs.",
  },
  {
    name: "Audit logs",
    href: "/admin/audit-logs",
    icon: History,
    group: "Monitoring",
    description: "Review changes and activity across the admissions portal.",
  },
  {
    name: "System health",
    href: "/admin/diagnostics",
    icon: ShieldAlert,
    group: "Monitoring",
    description: "Check notification workers, queued jobs and system incidents.",
  },
] as const;

export function getAdminSettingsSection(pathname: string) {
  return adminSettingsSections.find(section => pathname === section.href || pathname.startsWith(`${section.href}/`));
}

export function isAdminSettingsRoute(pathname: string) {
  return pathname === "/admin/settings" || pathname.startsWith("/admin/settings/") || Boolean(getAdminSettingsSection(pathname));
}

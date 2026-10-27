import type { CustomForm } from "../data/store";
import type { Integrations } from "../data/types";

export function formSheetTarget(
  integrations: Integrations,
  form?: Pick<CustomForm, "type" | "google_sheets_config">,
  type = form?.type === "application" ? "applications" : "registrations",
) {
  const override = form?.google_sheets_config;
  const applications = type === "applications";
  const sheetId = override?.enabled
    ? override.sheet_id
    : applications ? integrations.application_sheet_id : integrations.registration_sheet_id;
  if (!sheetId?.trim()) return null;
  return {
    enabled: true,
    sheet_id: sheetId.trim(),
    sheet_name: override?.enabled ? override.sheet_name : applications ? "Applications" : "Registrations",
    auto_sync: override?.enabled ? override.auto_sync : true,
    source: override?.enabled ? "form" : "admissions",
  };
}

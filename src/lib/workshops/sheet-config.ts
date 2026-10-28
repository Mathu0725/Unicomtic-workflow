import type { DatabaseStore, Workshop } from "../data/store";
import { formSheetTarget } from "../google/sheet-target";

export const sheetTabKey = (value: string) =>
  value.trim().normalize("NFC").toLowerCase();
const id = (value: string) =>
  value.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || value.trim();
export function workshopSheetTarget(
  workshop?: Pick<Workshop, "google_sheets_config">,
) {
  const config = workshop?.google_sheets_config;
  return config?.enabled && config.sheet_id.trim() && config.sheet_name.trim()
    ? config
    : null;
}
export function suggestedWorkshopTab(workshop: Pick<Workshop, "title" | "id">) {
  const title =
    workshop.title
      .replace(/[\[\]:*?/\\'\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 65) || "Workshop";
  return `${title} - ${workshop.id.slice(0, 8)}`;
}
export function workshopTabReserved(
  db: DatabaseStore,
  sheetId: string,
  sheetName: string,
  exceptId?: string,
) {
  return db.workshops.some(
    (workshop) =>
      workshop.id !== exceptId &&
      workshop.google_sheets_config?.sheet_id &&
      id(workshop.google_sheets_config.sheet_id) === id(sheetId) &&
      sheetTabKey(workshop.google_sheets_config.sheet_name) ===
        sheetTabKey(sheetName),
  );
}
export function workshopDestinationProblem(
  db: DatabaseStore,
  workshopId: string,
  sheetId: string,
  sheetName: string,
) {
  if (workshopTabReserved(db, sheetId, sheetName, workshopId))
    return "Another workshop already uses this tab. Choose a separate tab for this workshop.";
  const targets = [
    formSheetTarget(db.integrations, undefined, "registrations"),
    formSheetTarget(db.integrations, undefined, "applications"),
    ...db.customForms.map((form) => formSheetTarget(db.integrations, form)),
  ];
  if (
    targets.some(
      (target) =>
        target &&
        id(target.sheet_id) === id(sheetId) &&
        sheetTabKey(target.sheet_name) === sheetTabKey(sheetName),
    )
  )
    return "This tab is used for form responses. Choose a separate workshop tab.";
  return "";
}

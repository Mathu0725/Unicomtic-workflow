import type { DatabaseStore, WorkshopFormConfig } from "../data/store";
/** The legacy URLs use their intake's published admissions form settings. */
export function legacyWorkshopConfig(
  db: DatabaseStore,
  campaignId: string,
  type: "registration" | "application",
): WorkshopFormConfig | undefined {
  const form = db.customForms.find(
    (f) =>
      f.campaign_id === campaignId &&
      f.type === type &&
      f.is_active &&
      (!f.status || f.status === "published"),
  );
  return form?.workshop_config;
}

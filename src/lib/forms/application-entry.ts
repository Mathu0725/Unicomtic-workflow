import type { CustomForm, DatabaseStore } from "../data/store";
import { formAvailabilityProblem } from "./field-rules";

export function openApplicationForReference(
  db: Pick<DatabaseStore, "customForms" | "registrations">,
  reference?: string,
): CustomForm | undefined {
  const openForms = db.customForms.filter(
    (form) =>
      form.type === "application" &&
      form.application_mode === "open" &&
      !formAvailabilityProblem(form),
  );
  const normalizedReference = reference?.trim().toUpperCase();
  const registration = normalizedReference
    ? db.registrations.find(
        (item) =>
          item.reference_no.toUpperCase() === normalizedReference &&
          item.status !== "cancelled",
      )
    : undefined;

  if (registration) {
    const matchingForms = openForms.filter(
      (form) => form.campaign_id === registration.campaign_id,
    );
    return matchingForms.length === 1 ? matchingForms[0] : undefined;
  }

  return openForms.length === 1 ? openForms[0] : undefined;
}

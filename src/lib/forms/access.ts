import type { CustomForm } from "../data/store";

export function formRequiresCandidateAccess(
  form: Pick<CustomForm, "type" | "application_mode">,
) {
  return (
    form.type === "workshop_rsvp" ||
    (form.type === "application" && form.application_mode !== "open")
  );
}

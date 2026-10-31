import type { CustomForm } from "../data/store";
import { formHasPublicKey } from "./public-links";

export function formRequiresCandidateAccess(
  form: Pick<CustomForm, "type" | "application_mode">,
) {
  return form.type === "workshop_rsvp" ||
    (form.type === "application" && form.application_mode !== "open");
}

export function candidateSessionAllowsForm(
  form: Pick<CustomForm, "id" | "slug" | "previous_slugs" | "type">,
  claims: { purpose: string; destination?: string },
) {
  if (form.type !== "workshop_rsvp") return true;
  const key = /^\/form\/([a-z0-9-]+)$/.exec(claims.destination || "")?.[1];
  return claims.purpose === "apply" && !!key && formHasPublicKey(form, key);
}

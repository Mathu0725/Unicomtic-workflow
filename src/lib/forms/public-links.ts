import type { CustomForm, DatabaseStore } from "../data/store";

export function formSlugProblem(value: string) {
  if (!value || value.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    return "Use 1–100 lowercase letters, numbers and single hyphens, such as tic-2027-registration.";
  return "";
}

export function formHasPublicKey(form: CustomForm, key: string) {
  return form.id === key || form.slug === key || form.previous_slugs?.includes(key) === true;
}

export function findPublicForm(db: Pick<DatabaseStore, "customForms">, key: string) {
  return db.customForms.find(form => formHasPublicKey(form, key));
}

export function formLinkTaken(forms: CustomForm[], slug: string, exceptId?: string) {
  return forms.some(form => form.id !== exceptId && formHasPublicKey(form, slug));
}

export function uniqueFormSlug(forms: CustomForm[], title: string) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 91).replace(/-$/, "") || "form";
  let slug: string;
  do { slug = `${base}-${crypto.randomUUID().slice(0, 8)}`; } while (formLinkTaken(forms, slug));
  return slug;
}

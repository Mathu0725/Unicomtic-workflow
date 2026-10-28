import type { CustomForm, FormField } from "../data/store";
import { resolveFormMessageDisplay, resolveFormMessages } from "./messages";
import { fieldIdentityKeys, identityKeys } from "./field-rules";

export const editableFormKeys = [
  "title",
  "description",
  "description_rich",
  "slug",
  "status",
  "is_active",
  "fields",
  "google_sheets_config",
  "google_form_config",
  "workshop_config",
  "email_automation",
  "confirmation_message",
  "redirect_url",
  "messages",
  "message_display",
  "starts_at",
  "closes_at",
  "submission_limit",
] as const;
export type FormEditorValues = Pick<
  CustomForm,
  (typeof editableFormKeys)[number]
>;
export interface FormEditorDraft {
  version: string;
  base_updated_at: string;
  values: FormEditorValues;
}

export function editorValues(form: CustomForm): FormEditorValues {
  const result = Object.fromEntries(
    editableFormKeys.map((key) => [key, form[key]]),
  ) as FormEditorValues;
  if (result.google_form_config) {
    const { webhook_secret: _secret, ...config } = result.google_form_config;
    result.google_form_config = config;
  }
  return structuredClone({
    ...result,
    status: form.status || (form.is_active ? "published" : "closed"),
    messages: resolveFormMessages(form.messages),
    message_display: resolveFormMessageDisplay(form.message_display),
  });
}

export const fieldLibrary: {
  type: FormField["type"];
  label: string;
  group: string;
}[] = [
  { type: "text", label: "Short answer", group: "Questions" },
  { type: "textarea", label: "Long answer", group: "Questions" },
  { type: "select", label: "Dropdown", group: "Questions" },
  { type: "radio", label: "Single choice", group: "Questions" },
  { type: "checkbox", label: "Multiple choice", group: "Questions" },
  { type: "number", label: "Number", group: "Questions" },
  { type: "email", label: "Email address", group: "Applicant details" },
  { type: "phone", label: "Mobile phone", group: "Applicant details" },
  { type: "nic", label: "NIC number", group: "Applicant details" },
  { type: "district", label: "District", group: "Applicant details" },
  { type: "date", label: "Date", group: "More fields" },
  { type: "time", label: "Time", group: "More fields" },
  { type: "datetime", label: "Date and time", group: "More fields" },
  { type: "url", label: "Website", group: "More fields" },
  { type: "file", label: "Document upload", group: "More fields" },
  { type: "terms", label: "Consent", group: "More fields" },
  { type: "section", label: "Section heading", group: "More fields" },
];
export function newFormField(
  type: FormField["type"],
  existing?: FormField[],
): FormField {
  const systemKey =
    existing &&
    ["email", "phone", "nic", "district"].includes(type) &&
    !existing.some((field) => fieldIdentityKeys(field).includes(type))
      ? type
      : undefined;
  return {
    id: `fld_${crypto.randomUUID().replaceAll("-", "")}`,
    type,
    label: fieldLibrary.find((item) => item.type === type)?.label || "Question",
    required: Boolean(systemKey && identityKeys.includes(systemKey)),
    ...(systemKey ? { systemKey } : {}),
    ...(["select", "radio", "checkbox"].includes(type)
      ? { options: ["Option 1", "Option 2"] }
      : {}),
    ...(type === "file" ? { helpText: "PDF, JPG or PNG · maximum 4 MB." } : {}),
  };
}
export function duplicateFormField(field: FormField): FormField {
  const copy = {
    ...structuredClone(field),
    id: newFormField(field.type).id,
    label: `${field.label} (copy)`,
  };
  delete copy.systemKey;
  return copy;
}
export function reorderFormFields(
  fields: FormField[],
  source: string,
  target: string,
) {
  const from = fields.findIndex((field) => field.id === source),
    to = fields.findIndex((field) => field.id === target);
  if (from < 0 || to < 0 || from === to) return fields;
  const result = [...fields],
    [field] = result.splice(from, 1);
  result.splice(to, 0, field);
  return result;
}
export interface EditorHistory {
  past: FormEditorValues[];
  present: FormEditorValues;
  future: FormEditorValues[];
}
export function editorHistory(
  state: EditorHistory,
  action:
    | { type: "change" | "reset"; values: FormEditorValues; coalesce?: boolean }
    | { type: "undo" | "redo" },
): EditorHistory {
  if (action.type === "reset")
    return { past: [], present: action.values, future: [] };
  if (action.type === "change") {
    if (JSON.stringify(state.present) === JSON.stringify(action.values))
      return state;
    return {
      past: action.coalesce
        ? state.past
        : [...state.past, state.present].slice(-60),
      present: action.values,
      future: [],
    };
  }
  if (action.type === "undo" && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  return state;
}

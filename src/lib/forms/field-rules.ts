import type { CustomForm, FormField } from "../data/store";

export const identityKeys = ["fullName", "email", "nic", "phone"];
export const choiceTypes = ["select", "radio", "checkbox"];
export function defaultFormAnswers(
  fields: FormField[],
): Record<string, string | number | boolean | string[]> {
  return Object.fromEntries(
    fields
      .filter((field) => field.type !== "section")
      .map((field) => [
        field.id,
        field.type === "terms"
          ? false
          : field.type === "file"
            ? ""
            : (field.defaultValue ??
              (field.type === "checkbox"
                ? []
                : field.type === "district"
                  ? "Colombo"
                  : field.type === "select"
                    ? field.options?.[0] || ""
                    : "")),
      ]),
  );
}
export function fieldIdentityKeys(field: FormField): string[] {
  // Submission keeps the original answer ID and also writes its system alias.
  return [
    ...new Set([field.id, ...(field.systemKey ? [field.systemKey] : [])]),
  ];
}

export function visibleFormFields(
  fields: FormField[],
  answers: Record<string, unknown>,
) {
  const visible = new Set<string>();
  let sectionVisible = true;
  for (const field of fields) {
    const rule = field.visibility;
    let show = true;
    if (rule) {
      const answer = answers[rule.field_id],
        expected = rule.value || "";
      const empty =
        answer === undefined ||
        answer === null ||
        answer === "" ||
        (Array.isArray(answer) && answer.length === 0);
      const text = String(answer ?? "");
      show =
        visible.has(rule.field_id) &&
        {
          equals: text === expected,
          not_equals: text !== expected,
          contains: Array.isArray(answer)
            ? answer.includes(expected)
            : text.includes(expected),
          empty,
          not_empty: !empty,
          greater:
            !empty &&
            Number.isFinite(Number(answer)) &&
            Number(answer) > Number(expected),
          less:
            !empty &&
            Number.isFinite(Number(answer)) &&
            Number(answer) < Number(expected),
        }[rule.operator];
    }
    if (field.type === "section") sectionVisible = show;
    if (show && sectionVisible) visible.add(field.id);
  }
  return visible;
}

export function fieldConfigurationProblem(
  fields: FormField[],
): string | undefined {
  const seen = new Set<string>(),
    mapped = new Set<string>();
  let conditionalSection = false;
  for (const field of fields) {
    if (
      choiceTypes.includes(field.type) &&
      (!field.options?.length ||
        field.options.some((option) => !option.trim()) ||
        new Set(field.options.map((option) => option.trim().toLowerCase()))
          .size !== field.options.length)
    )
      return `${field.label}: add distinct, non-empty choices.`;
    if (
      field.visibility &&
      (!seen.has(field.visibility.field_id) ||
        fields.find((f) => f.id === field.visibility!.field_id)?.type ===
          "section")
    )
      return `${field.label}: a visibility rule must use an earlier question. Move the question or change its rule.`;
    if (
      field.visibility &&
      ["greater", "less"].includes(field.visibility.operator) &&
      (!field.visibility.value?.trim() ||
        !Number.isFinite(Number(field.visibility.value)))
    )
      return `${field.label}: enter a numeric value for this visibility rule.`;
    if (
      choiceTypes.includes(field.type) &&
      field.defaultValue !== undefined &&
      field.defaultValue !== "" &&
      (Array.isArray(field.defaultValue)
        ? field.defaultValue
        : [field.defaultValue]
      ).some((value) => !field.options?.includes(String(value)))
    )
      return `${field.label}: the default answer must match its choices.`;
    if (field.type === "section")
      conditionalSection = Boolean(field.visibility);
    const keys = fieldIdentityKeys(field).filter((key) =>
      identityKeys.includes(key),
    );
    if (keys.length > 1)
      return `${field.label}: use separate questions for different admissions identity fields.`;
    for (const key of keys) {
      if (mapped.has(key))
        return `${field.label}: each admissions identity field can only be mapped once.`;
      if (["file", "section", "checkbox", "terms"].includes(field.type))
        return `${field.label}: use a text or identity question for admissions details.`;
      mapped.add(key);
    }
    if (keys.length > 0 && (field.visibility || conditionalSection))
      return `${field.label}: admissions identity questions must always be visible.`;
    if (
      field.minLength !== undefined &&
      field.maxLength !== undefined &&
      field.minLength > field.maxLength
    )
      return `${field.label}: minimum length exceeds maximum length.`;
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    )
      return `${field.label}: minimum value exceeds maximum value.`;
    if (
      field.minSelections !== undefined &&
      field.maxSelections !== undefined &&
      field.minSelections > field.maxSelections
    )
      return `${field.label}: minimum selections exceeds maximum selections.`;
    seen.add(field.id);
  }
}

export function formAvailabilityProblem(
  form: Pick<
    CustomForm,
    | "is_active"
    | "starts_at"
    | "closes_at"
    | "submission_limit"
    | "submissions_count"
  >,
  count = form.submissions_count,
): string | undefined {
  if (!form.is_active) return "This form is closed.";
  if (form.starts_at && Date.parse(form.starts_at) > Date.now())
    return "This form has not opened yet.";
  if (form.closes_at && Date.parse(form.closes_at) <= Date.now())
    return "This form is closed.";
  if (form.submission_limit && count >= form.submission_limit)
    return "This form has reached its response limit.";
}

export function extraAnswerProblem(
  field: FormField,
  value: unknown,
): string | undefined {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    field.type === "section"
  )
    return;
  const text = String(value);
  if (field.minLength !== undefined && text.trim().length < field.minLength)
    return `Use at least ${field.minLength} characters.`;
  if (field.maxLength !== undefined && text.length > field.maxLength)
    return `Use at most ${field.maxLength} characters.`;
  if (
    field.type === "number" &&
    field.min !== undefined &&
    Number(value) < field.min
  )
    return `Enter ${field.min} or more.`;
  if (
    field.type === "number" &&
    field.max !== undefined &&
    Number(value) > field.max
  )
    return `Enter ${field.max} or less.`;
  if (field.type === "url") {
    try {
      if (!["http:", "https:"].includes(new URL(text).protocol))
        return "Enter a valid website URL.";
    } catch {
      return "Enter a valid website URL.";
    }
  }
  if (field.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text))
    return "Enter a valid time.";
  if (field.type === "datetime" && !Number.isFinite(Date.parse(text)))
    return "Enter a valid date and time.";
  if (field.type === "checkbox") {
    if (!Array.isArray(value)) return "Select valid choices.";
    if (
      new Set(value).size !== value.length ||
      value.some((item) => !field.options?.includes(String(item)))
    )
      return "Select valid choices.";
    if (field.minSelections !== undefined && value.length < field.minSelections)
      return `Select at least ${field.minSelections} choices.`;
    if (field.maxSelections !== undefined && value.length > field.maxSelections)
      return `Select at most ${field.maxSelections} choices.`;
  }
}

export function uniqueAnswer(value: unknown) {
  return Array.isArray(value)
    ? JSON.stringify(
        value.map((item) => String(item).trim().toLowerCase()).sort(),
      )
    : String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

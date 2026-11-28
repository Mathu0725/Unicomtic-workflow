import type { FormField, FormSubmission } from "../data/store";

export type FormResponseColumn = {
  id: string;
  label: string;
  systemKey?: string;
};

/** Build columns from questions, never from internal submission properties. */
export function formResponseColumns(fields: FormField[], submissions: FormSubmission[]): FormResponseColumn[] {
  const columns: FormResponseColumn[] = [];
  const seenIds = new Set<string>();
  const usedLabels = new Set(["submitted at", "status"]);
  const excludedIds = new Set(fields.filter(field => field.type === "terms" || field.type === "section").map(field => field.id));
  const systemAliases = new Set(fields.flatMap(field => field.systemKey && field.systemKey !== field.id ? [field.systemKey] : []));
  const add = (id: string, rawLabel: string, systemKey?: string) => {
    if (!id || seenIds.has(id) || excludedIds.has(id)) return;
    seenIds.add(id);
    const base = rawLabel.trim() || "Question";
    let label = base, suffix = 2;
    while (usedLabels.has(label.toLocaleLowerCase())) label = `${base} (${suffix++})`;
    usedLabels.add(label.toLocaleLowerCase());
    columns.push({ id, label, ...(systemKey ? { systemKey } : {}) });
  };
  for (const field of fields) {
    if (!excludedIds.has(field.id)) add(field.id, field.label, field.systemKey);
  }
  // Preserve answers to questions removed from the current form when the
  // original submission recorded their labels.
  for (const submission of submissions) {
    for (const [id, label] of Object.entries(submission.field_labels || {})) {
      if (typeof label === "string" && !systemAliases.has(id)) add(id, label);
    }
  }
  return columns;
}

export function formResponseAnswers(columns: FormResponseColumn[], submission: FormSubmission): unknown[] {
  return columns.map(column => submission.data[column.id] ?? (column.systemKey ? submission.data[column.systemKey] : undefined) ?? "");
}

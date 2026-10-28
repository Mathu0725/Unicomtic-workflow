import type { FormField, FormSubmission } from "../data/store";
const csvCell = (input: unknown) => {
  let value =
    input === null || input === undefined
      ? ""
      : typeof input === "object"
        ? JSON.stringify(input)
        : String(input);
  if (/^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value))
    value = "'" + value;
  return `"${value.replaceAll('"', '""')}"`;
};
export function responseCsv(
  fields: FormField[],
  submissions: FormSubmission[],
) {
  const keys = [
    ...new Set([
      ...fields
        .filter((field) => field.type !== "section")
        .map((field) => field.id),
      ...submissions.flatMap((submission) => Object.keys(submission.data)),
    ]),
  ];
  const label = (key: string) =>
    fields.find((field) => field.id === key)?.label ||
    submissions.find((submission) => submission.field_labels?.[key])
      ?.field_labels?.[key] ||
    key;
  return (
    "\uFEFF" +
    [
      ["Reference No", "Submitted Date", ...keys.map(label)],
      ...submissions.map((submission) => [
        submission.reference_no,
        submission.created_at,
        ...keys.map((key) => submission.data[key]),
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}

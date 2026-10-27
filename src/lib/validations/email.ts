import { z } from "zod";

const emailSyntax = z.string().max(254).email();
// These unassigned suffixes are common .com typing mistakes. Valid country
// domains such as .co, .cm and .om must remain accepted.
const comTypos = new Set(["con", "comm", "cmo", "comn", "cpm"]);
export function emailValidationMessage(value: unknown): string | undefined {
  if (typeof value !== "string" || !emailSyntax.safeParse(value.trim()).success) return "Enter a valid email address, for example name@example.com.";
  const email = value.trim().toLowerCase(), suffix = email.split(".").at(-1)!;
  if (comTypos.has(suffix)) return `Email ends in .${suffix}. Check the spelling; did you mean ${email.slice(0, -suffix.length)}com?`;
}
export const candidateEmailSchema = z.string().trim().toLowerCase().superRefine((value, context) => {
  const message = emailValidationMessage(value);
  if (message) context.addIssue({ code: z.ZodIssueCode.custom, message });
});

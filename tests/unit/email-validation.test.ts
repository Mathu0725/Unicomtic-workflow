import { expect, it } from "vitest";
import { candidateEmailSchema, emailValidationMessage } from "../../src/lib/validations/email";

it.each(["person@gmail.con", "person@example.comm", "person@example.cmo", "PERSON@EXAMPLE.CON", "person@example.comn", "person@example.cpm"])("rejects the common email suffix typo %s and suggests a correction", email => {
  expect(candidateEmailSchema.safeParse(email).success).toBe(false);
  expect(emailValidationMessage(email)).toContain("did you mean");
});
it.each(["person@gmail.com", "person@example.lk", "person@school.ac.lk", "person@example.co.uk", "person@sub.example.org", "person+admissions@example.dev", "person@example.co", "person@example.cm", "person@example.om"])("allows valid email domains including %s", email => {
  expect(candidateEmailSchema.safeParse(email).success).toBe(true);
});
it.each(["bad", "a@", "a@localhost", "a b@example.com", "a..b@example.com", "a@-example.com", "a@example.com,second@example.com", "a@example.com\nBcc: x@example.com", "a".repeat(245) + "@example.com"])("rejects malformed or oversized email %s", email => {
  expect(candidateEmailSchema.safeParse(email).success).toBe(false);
});
it("trims and normalizes email without silently fixing its domain", () => {
  expect(candidateEmailSchema.parse(" PERSON@EXAMPLE.COM ")).toBe("person@example.com");
  expect(candidateEmailSchema.safeParse(" PERSON@EXAMPLE.CON ").success).toBe(false);
});

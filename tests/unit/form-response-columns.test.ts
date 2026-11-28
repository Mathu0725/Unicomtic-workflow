import { expect, it } from "vitest";
import { formResponseAnswers, formResponseColumns } from "../../src/lib/google/form-response-columns";

it("exports each question once with readable labels, excluding internal aliases and consent", () => {
  const fields = [
    { id: "fullName", type: "text", label: "Full Name", required: true },
    { id: "fld_nic", type: "nic", label: "NIC number", systemKey: "nic", required: true },
    { id: "phone", type: "phone", label: "Mobile Number", required: true },
    { id: "email", type: "email", label: "Email Address", required: true },
    { id: "fld_district", type: "district", label: "District", systemKey: "district", required: true },
    { id: "terms", type: "terms", label: "Terms", required: true },
  ] as any;
  const submission = { data: { fullName: "Example", fld_nic: "123", nic: "123", phone: "077", email: "test@example.com", fld_district: "Jaffna", district: "Jaffna", terms: true, internal: "not a question" }, field_labels: { fld_nic: "NIC number", nic: "NIC number", district: "District", terms: "Terms" } } as any;
  const columns = formResponseColumns(fields, [submission]);
  expect(columns.map(column => column.label)).toEqual(["Full Name", "NIC number", "Mobile Number", "Email Address", "District"]);
  expect(formResponseAnswers(columns, submission)).toEqual(["Example", "123", "077", "test@example.com", "Jaffna"]);
});

it("keeps historical question labels and distinguishes duplicate or reserved labels", () => {
  const fields = [{ id: "a", type: "text", label: "Status", required: false }, { id: "b", type: "text", label: "Status", required: false }] as any;
  const submission = { data: { a: "First", b: "Second", old: "Earlier" }, field_labels: { a: "Status", b: "Status", old: "Old question" } } as any;
  const columns = formResponseColumns(fields, [submission]);
  expect(columns.map(column => column.label)).toEqual(["Status (2)", "Status (3)", "Old question"]);
  expect(formResponseAnswers(columns, submission)).toEqual(["First", "Second", "Earlier"]);
});

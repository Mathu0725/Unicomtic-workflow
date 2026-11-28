import { beforeEach, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/google/oauth", () => ({ googleRequest: request }));
import { syncFormResponses } from "../../src/lib/google/form-response-sync";

const form = { id: "form-1", fields: [
  { id: "name", type: "text", label: "Full Name" },
  { id: "fld_nic", type: "nic", label: "NIC number", systemKey: "nic" },
  { id: "phone", type: "phone", label: "Mobile Number" },
  { id: "email", type: "email", label: "Email Address" },
  { id: "fld_district", type: "district", label: "District", systemKey: "district" },
  { id: "terms", type: "terms", label: "Terms" },
] } as any;
const submission = { id: "response-1", form_id: form.id, registration_id: "reg-1", created_at: "2026-01-01T10:00:00Z", data: { name: "Example", fld_nic: "123", nic: "123", phone: "077", email: "test@example.com", fld_district: "Jaffna", district: "Jaffna", terms: true } } as any;
const db = { formSubmissions: [submission], registrations: [{ id: "reg-1", status: "registered" }], applications: [] } as any;
const sheet = { sheets: [{ properties: { sheetId: 123, title: "Responses", gridProperties: { rowCount: 1000, columnCount: 26 } } }] };
const metadata = (metadataKey: string, metadataValue: string, dimension?: string, startIndex?: number) => ({ developerMetadata: { metadataKey, metadataValue, location: dimension ? { dimensionRange: { sheetId: 123, dimension, startIndex, endIndex: startIndex! + 1 } } : { sheetId: 123 } } });
function setup(values: string[][], matchedDeveloperMetadata: unknown[] = [], notes: string[] = []) {
  request.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.includes("?fields=")) return sheet;
    if (url.includes("?ranges=")) return { sheets: [{ data: [{ rowData: notes.map(note => ({ values: [{ note }] })) }] }] };
    if (url.includes("/developerMetadata:search")) return { matchedDeveloperMetadata };
    if (!options && url.includes("/values/")) return { values };
    return {};
  });
}
beforeEach(() => { request.mockReset(); });

it("writes only question columns, submission time and status, with row identity in a cell note", async () => {
  setup([]);
  const result = await syncFormResponses(db, form, [submission], "sheet-1", "Responses");
  expect(result).toMatchObject({ success: true, syncedCount: 1 });
  const write = request.mock.calls.find(([url]) => url.endsWith(":batchUpdate"));
  const requests = JSON.parse(write![1].body).requests;
  const cells = requests.filter((item: any) => item.updateCells).map((item: any) => ({ ...item.updateCells.start, value: item.updateCells.rows[0].values[0].userEnteredValue.stringValue }));
  expect(cells.filter((item: any) => item.rowIndex === 0).map((item: any) => item.value)).toEqual(["Full Name", "NIC number", "Mobile Number", "Email Address", "District", "Submitted at", "Status"]);
  expect(cells.filter((item: any) => item.rowIndex === 1).map((item: any) => item.value)).toEqual(["Example", "123", "077", "test@example.com", "Jaffna", "2026-01-01T10:00:00Z", "registered"]);
  expect(cells.some((item: any) => item.value === "response-1" || item.value === "fld_nic")).toBe(false);
  expect(requests.some((item: any) => item.updateCells?.rows?.[0]?.values?.[0]?.note === "UTICX_RESPONSE:response-1")).toBe(true);
});

it("reconciles a retry to the same row without adding a duplicate identity", async () => {
  const cols = ["q:name", "q:fld_nic", "q:phone", "q:email", "q:fld_district", "sys:createdAt", "sys:status"];
  setup([["Full Name", "NIC number", "Mobile Number", "Email Address", "District", "Submitted at", "Status"], ["Old name", "123", "077", "test@example.com", "Jaffna", "2026-01-01T10:00:00Z", "registered"]], [metadata("UTICX_FORM", "form-1"), ...cols.map((value, index) => metadata("UTICX_COLUMN", value, "COLUMNS", index)), metadata("UTICX_ANCHOR", "response-note", "COLUMNS", 0)], ["", "UTICX_RESPONSE:response-1"]);
  expect((await syncFormResponses(db, form, [submission, submission], "sheet-1", "Responses")).syncedCount).toBe(1);
  const requests = JSON.parse(request.mock.calls.find(([url]) => url.endsWith(":batchUpdate"))![1].body).requests;
  expect(requests.some((item: any) => item.createDeveloperMetadata)).toBe(false);
  expect(requests.filter((item: any) => item.updateCells?.start.rowIndex === 1)).toHaveLength(7);
});

it("never overwrites an existing legacy worksheet or a different form", async () => {
  setup([["referenceNo", "fullName"], ["REG-1", "Keep"]]);
  expect(await syncFormResponses(db, form, [submission], "sheet-1", "Responses")).toMatchObject({ success: false, errorCode: "FORM_SHEET_CONFLICT" });
  expect(request.mock.calls.some(([url]) => url.endsWith(":batchUpdate"))).toBe(false);
  request.mockReset();
  setup([], [metadata("UTICX_FORM", "another-form")]);
  expect(await syncFormResponses(db, form, [submission], "sheet-1", "Responses")).toMatchObject({ success: false, errorCode: "FORM_SHEET_CONFLICT" });
  expect(request.mock.calls.some(([url]) => url.endsWith(":batchUpdate"))).toBe(false);
});

it("keeps 3,000 existing response IDs out of the limited developer metadata allocation", async () => {
  const cols = ["q:name", "q:fld_nic", "q:phone", "q:email", "q:fld_district", "sys:createdAt", "sys:status"];
  const values = [["Full Name", "NIC number", "Mobile Number", "Email Address", "District", "Submitted at", "Status"], ...Array.from({ length: 3000 }, (_, i) => [`Person ${i}`])];
  const notes = ["", ...Array.from({ length: 3000 }, (_, i) => `UTICX_RESPONSE:existing-${i}`)];
  setup(values, [metadata("UTICX_FORM", "form-1"), ...cols.map((value, index) => metadata("UTICX_COLUMN", value, "COLUMNS", index)), metadata("UTICX_ANCHOR", "response-note", "COLUMNS", 0)], notes);
  const result = await syncFormResponses(db, form, [submission], "sheet-1", "Responses");
  expect(result.success).toBe(true);
  const requests = JSON.parse(request.mock.calls.find(([url]) => url.endsWith(":batchUpdate"))![1].body).requests;
  expect(requests.some((item: any) => item.createDeveloperMetadata)).toBe(false);
  expect(requests.some((item: any) => item.updateCells?.start.rowIndex === 3001 && item.updateCells.rows[0].values[0].note === "UTICX_RESPONSE:response-1")).toBe(true);
});

it("stops before writing if a previously exported row has lost its identity note", async () => {
  const cols = ["q:name", "q:fld_nic", "q:phone", "q:email", "q:fld_district", "sys:createdAt", "sys:status"];
  setup([["Full Name"], ["A row to preserve"]], [metadata("UTICX_FORM", "form-1"), ...cols.map((value, index) => metadata("UTICX_COLUMN", value, "COLUMNS", index)), metadata("UTICX_ANCHOR", "response-note", "COLUMNS", 0)], ["", ""]);
  expect(await syncFormResponses(db, form, [submission], "sheet-1", "Responses")).toMatchObject({ success: false, errorCode: "FORM_SHEET_CONFLICT" });
  expect(request.mock.calls.some(([url]) => url.endsWith(":batchUpdate"))).toBe(false);
});

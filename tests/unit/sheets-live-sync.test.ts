import { beforeEach, describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/google/oauth", () => ({ googleRequest: request }));
import { GoogleSheetsService } from "../../src/lib/google/sheets-service";
import { ProviderError } from "../../src/lib/errors/provider-error";
beforeEach(() => { request.mockReset(); });
describe("Google Sheets reference reconciliation", () => {
    it("updates an existing reference instead of appending a duplicate row", async () => {
        request.mockResolvedValueOnce({ sheets: [{ properties: { title: "Registrations" } }] }).mockResolvedValueOnce({ values: [["referenceNo", "fullName"], ["REG-123", "Old name"]] }).mockResolvedValue({});
        const result = await new GoogleSheetsService().syncRecords("sheet123", "registrations", [{ referenceNo: "REG-123", fullName: "Updated name" }]);
        expect(result.success).toBe(true);
        expect(request.mock.calls.some(([url]) => url.includes(":append"))).toBe(false);
        const update = request.mock.calls.find(([url]) => url.includes("values:batchUpdate"));
        expect(JSON.parse(update![1].body).data).toContainEqual({ range: "'Registrations'!A2", values: [["REG-123", "Updated name"]] });
    });
    it("does not mark failed Google writes as successful", async () => {
        request.mockRejectedValue(new ProviderError("GOOGLE_ACCESS_DENIED", "Google permission denied. Review sharing permissions.", "blocked"));
        const result = await new GoogleSheetsService().syncRecords("sheet123", "registrations", [{ referenceNo: "REG-1" }]);
        expect(result.success).toBe(false);
        expect(result.syncedCount).toBe(0);
        expect(result.error).toContain("permission denied");
        expect(result.failureKind).toBe("blocked");
    });
    it("deduplicates a batch and writes formula-like answers as RAW values", async () => {
        request.mockResolvedValueOnce({ sheets: [{ properties: { title: "Registrations" } }] }).mockResolvedValueOnce({ values: [] }).mockResolvedValue({});
        await new GoogleSheetsService().syncRecords("sheet123", "registrations", [{ referenceNo: "REG-1", answer: "=1+2" }, { referenceNo: "REG-1", answer: "=2+3" }]);
        const append = request.mock.calls.find(([url]) => url.includes(":append"));
        expect(append![0]).toContain("valueInputOption=RAW");
        expect(JSON.parse(append![1].body).values).toHaveLength(1);
    });
});

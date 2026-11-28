import { beforeEach, describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/google/oauth", () => ({ googleRequest: request }));
import { GoogleSheetsService } from "../../src/lib/google/sheets-service";
import { ProviderError } from "../../src/lib/errors/provider-error";
beforeEach(() => { request.mockReset(); });
describe("Google Sheets reference reconciliation", () => {
    it("updates a manually connected workshop row's mail status and keeps staff notes while adding only new bookings", async () => {
        request.mockResolvedValueOnce({ sheets: [{ properties: { title: "Workshop 1" } }] })
            .mockResolvedValueOnce({ values: [
                ["referenceNo", "bookingId", "workshopId", "workshopTitle", "emailStatus", "emailsAccepted", "staffNotes"],
                ["booking-1", "booking-1", "workshop-1", "Workshop 1", "queued", "0", "Call after 5"],
            ] }).mockResolvedValue({});
        const result = await new GoogleSheetsService().syncWorkshopBookings("sheet123", "Workshop 1", "workshop-1", [
            { referenceNo: "booking-1", bookingId: "booking-1", workshopId: "workshop-1", workshopTitle: "Workshop 1", emailStatus: "sent", emailsAccepted: 1 },
            { referenceNo: "booking-2", bookingId: "booking-2", workshopId: "workshop-1", workshopTitle: "Workshop 1", emailStatus: "not_sent", emailsAccepted: 0 },
        ]);
        expect(result.success).toBe(true);
        const update = request.mock.calls.find(([url]) => url.includes("values:batchUpdate"));
        expect(JSON.parse(update![1].body).data).toContainEqual({
            range: "'Workshop 1'!A2",
            values: [["booking-1", "booking-1", "workshop-1", "Workshop 1", "sent", "1", "Call after 5"]],
        });
        const append = request.mock.calls.find(([url]) => url.includes(":append"));
        expect(JSON.parse(append![1].body).values).toEqual([["booking-2", "booking-2", "workshop-1", "Workshop 1", "not_sent", "0", ""]]);
    });
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

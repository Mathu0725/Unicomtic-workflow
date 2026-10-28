import { beforeEach, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/google/oauth", () => ({ googleRequest: request }));
import { GoogleSheetsService } from "../../src/lib/google/sheets-service";
import { ProviderError } from "../../src/lib/errors/provider-error";
import { DatabaseStore } from "../../src/lib/data/store";
import {
  suggestedWorkshopTab,
  workshopDestinationProblem,
  workshopTabReserved,
} from "../../src/lib/workshops/sheet-config";
const row = {
  referenceNo: "booking-1",
  bookingId: "booking-1",
  workshopId: "workshop-1",
  fullName: "New student",
  attendanceStatus: "attended",
};
function provider(values: string[][] = [], titles = ["Workshop One"]) {
  request.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.includes("?fields="))
      return { sheets: titles.map((title) => ({ properties: { title } })) };
    if (!options) return { values };
    return {};
  });
}
beforeEach(() => {
  request.mockReset();
  provider();
});
it("creates a dedicated missing tab and writes formula-looking names as RAW values", async () => {
  provider([], []);
  const result = await new GoogleSheetsService().syncWorkshopBookings(
    "shared-sheet",
    "Workshop One",
    "workshop-1",
    [{ ...row, fullName: "=IMPORTXML(unsafe)" }],
  );
  expect(result.success).toBe(true);
  const add = request.mock.calls.find(
    ([url]) => url.endsWith(":batchUpdate") && !url.includes("/values"),
  );
  expect(JSON.parse(add![1].body).requests).toEqual([
    { addSheet: { properties: { title: "Workshop One" } } },
  ]);
  const append = request.mock.calls.find(([url]) => url.includes(":append"));
  expect(append![0]).toContain("valueInputOption=RAW");
  expect(JSON.parse(append![1].body).values[0]).toContain("=IMPORTXML(unsafe)");
});
it("updates the same booking ID, deduplicates a batch and preserves manually added columns", async () => {
  provider([
    ["referenceNo", "bookingId", "workshopId", "fullName", "manualNote"],
    ["booking-1", "booking-1", "workshop-1", "Old", "Keep this note"],
  ]);
  await new GoogleSheetsService().syncWorkshopBookings(
    "shared-sheet",
    "Workshop One",
    "workshop-1",
    [{ ...row, fullName: "First" }, row],
  );
  expect(request.mock.calls.some(([url]) => url.includes(":append"))).toBe(
    false,
  );
  const update = request.mock.calls.find(([url]) =>
    url.includes("/values:batchUpdate"),
  );
  expect(JSON.parse(update![1].body).data).toContainEqual({
    range: "'Workshop One'!A2",
    values: [
      [
        "booking-1",
        "booking-1",
        "workshop-1",
        "New student",
        "Keep this note",
        "attended",
      ],
    ],
  });
});
it.each(
  [
    [
      ["referenceNo", "fullName"],
      ["REG-1", "Applicant"],
    ],
    [
      ["referenceNo", "bookingId", "workshopId"],
      ["booking-2", "booking-2", "workshop-2"],
    ],
    [
      ["referenceNo", "bookingId", "workshopId"],
      ["changed-id", "booking-1", "workshop-1"],
    ],
  ].map((values) => ({ values })),
)(
  "refuses to overwrite foreign records or modified ID columns %#",
  async ({ values }) => {
    provider(values);
    const result = await new GoogleSheetsService().syncWorkshopBookings(
      "shared-sheet",
      "Workshop One",
      "workshop-1",
      [row],
    );
    expect(result).toMatchObject({
      success: false,
      errorCode: "WORKSHOP_SHEET_CONFLICT",
      failureKind: "blocked",
    });
    expect(
      request.mock.calls.every(([, options]) => options === undefined),
    ).toBe(true);
  },
);
it("refuses form exports into a populated workshop booking tab", async () => {
  provider([
    ["referenceNo", "bookingId", "workshopId"],
    ["booking-1", "booking-1", "workshop-1"],
  ]);
  expect(
    await new GoogleSheetsService().syncRecords(
      "shared-sheet",
      "registrations",
      [{ referenceNo: "REG-1" }],
      "Workshop One",
    ),
  ).toMatchObject({ success: false, errorCode: "WORKSHOP_SHEET_CONFLICT" });
  expect(request.mock.calls.every(([, options]) => options === undefined)).toBe(
    true,
  );
});
it("matches existing tab case and safely quotes apostrophes without adding another tab", async () => {
  provider([], ["O'Brien Workshop"]);
  await new GoogleSheetsService().syncWorkshopBookings(
    "shared-sheet",
    "o'brien workshop",
    "workshop-1",
    [row],
  );
  expect(
    request.mock.calls.some(
      ([url]) => url.endsWith(":batchUpdate") && !url.includes("/values"),
    ),
  ).toBe(false);
  const write = request.mock.calls.find(([url]) =>
    url.includes("/values:batchUpdate"),
  );
  expect(JSON.parse(write![1].body).data[0].range).toBe(
    "'O''Brien Workshop'!A1",
  );
});
it("rejects malformed booking identities and safely returns temporary Google failures", async () => {
  expect(
    await new GoogleSheetsService().syncWorkshopBookings(
      "shared-sheet",
      "Workshop One",
      "workshop-1",
      [{ ...row, referenceNo: "wrong" }],
    ),
  ).toMatchObject({ success: false, errorCode: "WORKSHOP_SHEET_CONFLICT" });
  request.mockRejectedValue(
    new ProviderError(
      "GOOGLE_RATE_LIMITED",
      "Google is temporarily busy.",
      "temporary",
      60000,
    ),
  );
  expect(
    await new GoogleSheetsService().syncWorkshopBookings(
      "shared-sheet",
      "Workshop One",
      "workshop-1",
      [row],
    ),
  ).toMatchObject({
    success: false,
    failureKind: "temporary",
    retryAfterMs: 60000,
  });
});
it("suggests distinct valid workshop tab names and reserves destinations against forms and other workshops", () => {
  const db = new DatabaseStore();
  db.workshops = [
    {
      id: "first-workshop",
      title: "தமிழ் / Workshop [1]",
      google_sheets_config: {
        sheet_id: "shared-sheet",
        sheet_name: "Workshop One",
        enabled: false,
      },
    } as any,
  ];
  db.integrations.registration_sheet_id = "admissions";
  const suggestion = suggestedWorkshopTab(db.workshops[0]);
  expect(suggestion).not.toMatch(/[\[\]:*?/\\']/);
  expect(suggestion.length).toBeLessThanOrEqual(100);
  expect(suggestion).not.toBe(
    suggestedWorkshopTab({ ...db.workshops[0], id: "second-workshop" }),
  );
  expect(
    workshopTabReserved(
      db,
      "https://docs.google.com/spreadsheets/d/shared-sheet/edit",
      "workshop one",
    ),
  ).toBe(true);
  expect(
    workshopDestinationProblem(
      db,
      "second-workshop",
      "shared-sheet",
      "Workshop One",
    ),
  ).toContain("Another workshop");
  expect(
    workshopDestinationProblem(
      db,
      "second-workshop",
      "admissions",
      "Registrations",
    ),
  ).toContain("form responses");
});

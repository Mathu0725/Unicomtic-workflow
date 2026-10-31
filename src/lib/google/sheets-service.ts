import { getDb } from "../data/store";
import { googleRequest } from "./oauth";
import {
  ProviderError,
  providerFailure,
  type FailureKind,
} from "../errors/provider-error";
import { sheetTabKey } from "../workshops/sheet-config";
export interface SheetRowData {
  referenceNo: string;
  [key: string]: any;
}
export interface SyncResult {
  success: boolean;
  syncedCount: number;
  message: string;
  error?: string;
  retryAfterMs?: number;
  errorCode?: string;
  failureKind?: FailureKind;
  action?: string;
}
const base = "https://sheets.googleapis.com/v4/spreadsheets";
const quotedTab = (name: string) => `'${name.replace(/'/g, "''")}'`;
const cellValue = (value: any) =>
  value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
export function spreadsheetId(value: string) {
  const match = value.match(/\/spreadsheets\/d\/([\w-]+)/);
  const id = match ? match[1] : value.trim();
  if (!/^[\w-]+$/.test(id))
    throw new ProviderError(
      "SHEET_ID_INVALID",
      "Enter a valid Google spreadsheet URL or ID.",
      "blocked",
    );
  return id;
}
export class GoogleSheetsService {
  isConfigured() {
    return Boolean(getDb().integrations.google);
  }
  async createSpreadsheet(title: string) {
    return googleRequest(base, {
      method: "POST",
      body: JSON.stringify({
        properties: { title },
        sheets: ["Registrations", "Applications"].map((title) => ({
          properties: { title },
        })),
      }),
    });
  }
  async readRows(
    sheetId: string,
    sheetName = "Sheet1",
  ): Promise<Record<string, string>[]> {
    const data = await googleRequest(
      `${base}/${spreadsheetId(sheetId)}/values/${encodeURIComponent(`${quotedTab(sheetName)}!A1:ZZ`)}`,
    );
    const [headers = [], ...rows] = data.values || [];
    return rows.map((row: string[]) =>
      Object.fromEntries(
        headers.map((header: string, index: number) => [
          header,
          row[index] || "",
        ]),
      ),
    );
  }
  async syncRecords(
    sheetId: string,
    syncType: "registrations" | "applications",
    rows: SheetRowData[],
    sheetName = syncType === "applications" ? "Applications" : "Registrations",
  ): Promise<SyncResult> {
    return this.syncRows(sheetId, rows, sheetName);
  }
  async syncWorkshopBookings(
    sheetId: string,
    sheetName: string,
    workshopId: string,
    rows: SheetRowData[],
  ): Promise<SyncResult> {
    return this.syncRows(sheetId, rows, sheetName, workshopId);
  }
  private async syncRows(
    sheetId: string,
    rows: SheetRowData[],
    sheetName: string,
    workshopId?: string,
  ): Promise<SyncResult> {
    if (!rows.length)
      return {
        success: true,
        syncedCount: 0,
        message: "No records to synchronize.",
      };
    try {
      const id = spreadsheetId(sheetId);
      const metadata = await googleRequest(
        `${base}/${id}?fields=sheets.properties.title`,
      );
      const selected = (metadata.sheets || []).find(
        (s: any) => sheetTabKey(s.properties.title) === sheetTabKey(sheetName),
      );
      const tab = quotedTab(selected?.properties.title || sheetName);
      if (!selected)
        await googleRequest(`${base}/${id}:batchUpdate`, {
          method: "POST",
          body: JSON.stringify({
            requests: [{ addSheet: { properties: { title: sheetName } } }],
          }),
        });
      const existing = await googleRequest(
        `${base}/${id}/values/${encodeURIComponent(`${tab}!A1:ZZ`)}`,
      );
      const values: string[][] = existing.values || [];
      const originalHeaders = values[0] || [];
      if (originalHeaders.length && originalHeaders[0] !== "referenceNo")
        throw new ProviderError(
          "SHEET_HEADER_INVALID",
          "The target tab must have referenceNo in column A. Choose a new tab for portal exports.",
          "blocked",
        );
      const occupied = values
        .slice(1)
        .filter((row) => row.some((cell) => String(cell).trim()));
      const workshopColumn = originalHeaders.indexOf("workshopId"),
        bookingColumn = originalHeaders.indexOf("bookingId");
      if (
        workshopId &&
        (rows.some(
          (row) =>
            row.workshopId !== workshopId ||
            !row.bookingId ||
            row.referenceNo !== row.bookingId,
        ) ||
          occupied.some(
            (row) =>
              workshopColumn < 0 ||
              bookingColumn < 0 ||
              row[workshopColumn] !== workshopId ||
              row[bookingColumn] !== row[0],
          ))
      )
        throw new ProviderError(
          "WORKSHOP_SHEET_CONFLICT",
          "This tab contains other records or its booking ID columns were changed. Choose a separate empty workshop tab; existing cells were preserved.",
          "blocked",
        );
      if (
        !workshopId &&
        occupied.length &&
        workshopColumn >= 0 &&
        bookingColumn >= 0
      )
        throw new ProviderError(
          "WORKSHOP_SHEET_CONFLICT",
          "This tab contains workshop bookings. Choose a separate tab for form responses.",
          "blocked",
        );
      const headers = Array.from(
        new Set([
          "referenceNo",
          ...originalHeaders,
          ...rows.flatMap((row) => Object.keys(row)),
        ]),
      );
      const index = new Map(values.slice(1).map((row, i) => [row[0], i + 2]));
      const uniqueRows = [
        ...new Map(rows.map((row) => [row.referenceNo, row])).values(),
      ];
      const updates: any[] = [{ range: `${tab}!A1`, values: [headers] }],
        append: string[][] = [];
      for (const row of uniqueRows) {
        const rowNumber = index.get(row.referenceNo);
        const cells = headers.map((h) =>
          rowNumber && !Object.hasOwn(row, h)
            ? values[rowNumber - 1]?.[originalHeaders.indexOf(h)] || ""
            : cellValue(row[h]),
        );
        if (rowNumber)
          updates.push({ range: `${tab}!A${rowNumber}`, values: [cells] });
        else append.push(cells);
      }
      await googleRequest(`${base}/${id}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "RAW", data: updates }),
      });
      if (append.length)
        await googleRequest(
          `${base}/${id}/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
          { method: "POST", body: JSON.stringify({ values: append }) },
        );
      return {
        success: true,
        syncedCount: uniqueRows.length,
        message: `Synchronized ${uniqueRows.length} records.`,
      };
    } catch (err: any) {
      const failure = providerFailure(err);
      return {
        success: false,
        syncedCount: 0,
        message: failure.message,
        error: failure.message,
        retryAfterMs: failure.retryAfterMs,
        errorCode: failure.code,
        failureKind: failure.kind,
        action: failure.action,
      };
    }
  }
}
export const googleSheetsService = new GoogleSheetsService();

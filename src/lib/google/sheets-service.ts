import { getDb } from "../data/store";
import { googleRequest } from "./oauth";
import { ProviderError, providerFailure, type FailureKind } from "../errors/provider-error";
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
const cellValue = (value: any) => value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
export function spreadsheetId(value: string) {
    const match = value.match(/\/spreadsheets\/d\/([\w-]+)/);
    const id = match ? match[1] : value.trim();
    if (!/^[\w-]+$/.test(id))
        throw new ProviderError("SHEET_ID_INVALID", "Enter a valid Google spreadsheet URL or ID.", "blocked");
    return id;
}
export class GoogleSheetsService {
    isConfigured() { return Boolean(getDb().integrations.google); }
    async createSpreadsheet(title: string) {
        return googleRequest(base, { method: "POST", body: JSON.stringify({ properties: { title }, sheets: ["Registrations", "Applications"].map(title => ({ properties: { title } })) }) });
    }
    async readRows(sheetId: string, sheetName = "Sheet1"): Promise<Record<string, string>[]> {
        const data = await googleRequest(`${base}/${spreadsheetId(sheetId)}/values/${encodeURIComponent(`${quotedTab(sheetName)}!A1:ZZ`)}`);
        const [headers = [], ...rows] = data.values || [];
        return rows.map((row: string[]) => Object.fromEntries(headers.map((header: string, index: number) => [header, row[index] || ""])));
    }
    async syncRecords(sheetId: string, syncType: "registrations" | "applications", rows: SheetRowData[], sheetName = syncType === "applications" ? "Applications" : "Registrations"): Promise<SyncResult> {
        if (!rows.length)
            return { success: true, syncedCount: 0, message: "No records to synchronize." };
        try {
            const id = spreadsheetId(sheetId), tab = quotedTab(sheetName);
            const metadata = await googleRequest(`${base}/${id}?fields=sheets.properties.title`);
            if (!(metadata.sheets || []).some((s: any) => s.properties.title === sheetName))
                await googleRequest(`${base}/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }) });
            const existing = await googleRequest(`${base}/${id}/values/${encodeURIComponent(`${tab}!A1:ZZ`)}`);
            const values: string[][] = existing.values || [];
            const originalHeaders = values[0] || [];
            if (originalHeaders.length && originalHeaders[0] !== "referenceNo")
                throw new ProviderError("SHEET_HEADER_INVALID", "The target tab must have referenceNo in column A. Choose a new tab for portal exports.", "blocked");
            const headers = Array.from(new Set(["referenceNo", ...originalHeaders, ...rows.flatMap(row => Object.keys(row))]));
            const index = new Map(values.slice(1).map((row, i) => [row[0], i + 2]));
            const uniqueRows = [...new Map(rows.map(row => [row.referenceNo, row])).values()];
            const updates: any[] = [{ range: `${tab}!A1`, values: [headers] }], append: string[][] = [];
            for (const row of uniqueRows) {
                const cells = headers.map(h => cellValue(row[h]));
                const rowNumber = index.get(row.referenceNo);
                if (rowNumber)
                    updates.push({ range: `${tab}!A${rowNumber}`, values: [cells] });
                else
                    append.push(cells);
            }
            await googleRequest(`${base}/${id}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: updates }) });
            if (append.length)
                await googleRequest(`${base}/${id}/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: append }) });
            return { success: true, syncedCount: uniqueRows.length, message: `Synchronized ${uniqueRows.length} records.` };
        }
        catch (err: any) {
            const failure = providerFailure(err);
            return { success: false, syncedCount: 0, message: failure.message, error: failure.message, retryAfterMs: failure.retryAfterMs, errorCode: failure.code, failureKind: failure.kind, action: failure.action };
        }
    }
}
export const googleSheetsService = new GoogleSheetsService();

import type { CustomForm, DatabaseStore, FormSubmission } from "../data/store";
import { ProviderError, providerFailure } from "../errors/provider-error";
import { sheetTabKey } from "../workshops/sheet-config";
import { googleRequest } from "./oauth";
import { formResponseAnswers, formResponseColumns } from "./form-response-columns";
import { spreadsheetId, type SyncResult } from "./sheets-service";

const base = "https://sheets.googleapis.com/v4/spreadsheets";
const keys = { form: "UTICX_FORM", column: "UTICX_COLUMN", anchor: "UTICX_ANCHOR" } as const;
const notePrefix = "UTICX_RESPONSE:";
const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
const columnName = (index: number) => {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
};
const cell = (value: unknown) => ({ userEnteredValue: { stringValue: value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value) } });
const conflict = (message: string) => new ProviderError("FORM_SHEET_CONFLICT", message, "blocked", 0, "repair_configuration");

/** Write form answers only, keeping stable identities in row/column metadata. */
export async function syncFormResponses(db: DatabaseStore, form: CustomForm, submissions: FormSubmission[], sheetId: string, sheetName: string): Promise<SyncResult> {
  try {
    if (!submissions.length) return { success: true, syncedCount: 0, message: "No records to synchronize." };
    if (submissions.some(sub => sub.form_id !== form.id)) throw conflict("A response belongs to another form. Choose a separate tab for each form.");
    const id = spreadsheetId(sheetId);
    const info = await googleRequest(`${base}/${id}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`);
    let sheet = (info.sheets || []).find((item: any) => sheetTabKey(item.properties.title) === sheetTabKey(sheetName));
    if (!sheet) {
      const added = await googleRequest(`${base}/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }) });
      const properties = added.replies?.[0]?.addSheet?.properties;
      if (!properties) throw new ProviderError("GOOGLE_UNAVAILABLE", "The new worksheet could not be confirmed. Check the spreadsheet before retrying.", "temporary");
      sheet = { properties };
    }
    const { sheetId: tabId, title, gridProperties } = sheet.properties;
    if (!Number.isInteger(tabId)) throw conflict("The worksheet details could not be confirmed. Select the worksheet again.");
    const [existing, found] = await Promise.all([
      googleRequest(`${base}/${id}/values/${encodeURIComponent(`${quote(title)}!A1:ZZ`)}`),
      googleRequest(`${base}/${id}/developerMetadata:search`, { method: "POST", body: JSON.stringify({ dataFilters: Object.values(keys).map(metadataKey => ({ developerMetadataLookup: { metadataKey, visibility: "DOCUMENT" } })) }) }),
    ]);
    const values: string[][] = existing.values || [];
    const metadata = (found.matchedDeveloperMetadata || []).map((item: any) => item.developerMetadata).filter((item: any) => item?.location?.sheetId === tabId || item?.location?.dimensionRange?.sheetId === tabId);
    const owners = metadata.filter((item: any) => item.metadataKey === keys.form);
    if (owners.length > 1 || owners.some((item: any) => item.metadataValue !== form.id)) throw conflict("This worksheet is connected to another form. Choose a separate empty tab.");
    const hasContent = values.some(row => row.some(value => String(value ?? "").trim() !== ""));
    if (!owners.length && (hasContent || metadata.length)) throw conflict("This worksheet already contains data. Choose a new empty tab to protect existing records.");

    const formSubs = db.formSubmissions.filter(sub => sub.form_id === form.id);
    const questions = formResponseColumns(form.fields, formSubs);
    const columns = [
      ...questions.map(q => ({ key: `q:${q.id}`, label: q.label })),
      { key: "sys:createdAt", label: "Submitted at" },
      { key: "sys:status", label: "Status" },
    ];
    const columnMetadata = metadata.filter((item: any) => item.metadataKey === keys.column);
    const anchors = metadata.filter((item: any) => item.metadataKey === keys.anchor);
    const indexes = new Map<string, number>();
    const rowIndexes = new Map<string, number>();
    const occupiedColumnIndexes = new Set<number>();
    for (const item of columnMetadata) {
      const range = item.location?.dimensionRange, index = range?.startIndex;
      if (range?.dimension !== "COLUMNS" || !Number.isInteger(index) || index < 0 || range.endIndex !== index + 1 || !item.metadataValue || indexes.has(item.metadataValue) || occupiedColumnIndexes.has(index)) throw conflict("Worksheet column metadata is inconsistent. Choose a new empty tab.");
      indexes.set(item.metadataValue, index); occupiedColumnIndexes.add(index);
    }
    if (anchors.length > 1 || owners.length && anchors.length !== 1) throw conflict("Worksheet identity information is inconsistent. Choose a new empty tab.");
    // Do not overwrite staff-added data in unmanaged columns or rows.
    let nextColumn = Math.max(0, ...values.map(row => row.length), ...[...occupiedColumnIndexes].map(i => i + 1));
    const requests: any[] = [];
    if (!owners.length) requests.push({ createDeveloperMetadata: { developerMetadata: { metadataKey: keys.form, metadataValue: form.id, visibility: "DOCUMENT", location: { sheetId: tabId } } } });
    const newColumns: { key: string; index: number }[] = [];
    for (const column of columns) if (!indexes.has(column.key)) {
      const index = nextColumn++; indexes.set(column.key, index); newColumns.push({ key: column.key, index });
    }
    if (nextColumn > 702) throw conflict("This worksheet has too many columns. Choose a new empty tab.");
    const anchorRange = anchors[0]?.location?.dimensionRange;
    const anchorColumn = anchors.length ? anchorRange?.startIndex : indexes.get(columns[0].key);
    if (!Number.isInteger(anchorColumn) || anchorColumn < 0 || anchors.length && (anchorRange.dimension !== "COLUMNS" || anchorRange.endIndex !== anchorColumn + 1 || !occupiedColumnIndexes.has(anchorColumn))) throw conflict("Worksheet identity information is inconsistent. Choose a new empty tab.");
    if (anchors.length) {
      const anchor = columnName(anchorColumn);
      const grid = await googleRequest(`${base}/${id}?ranges=${encodeURIComponent(`${quote(title)}!${anchor}1:${anchor}`)}&fields=sheets.data.rowData.values.note`);
      const notes = grid.sheets?.[0]?.data?.[0]?.rowData || [];
      for (let index = 1; index < notes.length; index++) {
        const note = notes[index]?.values?.[0]?.note;
        if (typeof note !== "string" || !note.startsWith(notePrefix)) continue;
        const responseId = note.slice(notePrefix.length);
        if (!responseId || rowIndexes.has(responseId)) throw conflict("Worksheet response identifiers are inconsistent. Choose a new empty tab.");
        rowIndexes.set(responseId, index);
      }
      const identifiedRows = new Set(rowIndexes.values());
      if (values.slice(1).some((row, i) => row.some(value => String(value ?? "").trim() !== "") && !identifiedRows.has(i + 1))) throw conflict("A worksheet row is missing its response identifier. Restore the original row or choose a new empty tab.");
    }
    let nextRow = Math.max(1, values.length, ...[...rowIndexes.values()].map(i => i + 1));
    const unique = [...new Map(submissions.map(sub => [sub.id, sub])).values()];
    for (const sub of unique) if (!rowIndexes.has(sub.id)) {
      rowIndexes.set(sub.id, nextRow++);
    }
    if (nextColumn > (gridProperties?.columnCount || 26)) requests.push({ appendDimension: { sheetId: tabId, dimension: "COLUMNS", length: nextColumn - (gridProperties?.columnCount || 26) } });
    if (nextRow > (gridProperties?.rowCount || 1000)) requests.push({ appendDimension: { sheetId: tabId, dimension: "ROWS", length: nextRow - (gridProperties?.rowCount || 1000) } });
    const update = (row: number, column: number, value: unknown, note?: string) => requests.push({ updateCells: { start: { sheetId: tabId, rowIndex: row, columnIndex: column }, rows: [{ values: [{ ...cell(value), ...(note ? { note } : {}) }] }], fields: note ? "userEnteredValue,note" : "userEnteredValue" } });
    for (const column of columns) update(0, indexes.get(column.key)!, column.label);
    for (const sub of unique) {
      const registration = db.registrations.find(item => item.id === sub.registration_id);
      const application = db.applications.find(item => item.id === sub.application_id);
      const answers = [...formResponseAnswers(questions, sub), sub.created_at, application?.status || registration?.status || ""];
      for (let i = 0; i < columns.length; i++) {
        const column = indexes.get(columns[i].key)!;
        update(rowIndexes.get(sub.id)!, column, answers[i], column === anchorColumn ? `${notePrefix}${sub.id}` : undefined);
      }
      if (!columns.some(column => indexes.get(column.key) === anchorColumn)) requests.push({ updateCells: { start: { sheetId: tabId, rowIndex: rowIndexes.get(sub.id)!, columnIndex: anchorColumn }, rows: [{ values: [{ note: `${notePrefix}${sub.id}` }] }], fields: "note" } });
    }
    const tag = (metadataKey: string, metadataValue: string, dimension: "ROWS" | "COLUMNS", index: number) => requests.push({ createDeveloperMetadata: { developerMetadata: { metadataKey, metadataValue, visibility: "DOCUMENT", location: { dimensionRange: { sheetId: tabId, dimension, startIndex: index, endIndex: index + 1 } } } } });
    for (const column of newColumns) tag(keys.column, column.key, "COLUMNS", column.index);
    if (!anchors.length) tag(keys.anchor, "response-note", "COLUMNS", anchorColumn);
    await googleRequest(`${base}/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
    return { success: true, syncedCount: unique.length, message: `Synchronized ${unique.length} form responses.` };
  } catch (error) {
    const failure = providerFailure(error);
    return { success: false, syncedCount: 0, message: failure.message, error: failure.message, retryAfterMs: failure.retryAfterMs, errorCode: failure.code, failureKind: failure.kind, action: failure.action };
  }
}


import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ColumnMapping {
  studentIdColumn: string;
  scoreColumn: string;
  nameColumn?: string;
}

export interface ParsedMarksRow {
  rowNumber: number;
  studentExamId: string;
  studentName?: string;
  rawScore: number | null;
  isValid: boolean;
  errors: string[];
}

export interface MarksValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  outOfRangeRows: number;
  rows: ParsedMarksRow[];
}

/**
 * Parse CSV or Excel file buffer into tabular records
 */
export function parseFileToRecords(
  fileBuffer: ArrayBuffer,
  fileName: string
): { headers: string[]; records: Record<string, any>[] } {
  const isExcel = /\.(xlsx|xls)$/i.test(fileName);

  if (isExcel) {
    const workbook = XLSX.read(fileBuffer, { type: "array", sheetRows: 5002 });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error("The workbook has no worksheet.");
    const worksheet = workbook.Sheets[firstSheetName];
    const records = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
      defval: "",
    });
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    return { headers, records };
  } else {
    // CSV
    const textDecoder = new TextDecoder("utf-8");
    const csvText = textDecoder.decode(fileBuffer);
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      preview: 5001,
    });
    if (parsed.errors.length) throw new Error("The CSV contains malformed rows or quoting.");
    const headers = parsed.meta.fields || [];
    return { headers, records: parsed.data as Record<string, any>[] };
  }
}

/**
 * Validate parsed rows against exam criteria and column mapping
 */
export function validateMarksRows(
  records: Record<string, any>[],
  mapping: ColumnMapping,
  maxMarks: number = 100,
  minMarks: number = 0,
  knownStudentIds?: Set<string>
): MarksValidationSummary {
  const seenIds = new Set<string>();
  const results: ParsedMarksRow[] = [];
  let duplicateCount = 0;
  let outOfRangeCount = 0;

  records.forEach((record, idx) => {
    const rowNumber = idx + 2; // Accounting for 1-based index and header
    const errors: string[] = [];

    // Extract student ID
    const rawId = record[mapping.studentIdColumn];
    const studentExamId = rawId ? String(rawId).trim() : "";

    if (!studentExamId) {
      errors.push("Missing student identifier or index number");
    } else {
      if (seenIds.has(studentExamId.toUpperCase())) {
        errors.push(`Duplicate student ID '${studentExamId}' found in import file`);
        duplicateCount++;
      } else {
        seenIds.add(studentExamId.toUpperCase());
      }

      if (knownStudentIds && !knownStudentIds.has(studentExamId.toUpperCase())) {
        errors.push(`Student ID '${studentExamId}' does not match any registered workshop attendee`);
      }
    }

    // Extract raw score
    const rawScoreVal = record[mapping.scoreColumn];
    let rawScore: number | null = null;

    if (rawScoreVal === undefined || rawScoreVal === null || String(rawScoreVal).trim() === "") {
      errors.push("Score is missing or blank");
    } else {
      const parsedNum = Number(rawScoreVal);
      if (!Number.isFinite(parsedNum)) {
        errors.push(`Score '${rawScoreVal}' is not a valid number`);
      } else if (parsedNum < minMarks || parsedNum > maxMarks) {
        errors.push(`Score ${parsedNum} is out of permitted range [${minMarks} - ${maxMarks}]`);
        outOfRangeCount++;
        rawScore = parsedNum;
      } else {
        rawScore = parsedNum;
      }
    }

    const studentName = mapping.nameColumn ? String(record[mapping.nameColumn] || "").trim() : undefined;

    results.push({
      rowNumber,
      studentExamId,
      studentName,
      rawScore,
      isValid: errors.length === 0,
      errors,
    });
  });

  const validRows = results.filter((r) => r.isValid).length;

  return {
    totalRows: results.length,
    validRows,
    invalidRows: results.length - validRows,
    duplicateRows: duplicateCount,
    outOfRangeRows: outOfRangeCount,
    rows: results,
  };
}

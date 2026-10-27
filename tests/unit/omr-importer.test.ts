import { describe, it, expect } from "vitest";
import { validateMarksRows, parseFileToRecords, ColumnMapping } from "../../src/lib/omr/marks-importer";

describe("OMR & Google Forms Marks Import Validation (Stage 8 & 9)", () => {
  it("rejects malformed CSV instead of silently importing an incomplete parsed file", () => {
    const bytes = new TextEncoder().encode('StudentID,Marks,Name\nTIC-2025-0001,88,"Unclosed name');
    expect(() => parseFileToRecords(bytes.buffer, "marks.csv")).toThrow("malformed");
  });
  const mapping: ColumnMapping = {
    studentIdColumn: "StudentID",
    scoreColumn: "Marks",
    nameColumn: "CandidateName",
  };

  const knownIds = new Set(["TIC-2025-0001", "TIC-2025-0002", "TIC-2025-0003"]);

  it("should validate and pass clean records", () => {
    const records = [
      { StudentID: "TIC-2025-0001", Marks: "88", CandidateName: "Kavindu" },
      { StudentID: "TIC-2025-0002", Marks: "94", CandidateName: "Rizna" },
    ];

    const result = validateMarksRows(records, mapping, 100, 0, knownIds);
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(0);
    expect(result.rows[0].rawScore).toBe(88);
  });

  it("should detect out of range scores (> maxMarks)", () => {
    const records = [
      { StudentID: "TIC-2025-0001", Marks: "150", CandidateName: "Kavindu" },
    ];

    const result = validateMarksRows(records, mapping, 100, 0, knownIds);
    expect(result.validRows).toBe(0);
    expect(result.outOfRangeRows).toBe(1);
    expect(result.rows[0].errors[0]).toContain("out of permitted range");
  });

  it("should detect duplicate student IDs within file", () => {
    const records = [
      { StudentID: "TIC-2025-0001", Marks: "80" },
      { StudentID: "TIC-2025-0001", Marks: "85" }, // Duplicate
    ];

    const result = validateMarksRows(records, mapping, 100, 0, knownIds);
    expect(result.duplicateRows).toBe(1);
    expect(result.rows[1].errors[0]).toContain("Duplicate student ID");
  });

  it("should detect missing scores or blank IDs", () => {
    const records = [
      { StudentID: "", Marks: "80" },
      { StudentID: "TIC-2025-0002", Marks: "" },
    ];

    const result = validateMarksRows(records, mapping, 100, 0, knownIds);
    expect(result.validRows).toBe(0);
    expect(result.rows[0].errors[0]).toContain("Missing student identifier");
    expect(result.rows[1].errors[0]).toContain("Score is missing or blank");
  });
});

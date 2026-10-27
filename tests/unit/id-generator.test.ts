import { describe, it, expect } from "vitest";
import {
  generateStudentExamId,
  generateRegistrationRef,
  generateApplicationNo,
  maskNic,
  maskPhone,
  maskEmail,
} from "../../src/lib/attendance/id-generator";

describe("Student / Examination ID Generator & Masking", () => {
  it("should generate a unique student exam ID in correct format TIC-[YEAR]-[PADDED]", () => {
    const id = generateStudentExamId({
      campaignYear: 2025,
      sequenceNumber: 42,
    });
    expect(id).toBe("TIC-2025-0042");
  });

  it("should generate registration reference with prefix REG", () => {
    const ref = generateRegistrationRef("REG");
    expect(ref.startsWith("REG-")).toBe(true);
    expect(ref.length).toBeGreaterThanOrEqual(10);
  });

  it("should generate application reference with prefix APP", () => {
    const appNo = generateApplicationNo("APP");
    expect(appNo.startsWith("APP-")).toBe(true);
  });

  it("should safely mask NIC showing only last 4 characters", () => {
    const maskedOld = maskNic("991234567V");
    expect(maskedOld).toBe("******567V");

    const maskedNew = maskNic("200112304567");
    expect(maskedNew).toBe("********4567");
  });

  it("should safely mask telephone numbers", () => {
    const masked = maskPhone("0771234567");
    expect(masked).toBe("077****567");
  });

  it("should safely mask email addresses", () => {
    const masked = maskEmail("kavindu@unicomtic.org");
    expect(masked).toBe("k***u@unicomtic.org");
  });
});

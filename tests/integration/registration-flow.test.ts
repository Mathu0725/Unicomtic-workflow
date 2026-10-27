import { describe, it, expect } from "vitest";
import { registrationSchema } from "../../src/lib/validations/registration";
import { applicationSchema } from "../../src/lib/validations/application";

describe("Registration & Application Schema Validations", () => {
  it("should accept valid Sri Lankan student registration data", () => {
    const validData = {
      fullName: "Kavindu Dilshan Perera",
      nameWithInitials: "K. D. Perera",
      email: "kavindu.p@example.lk",
      phone: "0771234567",
      whatsapp: "0771234567",
      nic: "200112304567",
      gender: "Male" as const,
      dob: "2001-05-12",
      district: "Colombo",
      address: "No. 45, Temple Road, Maharagama",
      termsAccepted: true,
      termsVersion: "v1.0",
    };

    const parsed = registrationSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
  });

  it("should reject invalid Sri Lankan phone number format", () => {
    const invalidPhoneData = {
      fullName: "Kavindu Dilshan Perera",
      nameWithInitials: "K. D. Perera",
      email: "kavindu.p@example.lk",
      phone: "12345", // Invalid
      nic: "200112304567",
      gender: "Male" as const,
      dob: "2001-05-12",
      district: "Colombo",
      address: "No. 45, Temple Road, Maharagama",
      termsAccepted: true,
    };

    const parsed = registrationSchema.safeParse(invalidPhoneData);
    expect(parsed.success).toBe(false);
  });

  it("should reject invalid NIC format", () => {
    const invalidNicData = {
      fullName: "Kavindu Dilshan Perera",
      nameWithInitials: "K. D. Perera",
      email: "kavindu.p@example.lk",
      phone: "0771234567",
      nic: "ABC-INVALID-NIC", // Invalid
      gender: "Male" as const,
      dob: "2001-05-12",
      district: "Colombo",
      address: "No. 45, Temple Road, Maharagama",
      termsAccepted: true,
    };

    const parsed = registrationSchema.safeParse(invalidNicData);
    expect(parsed.success).toBe(false);
  });

  it("should reject invalid district not in the official 25 Sri Lankan districts list", () => {
    const invalidDistrictData = {
      fullName: "Kavindu Dilshan Perera",
      nameWithInitials: "K. D. Perera",
      email: "kavindu.p@example.lk",
      phone: "0771234567",
      nic: "200112304567",
      gender: "Male" as const,
      dob: "2001-05-12",
      district: "NonExistentDistrict", // Invalid
      address: "No. 45, Temple Road, Maharagama",
      termsAccepted: true,
    };

    const parsed = registrationSchema.safeParse(invalidDistrictData);
    expect(parsed.success).toBe(false);
  });

  it("should validate complete educational application submission", () => {
    const validApp = {
      registrationRef: "REG-25-KPD78",
      courseId: "course-1",
      olYear: "2018",
      olIndexNo: "882104",
      olMathsGrade: "A" as const,
      olEnglishGrade: "B" as const,
      olScienceGrade: "A" as const,
      alStream: "Physical Science" as const,
      alYear: "2021",
      alIndexNo: "330912",
      alZScore: "1.74",
      alResultsSummary: "Combined Maths: B, Physics: B, Chemistry: C",
      emergencyContactName: "Sunil Perera",
      emergencyContactRelation: "Father",
      emergencyContactPhone: "0777654321",
      statementOfPurpose: "Passionate about full-stack web architectures and scalable distributed cloud systems.",
      declarationAccepted: true,
    };

    const parsed = applicationSchema.safeParse(validApp);
    expect(parsed.success).toBe(true);
  });
});

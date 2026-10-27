import { describe, it, expect } from "vitest";
import { evaluateCandidates, CandidateProfile } from "../../src/lib/eligibility/engine";

describe("Eligibility Rules Engine (Stage 10)", () => {
  const sampleCandidates: CandidateProfile[] = [
    {
      studentId: "1",
      studentName: "Student Passed All",
      registrationRef: "REG-1",
      studentExamId: "TIC-2025-001",
      district: "Colombo",
      hasAttendedWorkshop: true,
      hasSubmittedApplication: true,
      examScore: 85,
      registrationDate: "2025-01-01",
    },
    {
      studentId: "2",
      studentName: "Student Low Score",
      registrationRef: "REG-2",
      studentExamId: "TIC-2025-002",
      district: "Kandy",
      hasAttendedWorkshop: true,
      hasSubmittedApplication: true,
      examScore: 40, // Below 50
      registrationDate: "2025-01-02",
    },
    {
      studentId: "3",
      studentName: "Student Absent From Workshop",
      registrationRef: "REG-3",
      studentExamId: "TIC-2025-003",
      district: "Galle",
      hasAttendedWorkshop: false,
      hasSubmittedApplication: true,
      examScore: 90,
      registrationDate: "2025-01-03",
    },
    {
      studentId: "4",
      studentName: "Student No Application",
      registrationRef: "REG-4",
      studentExamId: "TIC-2025-004",
      district: "Jaffna",
      hasAttendedWorkshop: true,
      hasSubmittedApplication: false,
      examScore: 75,
      registrationDate: "2025-01-04",
    },
  ];

  it("should evaluate eligibility with minimum pass mark 50 and prerequisites", () => {
    const report = evaluateCandidates(sampleCandidates, {
      minExamScore: 50,
      requireWorkshopAttendance: true,
      requireApplicationSubmission: true,
    });

    expect(report.totalEvaluated).toBe(4);
    expect(report.totalEligible).toBe(1);
    expect(report.eligibleCandidates[0].studentName).toBe("Student Passed All");
    expect(report.eligibleCandidates[0].rank).toBe(1);

    expect(report.totalIneligible).toBe(3);

    // Verify rejection reasons
    const lowScore = report.ineligibleCandidates.find((c) => c.studentId === "2");
    expect(lowScore?.reasons[0]).toContain("below minimum requirement");

    const absent = report.ineligibleCandidates.find((c) => c.studentId === "3");
    expect(absent?.reasons[0]).toContain("Did not attend required orientation workshop");

    const noApp = report.ineligibleCandidates.find((c) => c.studentId === "4");
    expect(noApp?.reasons[0]).toContain("Incomplete or unsubmitted formal application");
  });

  it("should enforce maximum shortlist capacity limit", () => {
    const manyPassingCandidates: CandidateProfile[] = [
      {
        studentId: "1",
        studentName: "Candidate A",
        registrationRef: "REG-1",
        studentExamId: "TIC-01",
        district: "Colombo",
        hasAttendedWorkshop: true,
        hasSubmittedApplication: true,
        examScore: 95,
        registrationDate: "2025-01-01",
      },
      {
        studentId: "2",
        studentName: "Candidate B",
        registrationRef: "REG-2",
        studentExamId: "TIC-02",
        district: "Colombo",
        hasAttendedWorkshop: true,
        hasSubmittedApplication: true,
        examScore: 85,
        registrationDate: "2025-01-02",
      },
      {
        studentId: "3",
        studentName: "Candidate C",
        registrationRef: "REG-3",
        studentExamId: "TIC-03",
        district: "Colombo",
        hasAttendedWorkshop: true,
        hasSubmittedApplication: true,
        examScore: 75,
        registrationDate: "2025-01-03",
      },
    ];

    const report = evaluateCandidates(manyPassingCandidates, {
      minExamScore: 50,
      requireWorkshopAttendance: true,
      requireApplicationSubmission: true,
      maxShortlistCount: 2, // Cutoff top 2
    });

    expect(report.totalEligible).toBe(2);
    expect(report.eligibleCandidates.map((c) => c.studentName)).toEqual(["Candidate A", "Candidate B"]);
    expect(report.totalIneligible).toBe(1);
    expect(report.ineligibleCandidates[0].reasons[0]).toContain("Exceeded maximum cohort capacity limit");
  });
});

export interface CandidateProfile {
  studentId: string;
  studentName: string;
  registrationRef: string;
  studentExamId: string;
  district: string;
  hasAttendedWorkshop: boolean;
  hasSubmittedApplication: boolean;
  examScore: number | null;
  registrationDate: string;
  alZScore?: number | null;
}

export interface EligibilityCriteria {
  minExamScore: number;
  requireWorkshopAttendance: boolean;
  requireApplicationSubmission: boolean;
  maxShortlistCount?: number;
  districtQuotas?: Record<string, number>;
  tieBreakRule?: "higher_al_results" | "higher_exam_score" | "earlier_registration";
}

export interface EvaluationResult {
  studentId: string;
  studentName: string;
  studentExamId: string;
  district: string;
  isEligible: boolean;
  reasons: string[];
  rank?: number;
  examScore: number | null;
}

export interface EligibilityReport {
  totalEvaluated: number;
  totalEligible: number;
  totalIneligible: number;
  eligibleCandidates: EvaluationResult[];
  ineligibleCandidates: EvaluationResult[];
}

export function evaluateCandidates(
  candidates: CandidateProfile[],
  criteria: EligibilityCriteria
): EligibilityReport {
  const eligibleCandidates: EvaluationResult[] = [];
  const ineligibleCandidates: EvaluationResult[] = [];

  for (const c of candidates) {
    const reasons: string[] = [];

    // 1. Check Workshop Attendance
    if (criteria.requireWorkshopAttendance && !c.hasAttendedWorkshop) {
      reasons.push("Did not attend required orientation workshop");
    }

    // 2. Check Application Submission
    if (criteria.requireApplicationSubmission && !c.hasSubmittedApplication) {
      reasons.push("Incomplete or unsubmitted formal application");
    }

    // 3. Check Minimum Examination Score
    if (c.examScore === null || c.examScore === undefined) {
      reasons.push("No examination score recorded");
    } else if (c.examScore < criteria.minExamScore) {
      reasons.push(
        `Exam score (${c.examScore}) is below minimum requirement of ${criteria.minExamScore}`
      );
    }

    if (reasons.length === 0) {
      eligibleCandidates.push({
        studentId: c.studentId,
        studentName: c.studentName,
        studentExamId: c.studentExamId,
        district: c.district,
        isEligible: true,
        reasons: ["Meets all qualification requirements"],
        examScore: c.examScore,
      });
    } else {
      ineligibleCandidates.push({
        studentId: c.studentId,
        studentName: c.studentName,
        studentExamId: c.studentExamId,
        district: c.district,
        isEligible: false,
        reasons,
        examScore: c.examScore,
      });
    }
  }

  // Sort eligible candidates by score descending and apply tie-breaker
  eligibleCandidates.sort((a, b) => {
    const scoreA = a.examScore ?? 0;
    const scoreB = b.examScore ?? 0;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    // Tie-breaker
    return a.studentName.localeCompare(b.studentName);
  });

  // Assign ranks
  eligibleCandidates.forEach((c, index) => {
    c.rank = index + 1;
  });

  // Truncate if maximum shortlist count is specified
  let finalEligible = eligibleCandidates;
  if (criteria.maxShortlistCount && criteria.maxShortlistCount > 0) {
    if (eligibleCandidates.length > criteria.maxShortlistCount) {
      const surplus = eligibleCandidates.slice(criteria.maxShortlistCount);
      finalEligible = eligibleCandidates.slice(0, criteria.maxShortlistCount);
      surplus.forEach((s) => {
        s.isEligible = false;
        s.reasons = [`Exceeded maximum cohort capacity limit (${criteria.maxShortlistCount})`];
        ineligibleCandidates.push(s);
      });
    }
  }

  return {
    totalEvaluated: candidates.length,
    totalEligible: finalEligible.length,
    totalIneligible: ineligibleCandidates.length,
    eligibleCandidates: finalEligible,
    ineligibleCandidates,
  };
}

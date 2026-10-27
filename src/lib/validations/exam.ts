import { z } from "zod";

export const examSchema = z.object({
  campaignId: z.string().min(1, "Campaign is required"),
  workshopId: z.string().optional(),
  name: z.string().min(3, "Exam name must be at least 3 characters"),
  examDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid exam date and time required",
  }),
  maxMarks: z.coerce.number().min(1, "Maximum marks must be greater than 0").max(1000),
  passMark: z.coerce.number().min(0, "Pass mark must be at least 0").max(1000),
  weightage: z.coerce.number().min(0).max(100).default(100),
  requiresWorkshopAttendance: z.boolean().default(true),
});

export type ExamFormData = z.infer<typeof examSchema>;

export const eligibilityRuleSchema = z.object({
  campaignId: z.string().min(1, "Campaign is required"),
  name: z.string().min(3, "Rule name is required"),
  minExamScore: z.coerce.number().min(0).max(100),
  requireApplicationComplete: z.boolean().default(true),
  requireWorkshopAttendance: z.boolean().default(true),
  maxShortlistCount: z.coerce.number().min(1).optional(),
  tieBreakRule: z.enum(["higher_al_results", "higher_exam_score", "earlier_registration"]).default("higher_al_results"),
});

export type EligibilityRuleFormData = z.infer<typeof eligibilityRuleSchema>;

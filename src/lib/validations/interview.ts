import { z } from "zod";

export const interviewSchema = z.object({
  campaignId: z.string().min(1, "Campaign is required"),
  title: z.string().min(3, "Title is required"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid interview date required",
  }),
  venue: z.string().min(3, "Venue is required"),
  meetingUrl: z.string().url().optional().or(z.literal("")),
  panelMembers: z.string().optional(),
});

export type InterviewFormData = z.infer<typeof interviewSchema>;

export const interviewEvaluationSchema = z.object({
  candidateId: z.string().min(1, "Candidate ID is required"),
  interviewerName: z.string().min(2, "Interviewer name is required"),
  communicationScore: z.coerce.number().min(0).max(25),
  technicalScore: z.coerce.number().min(0).max(35),
  analyticalScore: z.coerce.number().min(0).max(25),
  overallScore: z.coerce.number().min(0).max(15),
  recommendation: z.enum(["strongly_recommend", "recommend", "neutral", "not_recommended"]),
  notes: z.string().optional(),
});

export type InterviewEvaluationFormData = z.infer<typeof interviewEvaluationSchema>;

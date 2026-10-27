import { z } from "zod";
import { phoneRegex } from "./registration";

export const applicationSchema = z.object({
  registrationRef: z.string().min(4, "Registration reference is required"),
  courseId: z.string().min(1, "Please select your preferred program"),
  olYear: z.string().regex(/^(19|20)\d{2}$/, "Please enter a valid O/L year"),
  olIndexNo: z.string().min(4, "O/L Index number is required"),
  olMathsGrade: z.enum(["A", "B", "C", "S", "W"], {
    error: "Select Mathematics grade",
  }),
  olEnglishGrade: z.enum(["A", "B", "C", "S", "W"], {
    error: "Select English grade",
  }),
  olScienceGrade: z.enum(["A", "B", "C", "S", "W"], {
    error: "Select Science grade",
  }),
  alStream: z.enum(
    ["Physical Science", "Biological Science", "Technology", "Commerce", "Arts", "Other"],
    { error: "Select A/L Stream" }
  ),
  alYear: z.string().regex(/^(19|20)\d{2}$/, "Please enter a valid A/L year"),
  alIndexNo: z.string().min(4, "A/L Index number is required"),
  alZScore: z.string().optional(),
  alResultsSummary: z.string().min(3, "Please specify your 3 main A/L subject results (e.g. Combined Maths - B, Physics - C, Chemistry - C)"),
  higherEducation: z.string().optional(),
  emergencyContactName: z.string().min(3, "Emergency contact name is required"),
  emergencyContactRelation: z.string().min(2, "Relationship is required (e.g. Mother, Father, Guardian)"),
  emergencyContactPhone: z.string().regex(phoneRegex, "Valid emergency phone number is required"),
  statementOfPurpose: z
    .string()
    .min(30, "Please write at least 30 characters about your passion and interest in this program")
    .max(2000),
  declarationAccepted: z.boolean().refine((val) => val === true, {
    message: "You must confirm that all submitted educational records are authentic",
  }),
});

export type ApplicationFormData = z.infer<typeof applicationSchema>;

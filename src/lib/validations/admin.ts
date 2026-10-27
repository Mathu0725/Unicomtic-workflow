import { z } from "zod";
import { AppError } from "../errors/app-error";
import { getDb } from "../data/store";

export const idSchema = z.string().trim().min(1).max(128);
export const idsSchema = z.array(idSchema).min(1).max(1000).refine(ids => new Set(ids).size === ids.length, "Remove duplicate selections.");
export const dateSchema = z.string().max(64).refine(v => Number.isFinite(Date.parse(v)), "Enter a valid date and time.");
export const campaignPatchSchema = z.object({ id: idSchema, auto_invite_applications: z.boolean().optional(), is_active: z.boolean().optional() }).refine(v => v.auto_invite_applications !== undefined || v.is_active !== undefined, "Select a change.");
export const applicationPatchSchema = z.object({ id: idSchema, status: z.enum(["invited", "started", "submitted", "under_review", "approved", "rejected", "withdrawn"]).optional(), review_notes: z.string().max(10000).optional(), expectedStatus: z.string().optional() });
export const attendanceSchema = z.object({ workshopId: idSchema, studentId: idSchema, status: z.enum(["attended", "absent", "late", "excused"]).default("attended"), notes: z.string().max(2000).optional() });
export const eligibilitySchema = z.object({ campaignId: idSchema.optional(), minExamScore: z.number().finite().min(0).max(1000).default(50), requireWorkshopAttendance: z.boolean().default(true), requireApplicationSubmission: z.boolean().default(true), maxShortlistCount: z.number().int().min(1).max(100000).optional(), tieBreakRule: z.enum(["higher_al_results", "higher_exam_score", "earlier_registration"]).default("higher_al_results") });
export const interviewCreateSchema = z.object({ campaignId: idSchema.optional(), title: z.string().trim().min(3).max(255), date: dateSchema, venue: z.string().trim().min(3).max(1000), meetingUrl: z.string().url().or(z.literal("")).optional(), panelMembers: z.array(z.string().trim().min(2).max(100)).min(1).max(20).default(["Admissions Board"]) });
export const interviewAssignSchema = z.object({ interviewId: idSchema, studentIds: idsSchema, startTime: dateSchema.optional() });
export const decisionSchema = z.object({ studentId: idSchema, campaignId: idSchema.optional(), finalStatus: z.enum(["pending_decision", "selected", "waiting_list", "unsuccessful", "withdrawn"]), rank: z.number().int().min(1).max(100000).optional(), compositeScore: z.number().finite().min(0).max(1000).optional(), notes: z.string().max(10000).optional(), expectedStatus: z.string().optional() });
export const decisionNotifySchema = z.object({ studentIds: idsSchema.optional(), statusFilter: z.enum(["selected", "waiting_list", "unsuccessful"]).optional(), campaignId: idSchema.optional() });
export function requireCampaign(id?: string) {
    const campaign = id ? getDb().campaigns.find(c => c.id === id) : getDb().campaigns.find(c => c.is_active);
    if (!campaign) throw new AppError("CAMPAIGN_NOT_FOUND", "Select an available intake.", 404);
    return campaign;
}
export function requireStudentInCampaign(studentId: string, campaignId: string) {
    if (!getDb().students.some(s => s.id === studentId) || !getDb().registrations.some(r => r.student_id === studentId && r.campaign_id === campaignId && r.status !== "cancelled"))
        throw new AppError("STUDENT_INTAKE_MISMATCH", "A selected student does not belong to this intake.", 400);
}

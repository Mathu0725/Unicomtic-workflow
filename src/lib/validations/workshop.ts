import { z } from "zod";

export const workshopSchema = z.object({
  campaignId: z.string().min(1, "Campaign is required"),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(255),
  description: z.string().max(4000).optional(),
  venue: z.string().trim().min(3, "Venue name is required").max(500),
  address: z.string().trim().min(5, "Full address is required").max(2000),
  googleMapsUrl: z
    .string()
    .url("Must be a valid URL").refine(value => /^https?:\/\//i.test(value) && !new URL(value).username && !new URL(value).password, "Use a public http or https location URL")
    .optional()
    .or(z.literal("")),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid start date and time required",
  }),
  endTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid end date and time required",
  }),
  daysBeforeReminders: z.array(z.number().int().min(1).max(90)).max(10).transform(days => [...new Set(days)].sort((a, b) => b - a)).default([3, 1]),
  capacity: z.coerce.number().int().min(1).max(100000),
  bookingDeadline: z.string().optional(),
  remindersEnabled: z.boolean().optional(),
  confirmationEnabled: z.boolean().optional(),
  reminderTemplate: z.enum(["workshop_reminder", "workshop_update"]).optional(),
  confirmationTemplate: z.union([z.enum(["workshop_booking", "workshop_update"]), z.string().regex(/^custom:[0-9a-f-]{36}$/)]).optional(),
});

export type WorkshopFormData = z.infer<typeof workshopSchema>;

import { z } from "zod";

export const workshopSchema = z.object({
  campaignId: z.string().min(1, "Campaign is required"),
  title: z.string().min(3, "Title must be at least 3 characters").max(255),
  description: z.string().optional(),
  venue: z.string().min(3, "Venue name is required"),
  address: z.string().min(5, "Full address is required"),
  googleMapsUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid start date and time required",
  }),
  endTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid end date and time required",
  }),
  daysBeforeReminders: z.array(z.number()).default([3, 1]),
});

export type WorkshopFormData = z.infer<typeof workshopSchema>;

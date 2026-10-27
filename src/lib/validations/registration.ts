import { z } from "zod";
import { SRI_LANKA_DISTRICTS } from "../constants/sri-lanka-districts";
import { candidateEmailSchema } from "./email";

const validDistrictNames = SRI_LANKA_DISTRICTS.map((d) => d.name);

// Sri Lankan NIC regex: 9 digits followed by V/X OR 12 digits
export const nicRegex = /^([0-9]{9}[vVxX]|[0-9]{12})$/;

// Sri Lankan Phone regex: 07XXXXXXXX or +947XXXXXXXX or 947XXXXXXXX or standard 10 digits
export const phoneRegex = /^(?:\+94|0094|0)?[7][0-9]{8}$/;

export const registrationSchema = z.object({
  fullName: z
    .string()
    .min(3, "Full name must be at least 3 characters")
    .max(255, "Full name cannot exceed 255 characters"),
  nameWithInitials: z
    .string()
    .min(2, "Name with initials is required")
    .max(255),
  email: candidateEmailSchema,
  phone: z
    .string()
    .regex(phoneRegex, "Please enter a valid Sri Lankan mobile number (e.g., 0771234567)"),
  whatsapp: z
    .string()
    .regex(phoneRegex, "Please enter a valid WhatsApp number")
    .optional()
    .or(z.literal("")),
  nic: z
    .string()
    .regex(nicRegex, "Please enter a valid Sri Lankan NIC (9 digits + V/X or 12 digits)"),
  gender: z.enum(["Male", "Female", "Other"], {
    error: "Please select your gender",
  }),
  dob: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid date of birth",
  }),
  district: z.string().refine((val) => validDistrictNames.includes(val), {
    message: "Please select a valid Sri Lankan district",
  }),
  address: z
    .string()
    .min(5, "Address must be at least 5 characters")
    .max(500),
  campaignId: z.string().optional(),
  termsAccepted: z.boolean().refine((val) => val === true, {
    message: "You must accept the Terms and Conditions to proceed",
  }),
  termsVersion: z.string().default("v1.0"),
});

export type RegistrationFormData = z.infer<typeof registrationSchema>;
export type RegistrationFormInput = z.input<typeof registrationSchema>;

/**
 * Unique Student / Examination ID Generator
 *
 * Format: TIC-[ACADEMIC_YEAR]-[ZERO_PADDED_SEQUENCE]
 * Example: TIC-2025-0142
 *
 * Reuses existing assigned ID for the same student within the campaign.
 */

export interface StudentIdParams {
  campaignYear?: string | number;
  sequenceNumber: number;
  prefix?: string;
}

export function generateStudentExamId({
  campaignYear = new Date().getFullYear(),
  sequenceNumber,
  prefix = "TIC",
}: StudentIdParams): string {
  const padded = String(sequenceNumber).padStart(4, "0");
  return `${prefix}-${campaignYear}-${padded}`;
}

export function generateRegistrationRef(prefix = "REG"): string {
  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  const yearShort = new Date().getFullYear().toString().slice(-2);
  return `${prefix}-${yearShort}-${randomChars}`;
}

export function generateApplicationNo(prefix = "APP"): string {
  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  const yearShort = new Date().getFullYear().toString().slice(-2);
  return `${prefix}-${yearShort}-${randomChars}`;
}

/**
 * Mask sensitive data for staff entrance desk verification
 */
export function maskNic(nic?: string | null): string {
  if (!nic) return "N/A";
  if (nic.length <= 4) return nic;
  const visible = nic.slice(-4);
  const masked = "*".repeat(nic.length - 4);
  return `${masked}${visible}`;
}

export function maskPhone(phone?: string | null): string {
  if (!phone) return "N/A";
  const clean = phone.trim();
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
}

export function maskEmail(email?: string | null): string {
  if (!email) return "N/A";
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const name = parts[0];
  const domain = parts[1];
  const maskedName =
    name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : name;
  return `${maskedName}@${domain}`;
}

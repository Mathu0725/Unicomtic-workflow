import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { ManagedStaffRole } from "./staff-roles";

export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: ManagedStaffRole;
  password_hash: string;
  created_at: string;
  created_by: string;
}

export function configuredAdministratorEmail() {
  return (process.env.ADMIN_EMAIL || (process.env.NODE_ENV !== "production" ? "admin@unicomtic.org" : "")).trim().toLowerCase();
}

// OWASP's scrypt N=2^15, r=8, p=3 profile. Version the encoding for future upgrades.
function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashStaffPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt-v1$${salt.toString("base64url")}$${(await deriveKey(password, salt)).toString("base64url")}`;
}

export async function verifyStaffPassword(password: string, encoded?: string) {
  const match = /^scrypt-v1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/.exec(encoded || "");
  // Unknown accounts still do the same expensive derivation before being rejected.
  const salt = match ? Buffer.from(match[1], "base64url") : Buffer.alloc(16);
  const expected = match ? Buffer.from(match[2], "base64url") : Buffer.alloc(64);
  const actual = await deriveKey(password, salt);
  return timingSafeEqual(actual, expected) && Boolean(match);
}

export function publicStaffAccount(account: StaffAccount) {
  return { id: account.id, name: account.name, email: account.email, role: account.role, createdAt: account.created_at, source: "Staff account" };
}

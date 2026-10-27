import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import type { DatabaseStore, Registration, Student } from "../data/store";
import { appSecret, decrypt, encrypt } from "./secrets";
import { AppError } from "../errors/app-error";
import { ProviderError } from "../errors/provider-error";
import { admissionEmailVariables, renderNotification } from "../email/notification-templates";

export const CANDIDATE_COOKIE = "unicom_candidate_access";
export const LINK_LIFETIME = 30 * 60000;
export const SESSION_LIFETIME = 60 * 60000;
export type CandidatePurpose = "status" | "apply";
type Claims = { type: "candidate-link-v1" | "candidate-session-v1"; registrationId: string; studentId: string; emailHash: string; expires: number; purpose: CandidatePurpose; destination?: string };
const denied = () => new AppError("CANDIDATE_ACCESS_REQUIRED", "Open a fresh secure link from your registered email to continue.", 401, {}, false, "contact_admissions");
const emailHash = (email: string) => createHmac("sha256", appSecret()).update(`candidate-email:${email.trim().toLowerCase()}`).digest("hex");
function decode(value: string | undefined, type: Claims["type"]): Claims {
  try {
    if (!value || value.length > 3000) throw denied();
    const claims: Claims = JSON.parse(decrypt(value));
    if (claims.type !== type || !Number.isFinite(claims.expires) || claims.expires <= Date.now() || claims.expires > Date.now() + (type === "candidate-link-v1" ? LINK_LIFETIME : SESSION_LIFETIME) + 1000 || typeof claims.registrationId !== "string" || typeof claims.studentId !== "string" || typeof claims.emailHash !== "string" || !["status", "apply"].includes(claims.purpose)) throw denied();
    return claims;
  } catch { throw denied(); }
}
function resolve(db: DatabaseStore, claims: Claims) {
  const registration = db.registrations.find(registration => registration.id === claims.registrationId && registration.student_id === claims.studentId && registration.status !== "cancelled");
  const student = registration && db.students.find(student => student.id === claims.studentId);
  if (!registration || !student || claims.emailHash !== emailHash(student.email)) throw denied();
  return { registration, student, claims };
}
export function readCandidateClaims(req: NextRequest) { return decode(req.cookies.get(CANDIDATE_COOKIE)?.value, "candidate-session-v1"); }
export function requireCandidateAccess(db: DatabaseStore, req: NextRequest) { return resolve(db, readCandidateClaims(req)); }
export function candidateSession(db: DatabaseStore, token: string) {
  const access = resolve(db, decode(token, "candidate-link-v1"));
  return { ...access, cookie: encrypt(JSON.stringify({ ...access.claims, type: "candidate-session-v1", expires: Date.now() + SESSION_LIFETIME })) };
}
export function candidateLink(registration: Registration, student: Student, purpose: CandidatePurpose = "status", destination?: string) {
  const claims: Claims = { type: "candidate-link-v1", registrationId: registration.id, studentId: student.id, emailHash: emailHash(student.email), expires: Date.now() + LINK_LIFETIME, purpose, ...(destination && /^\/form\/[a-z0-9-]+$/.test(destination) ? { destination } : {}) };
  return `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/access#token=${encodeURIComponent(encrypt(JSON.stringify(claims)))}`;
}
export function accessBucket(db: DatabaseStore, namespace: string, identity: string, maximum: number, windowMs: number) {
  const now = Date.now(), key = createHmac("sha256", appSecret()).update(`${namespace}:${identity}`).digest("hex");
  db.candidateAccessAttempts = db.candidateAccessAttempts.filter(bucket => bucket.expires > now);
  let bucket = db.candidateAccessAttempts.find(bucket => bucket.key === key);
  if (!bucket) { if (db.candidateAccessAttempts.length >= 10000) return false; bucket = { key, count: 0, expires: now + windowMs }; db.candidateAccessAttempts.push(bucket); }
  if (bucket.count >= maximum) return false;
  bucket.count++;
  return true;
}
/** Mint links at dispatch, so waiting for the mail allowance cannot expire them. */
export function secureCandidateEmail(db: DatabaseStore, payload: Record<string, any>) {
  if (payload.candidateAccess) {
    const registration = db.registrations.find(registration => registration.id === payload.candidateAccess.registrationId && registration.status !== "cancelled");
    const student = registration && db.students.find(student => student.id === registration.student_id);
    if (!registration || !student || student.email.trim().toLowerCase() !== String(payload.to).trim().toLowerCase()) throw new ProviderError("CANDIDATE_CONTACT_CHANGED", "Candidate contact changed. Request a new access link.", "permanent");
    const purpose = payload.candidateAccess.purpose === "apply" ? "apply" : "status";
    const url = candidateLink(registration, student, purpose, payload.candidateAccess.destination);
    const message = renderNotification(db, "candidate_access", { ...admissionEmailVariables(db, student, registration), purpose: purpose === "apply" ? "complete your application" : "view your admissions progress" }, url, payload.accessTemplate);
    return { ...payload, ...message, html: message.html + "<p>The link expires in 30 minutes. If you did not request it, ignore this email.</p>", text: message.text + "\nThe link expires in 30 minutes. If you did not request it, ignore this email." };
  }
  if (typeof payload.html !== "string") return payload;
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").origin;
  const replacements = new Map<string, string>();
  const html = payload.html.replace(/href=(["'])([^"']+)\1/g, (attribute: string, quote: string, href: string) => {
    try {
      const url = new URL(href.replaceAll("&amp;", "&"), origin);
      if (url.origin !== origin || !["/status", "/apply"].includes(url.pathname)) return attribute;
      const reference = url.searchParams.get("ref");
      const registration = db.registrations.find(registration => registration.reference_no === reference && registration.status !== "cancelled");
      const student = registration && db.students.find(student => student.id === registration.student_id);
      if (!registration || !student || student.email.trim().toLowerCase() !== String(payload.to).trim().toLowerCase()) return attribute;
      const secure = candidateLink(registration, student, url.pathname === "/apply" ? "apply" : "status");
      replacements.set(url.href, secure);
      return `href=${quote}${secure}${quote}`;
    } catch { return attribute; }
  });
  let text = payload.text;
  if (typeof text === "string") for (const [original, secure] of replacements) text = text.replaceAll(original, secure);
  return { ...payload, html, text };
}

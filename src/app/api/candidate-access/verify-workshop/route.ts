import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { findPublicForm } from "@/lib/forms/public-links";
import { formAvailabilityProblem } from "@/lib/forms/field-rules";
import { candidateEmailSchema } from "@/lib/validations/email";
import {
  accessBucket,
  workshopSession,
  WORKSHOP_COOKIE,
  WORKSHOP_SESSION_LIFETIME,
} from "@/lib/security/candidate-access";

export const dynamic = "force-dynamic";
const schema = z.object({
  reference: z.string().trim().min(4).max(100).transform(value => value.toUpperCase()),
  email: candidateEmailSchema,
  formSlug: z.string().min(1).max(100),
}).strict();
const denied = () => new RequestError(
  "Reference and email do not match an eligible record for this workshop form.",
  401,
);

export const POST = route(async req => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) throw new RequestError("Enter an application or registration reference and a valid email address.");
  const { reference, email, formSlug } = parsed.data;
  const db = getDb();
  const ip = process.env.TRUST_PROXY === "true"
    ? (req.headers.get("x-forwarded-for") || "direct").split(",")[0].trim().slice(0, 100)
    : "direct";
  if (!accessBucket(db, "workshop-verify-ip", ip, 600, 15 * 60000) ||
      !accessBucket(db, "workshop-verify-pair", `${reference}:${email}`, 8, 15 * 60000))
    throw new RequestError("Too many attempts. Wait 15 minutes and try again.", 429);
  const form = findPublicForm(db, formSlug);
  if (!form || form.type !== "workshop_rsvp" || formAvailabilityProblem(form))
    throw new RequestError("This workshop form is unavailable or closed.", 404);
  const application = db.applications.find(item => item.application_no.toUpperCase() === reference);
  const registration = db.registrations.find(item =>
    item.status !== "cancelled" &&
    (item.reference_no.toUpperCase() === reference || item.id === application?.registration_id),
  );
  const student = registration && db.students.find(item =>
    item.id === registration.student_id && item.email.trim().toLowerCase() === email,
  );
  if (!registration || !student || registration.campaign_id !== form.campaign_id) throw denied();
  const response = NextResponse.json({ success: true, verified: true, reference: registration.reference_no });
  response.cookies.set(WORKSHOP_COOKIE, workshopSession(registration, student, form.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: WORKSHOP_SESSION_LIFETIME / 1000,
  });
  return response;
}, false, { submission: true, bodyLimit: 8192 });

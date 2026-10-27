import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { accessBucket } from "@/lib/security/candidate-access";
import { candidateEmailSchema } from "@/lib/validations/email";
import { enqueue } from "@/lib/jobs/outbox";
export const dynamic = "force-dynamic";
const schema = z.object({ reference: z.string().trim().min(4).max(100).transform(value => value.toUpperCase()), email: candidateEmailSchema, purpose: z.enum(["status", "apply"]), formSlug: z.string().max(100).optional() }).strict();
const generic = "If these details match a registration, a secure link will be emailed to the registered address. Check your inbox and spam folder. Delivery may wait for the sending allowance.";
export const POST = route(async req => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) throw new RequestError("Enter your registration reference and a valid registered email address.");
  const { reference, email, purpose, formSlug } = parsed.data, db = getDb();
  const ip = process.env.TRUST_PROXY === "true" ? (req.headers.get("x-forwarded-for") || "direct").split(",")[0].trim().slice(0, 100) : "direct";
  if (!accessBucket(db, "access-request-ip", ip, 100, 15 * 60000)) return NextResponse.json({ success: true, message: generic });
  const registration = db.registrations.find(registration => registration.reference_no.toUpperCase() === reference && registration.status !== "cancelled");
  const student = registration && db.students.find(student => student.id === registration.student_id && student.email.trim().toLowerCase() === email);
  const form = formSlug ? db.customForms.find(form => form.slug === formSlug && form.is_active && ["application", "workshop_rsvp"].includes(form.type) && (!form.campaign_id || form.campaign_id === registration?.campaign_id)) : undefined;
  if (registration && student && (!formSlug || form)) {
    if (!accessBucket(db, "access-request-reference", reference, 3, 3600000)) return NextResponse.json({ success: true, message: generic });
    const destination = form ? `/form/${form.slug}` : undefined;
    const key = `candidate-access:${registration.id}:${purpose}:${form?.id || "legacy"}:${Math.floor(Date.now() / 60000)}`;
    if (!db.outbox.some(job => job.payload.candidateAccess?.registrationId === registration.id && job.payload.to === student.email && ["queued", "sending", "blocked"].includes(job.status))) enqueue(db, "email", key, {
      to: student.email, toName: student.full_name, subject: "Your secure Unicom TIC access link", html: "Access link is generated securely when this email is dispatched.",
      candidateAccess: { registrationId: registration.id, purpose, destination },
      candidateContext: { stage: "registration", recordId: registration.id, registrationId: registration.id, studentId: student.id },
    });
  }
  return NextResponse.json({ success: true, message: generic });
}, false, { submission: true, bodyLimit: 8192 });

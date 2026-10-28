import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { accessBucket } from "@/lib/security/candidate-access";
import { candidateEmailSchema } from "@/lib/validations/email";
import { enqueue } from "@/lib/jobs/outbox";
import {
  admissionEmailVariables,
  renderNotification,
  savedTemplate,
} from "@/lib/email/notification-templates";
import { findPublicForm } from "@/lib/forms/public-links";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    reference: z
      .string()
      .trim()
      .min(4)
      .max(100)
      .transform((value) => value.toUpperCase()),
    email: candidateEmailSchema,
    purpose: z.enum(["status", "apply"]),
    formSlug: z.string().max(100).optional(),
  })
  .strict();
const generic =
  "If these details match a registration, a secure link will be emailed to the registered address. Check your inbox and spam folder. Delivery may wait for the sending allowance.";
export const POST = route(
  async (req) => {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success)
      throw new RequestError(
        "Enter your registration reference and a valid registered email address.",
      );
    const { reference, email, purpose, formSlug } = parsed.data,
      db = getDb();
    const ip =
      process.env.TRUST_PROXY === "true"
        ? (req.headers.get("x-forwarded-for") || "direct")
            .split(",")[0]
            .trim()
            .slice(0, 100)
        : "direct";
    if (!accessBucket(db, "access-request-ip", ip, 100, 15 * 60000))
      return NextResponse.json({ success: true, message: generic });
    const registration = db.registrations.find(
      (registration) =>
        registration.reference_no.toUpperCase() === reference &&
        registration.status !== "cancelled",
    );
    const student =
      registration &&
      db.students.find(
        (student) =>
          student.id === registration.student_id &&
          student.email.trim().toLowerCase() === email,
      );
    const targetForm = formSlug ? findPublicForm(db, formSlug) : undefined;
    const form =
      targetForm?.is_active &&
      ["application", "workshop_rsvp"].includes(targetForm.type) &&
      (!targetForm.campaign_id ||
        targetForm.campaign_id === registration?.campaign_id)
        ? targetForm
        : undefined;
    if (
      purpose === "apply" &&
      form?.type === "application" &&
      form.application_mode === "open"
    )
      return NextResponse.json({
        success: true,
        redirectTo: `/form/${form.slug}`,
        message:
          "This application is open. No prior registration or email link is required.",
      });
    if (registration && student && (!formSlug || form)) {
      const destination = form ? `/form/${form.slug}` : undefined;
      const key = `candidate-access:${registration.id}:${purpose}:${form?.id || "legacy"}:${Math.floor(Date.now() / 60000)}`;
      const alreadyRequested = db.outbox.some((job) => {
        const access = job.payload.candidateAccess;
        const slug =
          typeof access?.destination === "string"
            ? access.destination.slice("/form/".length)
            : "";
        const previousForm = slug ? findPublicForm(db, slug) : undefined;
        return (
          access?.registrationId === registration.id &&
          String(job.payload.to).trim().toLowerCase() ===
            student.email.trim().toLowerCase() &&
          (access.purpose || "status") === purpose &&
          (previousForm?.id || "legacy") === (form?.id || "legacy") &&
          (["queued", "sending", "blocked"].includes(job.status) ||
            (["sent", "uncertain"].includes(job.status) &&
              Date.parse(
                job.completed_at || job.last_attempt_at || job.created_at,
              ) >
                Date.now() - 5 * 60000))
        );
      });
      if (
        alreadyRequested ||
        !accessBucket(db, "access-request-reference", reference, 3, 3600000)
      )
        return NextResponse.json({ success: true, message: generic });
      enqueue(db, "email", key, {
        to: student.email,
        toName: student.full_name,
        ...renderNotification(db, "candidate_access", {
          ...admissionEmailVariables(db, student, registration),
          purpose:
            purpose === "apply"
              ? "complete your application"
              : "view your admissions progress",
        }),
        accessTemplate: savedTemplate(db, "candidate_access"),
        formId: form?.id,
        notificationEvent: "candidate_access",
        candidateAccess: {
          registrationId: registration.id,
          purpose,
          destination,
        },
        candidateContext: {
          stage: "registration",
          recordId: registration.id,
          registrationId: registration.id,
          studentId: student.id,
        },
      });
    }
    return NextResponse.json({ success: true, message: generic });
  },
  false,
  { submission: true, bodyLimit: 8192 },
);

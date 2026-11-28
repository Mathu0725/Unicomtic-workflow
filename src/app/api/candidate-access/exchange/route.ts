import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { candidateSession, accessBucket, CANDIDATE_COOKIE, SESSION_LIFETIME } from "@/lib/security/candidate-access";
import { findPublicForm } from "@/lib/forms/public-links";
import { formAvailabilityProblem } from "@/lib/forms/field-rules";
export const dynamic = "force-dynamic";
export const POST = route(async req => {
  const { token } = await req.json();
  if (typeof token !== "string" || token.length > 3000) throw new RequestError("Open the complete secure link from your email.");
  const db = getDb(), access = candidateSession(db, token);
  if (!accessBucket(db, "access-exchange", access.registration.id, 20, 15 * 60000)) return NextResponse.json({ success: false, code: "RATE_LIMITED", message: "Please wait before opening this link again." }, { status: 429 });
  const destination = access.claims.destination;
  const formKey = typeof destination === "string" ? /^\/form\/([a-z0-9-]+)$/.exec(destination)?.[1] : undefined;
  const targetForm = formKey ? findPublicForm(db, formKey) : undefined;
  const form = targetForm?.is_active && (!targetForm.campaign_id || targetForm.campaign_id === access.registration.campaign_id) ? targetForm : undefined;
  if (destination && !form) throw new RequestError("This form is closed. Contact admissions for the current application link.", 409);
  const matchingApplications = !destination && access.claims.purpose === "apply"
    ? db.customForms.filter(candidate => candidate.type === "application" && candidate.campaign_id === access.registration.campaign_id && !formAvailabilityProblem(candidate))
    : [];
  const applicationForm = matchingApplications.length === 1 ? matchingApplications[0] : undefined;
  const redirectTo = form || applicationForm
    ? `/form/${(form || applicationForm)!.slug}`
    : `/${access.claims.purpose === "apply" ? "apply" : "status"}?ref=${encodeURIComponent(access.registration.reference_no)}`;
  const response = NextResponse.json({ success: true, redirectTo });
  response.cookies.set(CANDIDATE_COOKIE, access.cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_LIFETIME / 1000 });
  return response;
}, false, { bodyLimit: 8192 });

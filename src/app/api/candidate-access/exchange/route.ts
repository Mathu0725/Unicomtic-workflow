import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { candidateSession, accessBucket, CANDIDATE_COOKIE, SESSION_LIFETIME } from "@/lib/security/candidate-access";
export const dynamic = "force-dynamic";
export const POST = route(async req => {
  const { token } = await req.json();
  if (typeof token !== "string" || token.length > 3000) throw new RequestError("Open the complete secure link from your email.");
  const db = getDb(), access = candidateSession(db, token);
  if (!accessBucket(db, "access-exchange", access.registration.id, 20, 15 * 60000)) return NextResponse.json({ success: false, code: "RATE_LIMITED", message: "Please wait before opening this link again." }, { status: 429 });
  const destination = access.claims.destination;
  const form = destination && db.customForms.find(form => `/form/${form.slug}` === destination && form.is_active && (!form.campaign_id || form.campaign_id === access.registration.campaign_id));
  if (destination && !form) throw new RequestError("This form is closed. Contact admissions for the current application link.", 409);
  const redirectTo = form ? destination : `/${access.claims.purpose === "apply" ? "apply" : "status"}?ref=${encodeURIComponent(access.registration.reference_no)}`;
  const response = NextResponse.json({ success: true, redirectTo });
  response.cookies.set(CANDIDATE_COOKIE, access.cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_LIFETIME / 1000 });
  return response;
}, false, { bodyLimit: 8192 });

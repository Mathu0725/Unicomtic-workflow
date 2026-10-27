import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { requireCandidateAccess } from "@/lib/security/candidate-access";
export const dynamic = "force-dynamic";
export const GET = route(async req => {
  try { const access = requireCandidateAccess(getDb(), req); return NextResponse.json({ success: true, verified: true, reference: access.registration.reference_no, expires: access.claims.expires }); }
  catch { return NextResponse.json({ success: true, verified: false }); }
});

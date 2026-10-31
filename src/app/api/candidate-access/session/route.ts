import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { requireCandidateAccess } from "@/lib/security/candidate-access";
import { findPublicForm } from "@/lib/forms/public-links";
import { candidateSessionAllowsForm } from "@/lib/forms/access";
export const dynamic = "force-dynamic";
export const GET = route(async req => {
  try {
    const db = getDb(), access = requireCandidateAccess(db, req);
    const formSlug = req.nextUrl.searchParams.get("formSlug");
    if (formSlug) {
      const form = findPublicForm(db, formSlug);
      if (!form?.is_active || form.campaign_id !== access.registration.campaign_id || !candidateSessionAllowsForm(form, access.claims))
        return NextResponse.json({ success: true, verified: false });
    }
    return NextResponse.json({ success: true, verified: true, reference: access.registration.reference_no, expires: access.claims.expires });
  }
  catch { return NextResponse.json({ success: true, verified: false }); }
});

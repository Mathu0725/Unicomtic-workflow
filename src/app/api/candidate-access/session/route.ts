import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { requireCandidateAccess, requireWorkshopAccess } from "@/lib/security/candidate-access";
import { findPublicForm } from "@/lib/forms/public-links";
import { candidateSessionAllowsForm } from "@/lib/forms/access";
export const dynamic = "force-dynamic";
export const GET = route(async req => {
  try {
    const db = getDb();
    const formSlug = req.nextUrl.searchParams.get("formSlug");
    const form = formSlug ? findPublicForm(db, formSlug) : undefined;
    const access = form?.type === "workshop_rsvp"
      ? requireWorkshopAccess(db, req, form.id)
      : requireCandidateAccess(db, req);
    if (formSlug) {
      if (!form?.is_active || form.campaign_id !== access.registration.campaign_id || (form.type !== "workshop_rsvp" && !candidateSessionAllowsForm(form, access.claims)))
        return NextResponse.json({ success: true, verified: false });
    }
    return NextResponse.json({ success: true, verified: true, reference: access.registration.reference_no, expires: access.claims.expires });
  }
  catch { return NextResponse.json({ success: true, verified: false }); }
});

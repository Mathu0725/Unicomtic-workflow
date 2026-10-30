import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { availableWorkshops } from "@/lib/admissions/service";
import { getDb } from "@/lib/data/store";
import { requireCandidateAccess } from "@/lib/security/candidate-access";
import { legacyWorkshopConfig } from "@/lib/workshops/legacy";
export const dynamic = "force-dynamic";
export const GET = route(async req => {
  const db = getDb(), flow = req.nextUrl.searchParams.get("flow") === "application" ? "application" : "registration";
  const campaignId = flow === "application" ? requireCandidateAccess(db, req).registration.campaign_id : req.nextUrl.searchParams.get("campaignId") || db.campaigns.find(c => c.is_active)?.id;
  const config = campaignId ? legacyWorkshopConfig(db, campaignId, flow) : undefined;
  return NextResponse.json({ success: true, workshops: campaignId ? availableWorkshops(campaignId, config) : [],
    config: config ? { enabled: config.enabled, required: config.required, label: config.label, help_text: config.help_text, empty_message: config.empty_message, show_remaining: config.show_remaining } : { enabled: true, required: false } }, { headers: { "Cache-Control": "no-store" } });
});

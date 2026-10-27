import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { campaignPatchSchema } from "@/lib/validations/admin";
import { getSession } from "@/lib/security/session";

async function handleGET() {
  const db = getDb();
  return NextResponse.json({
    success: true,
    campaigns: db.campaigns,
    courses: db.courses,
  });
}

async function handlePATCH(req: NextRequest) {
  try {
    const body = campaignPatchSchema.parse(await req.json());
    const { id, auto_invite_applications, is_active } = body;
    const db = getDb();

    const campaign = db.campaigns.find((c) => c.id === id);
    if (!campaign) {
      return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    }

    if (auto_invite_applications !== undefined) {
      campaign.auto_invite_applications = auto_invite_applications;
    }
    if (is_active !== undefined) {
      campaign.is_active = is_active;
    }

    db.auditLogs.push({
      id: `log-${Date.now()}`,
      user_email: getSession(req)!.email,
      action: "CAMPAIGN_UPDATED",
      entity_name: "campaigns",
      entity_id: id,
      changes: { auto_invite_applications, is_active },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      campaign,
      message: "Campaign settings updated successfully.",
    });
  } catch (err: any) {
    throw err;
  }
}

export const GET = route(handleGET, true);

export const PATCH = route(handlePATCH, true);

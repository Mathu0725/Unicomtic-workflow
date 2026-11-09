import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { campaignCreateSchema, campaignPatchSchema } from "@/lib/validations/admin";
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

function campaignCode(academicYear: string, used: Set<string>) {
  const year = academicYear.match(/\d{4}/)?.[0] || "INTAKE";
  const base = `TIC-${year}`;
  let code = base, number = 2;
  while (used.has(code)) code = `${base}-${number++}`;
  return code;
}

async function handlePOST(req: NextRequest) {
  const input = campaignCreateSchema.parse(await req.json());
  const db = getDb();
  const title = input.title.trim(), academicYear = input.academic_year.trim();
  if (db.campaigns.some(item => item.title.trim().toLowerCase() === title.toLowerCase() && item.academic_year.trim().toLowerCase() === academicYear.toLowerCase()))
    return NextResponse.json({ success: false, message: "An intake with this name and academic year already exists." }, { status: 409 });
  const campaign = {
    id: `camp-${randomUUID()}`,
    code: campaignCode(academicYear, new Set(db.campaigns.map(item => item.code))),
    title,
    academic_year: academicYear,
    description: input.description.trim(),
    auto_invite_applications: input.auto_invite_applications,
    is_active: input.is_active,
    start_date: input.start_date,
    end_date: input.end_date,
  };
  db.campaigns.push(campaign);
  db.auditLogs.push({
    id: randomUUID(),
    user_email: getSession(req)!.email,
    action: "CAMPAIGN_CREATED",
    entity_name: "campaigns",
    entity_id: campaign.id,
    changes: { title: campaign.title, academic_year: campaign.academic_year, is_active: campaign.is_active },
    created_at: new Date().toISOString(),
  });
  return NextResponse.json({ success: true, campaign, message: `${campaign.academic_year} intake created.` });
}

export const GET = route(handleGET, true);

export const PATCH = route(handlePATCH, true);

export const POST = route(handlePOST, true);


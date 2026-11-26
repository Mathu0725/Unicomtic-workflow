import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { GOOGLE_DRIVE_SCOPE, googleAccessToken, hasDriveAccess } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const connection = getDb().integrations.google;
  if (!connection) throw new RequestError("Connect Google Sheets & Gmail first.", 409);
  if (!hasDriveAccess())
    throw new RequestError(
      "Allow Google Drive file access first, then return here to choose a spreadsheet.",
      409,
      { code: "GOOGLE_DRIVE_SCOPE_MISSING" },
    );

  const developerKey = process.env.GOOGLE_PICKER_API_KEY || "";
  const appId = process.env.GOOGLE_CLOUD_PROJECT_NUMBER || "";
  if (!developerKey || !/^\d+$/.test(appId))
    throw new RequestError(
      "Google Picker is not configured. Add GOOGLE_PICKER_API_KEY and GOOGLE_CLOUD_PROJECT_NUMBER after enabling the Google Picker API.",
      503,
      { code: "GOOGLE_PICKER_NOT_CONFIGURED" },
    );

  // Only the short-lived access token reaches the authorized browser session.
  // The encrypted refresh token and OAuth client secret remain server-side.
  return NextResponse.json({
    success: true,
    accessToken: await googleAccessToken(GOOGLE_DRIVE_SCOPE),
    developerKey,
    appId,
  }, { headers: { "Cache-Control": "private, no-store" } });
}, true, { readOnly: true });


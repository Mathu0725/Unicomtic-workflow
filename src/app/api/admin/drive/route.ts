import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { hasDriveAccess } from "@/lib/google/oauth";
import { createDocumentsFolder } from "@/lib/google/drive-service";
export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const db = getDb(), google = db.integrations.google;
  const folder = db.integrations.drive_documents?.google_email === google?.email ? db.integrations.drive_documents : null;
  return NextResponse.json({ success: true, connected: hasDriveAccess(), email: google?.email || null, folder });
}, true);
export const POST = route(async req => {
  const body = await req.json();
  if (body.action !== "create_folder") throw new RequestError("Unknown Drive action.");
  const folderId = await createDocumentsFolder();
  return NextResponse.json({ success: true, folderId, message: "Student documents folder is ready. Add File upload questions in Form Builder to accept documents." });
}, true, { database: false });

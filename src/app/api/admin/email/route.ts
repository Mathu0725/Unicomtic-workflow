import { route, RequestError } from "@/lib/http";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { verifySmtpConnection, getDefaultSmtpConfig, SmtpConfig } from "@/lib/email/smtp-client";
import { createGmailDraft } from "@/lib/email/gmail-drafts";
import { ProviderError } from "@/lib/errors/provider-error";

async function handleGET() {
  const db = getDb();
  return NextResponse.json({
    success: true,
    emailAccounts: db.emailAccounts,
    emailJobs: db.emailJobs.slice(-50), // Last 50 jobs
  });
}

async function handlePOST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const db = getDb();

    if (action === "verify_saved") {
      const verification = await verifySmtpConnection(getDefaultSmtpConfig());
      return NextResponse.json(verification, { status: verification.success ? 200 : 400 });
    }

    if (action === "test_smtp") {
      const { host, port, secure, username, password, fromEmail, testRecipient } = body;
      if (testRecipient) throw new RequestError("Save your SMTP settings, then use Email Center's test notification. All messages must use the delivery queue and daily allowance.");
      const config: SmtpConfig = {
        host: host || "smtp.gmail.com",
        port: Number(port) || 587,
        secure: Boolean(secure),
        username: username || "",
        password: password || "",
        fromName: "Unicom TIC Test",
        fromEmail: fromEmail || "admissions@unicomtic.org",
      };

      const verification = await verifySmtpConnection(config);
      if (!verification.success) {
        return NextResponse.json({ success: false, message: verification.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: "SMTP connection verified successfully." });
    }

    if (action === "create_gmail_draft") {
      const { accessToken, to, subject, htmlBody } = body;
      if (!accessToken) {
        return NextResponse.json({ success: false, message: "Google OAuth access token is required." }, { status: 400 });
      }
      const draftRes = await createGmailDraft({ accessToken, to, subject, htmlBody });
      if (!draftRes.success) throw new ProviderError("GMAIL_DRAFT_FAILED", draftRes.error || "Gmail did not confirm this draft. Check Drafts before trying again.", "blocked");
      return NextResponse.json(draftRes);
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    throw err;
  }
}

export const GET = route(handleGET, true);

export const POST = route(handlePOST, true, { readOnly: true });

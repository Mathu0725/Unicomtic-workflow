/**
 * Gmail Drafts Integration
 * Supports creating drafts in staff Gmail accounts for manual review prior to sending.
 */

export interface CreateGmailDraftParams {
  accessToken: string;
  to: string;
  subject: string;
  htmlBody: string;
}

export interface GmailDraftResult {
  success: boolean;
  draftId?: string;
  error?: string;
}

export async function createGmailDraft({
  accessToken,
  to,
  subject,
  htmlBody,
}: CreateGmailDraftParams): Promise<GmailDraftResult> {
  try {
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
    const messageParts = [
      `To: ${to}`,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
      `Subject: ${utf8Subject}`,
      "",
      htmlBody,
    ];
    const message = messageParts.join("\r\n");

    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            raw: encodedMessage,
          },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      return {
        success: false,
        error: "Gmail could not create this draft. Check account permissions before trying again.",
      };
    }

    const data = await response.json();
    return {
      success: true,
      draftId: data.id,
    };
  } catch (err: any) {
    return {
      success: false,
      error: "Gmail did not confirm this draft. Check Drafts before trying again.",
    };
  }
}

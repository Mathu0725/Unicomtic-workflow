import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { formCampaignSchema, prepareFormCampaign } from "@/lib/email/form-campaigns";

export const POST = route(async req => {
  const parsed = formCampaignSchema.safeParse(await req.json());
  if (!parsed.success) throw new RequestError("Select a form, recipients, template and sender.");
  const result = prepareFormCampaign(getDb(), parsed.data);
  return NextResponse.json({ success: true, totalResponses: result.totalResponses, matchingResponses: result.matchingResponses, recipientCount: result.messages.length,
    preview: result.messages.slice(0, 3).map(message => ({ reference: message.reference, to: message.to, subject: message.subject, text: message.text })),
    templateId: result.template.id, accountId: result.accountId,
  });
}, true, { readOnly: true });

import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { prepareManualEmail } from "@/lib/email/manual";
export const dynamic = "force-dynamic";
export const POST = route(
  async (req) => {
    const { messages, duplicateCount } = prepareManualEmail(
      getDb(),
      await req.json(),
    );
    return NextResponse.json({
      success: true,
      recipientCount: messages.length,
      duplicateCount,
      previews: messages
        .slice(0, 10)
        .map((message) => ({
          to: message.to,
          name: message.toName,
          subject: message.subject,
          text: message.text,
        })),
    });
  },
  true,
  { readOnly: true },
);

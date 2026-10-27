import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/security/session";
import { route, RequestError } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = route(async (req: NextRequest) => {
    const user = getSession(req);
    if (!user) throw new RequestError("Please sign in.", 401, { code: "SESSION_REQUIRED", action: "sign_in" });
    return NextResponse.json({ success: true, user });
}, false, { database: false });

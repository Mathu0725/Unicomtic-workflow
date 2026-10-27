import { NextResponse } from "next/server";
import { route } from "@/lib/http";
export const POST = route(async () => {
    const res = NextResponse.json({ success: true });
    res.cookies.delete("unicom_staff_session");
    return res;
}, false, { database: false });

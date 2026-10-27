import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { appSecret } from "./secrets";
export type StaffUser = {
    email: string;
    name: string;
    role: string;
};
export const SESSION_COOKIE = "unicom_staff_session";
export function signSession(user: StaffUser) {
    const data = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 7 * 86400000 })).toString("base64url");
    return `${data}.${createHmac("sha256", appSecret()).update(data).digest("base64url")}`;
}
export function getSession(req: NextRequest): StaffUser | null {
    try {
        const [data, signature] = (req.cookies.get(SESSION_COOKIE)?.value || "").split(".");
        const expected = createHmac("sha256", appSecret()).update(data).digest();
        const actual = Buffer.from(signature, "base64url");
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
            return null;
        const user = JSON.parse(Buffer.from(data, "base64url").toString());
        return user.exp > Date.now() && user.email ? user : null;
    }
    catch {
        return null;
    }
}
export function canAccess(user: StaffUser, pathname: string) {
    if (["super_admin", "admin"].includes(user.role))
        return true;
    if (user.role === "entrance_staff")
        return /\/(attendance|workshops)(\/|$)/.test(pathname);
    if (user.role === "examiner")
        return /\/(exams|marks-import|interviews|eligibility)(\/|$)/.test(pathname);
    return false;
}
export function safeEqual(a: string, b: string) {
    const aa = createHmac("sha256", appSecret()).update(a).digest();
    const bb = createHmac("sha256", appSecret()).update(b).digest();
    return timingSafeEqual(aa, bb);
}

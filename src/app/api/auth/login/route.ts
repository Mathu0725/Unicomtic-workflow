import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { canAccess, safeEqual, SESSION_COOKIE, signSession, type StaffUser } from "@/lib/security/session";
import { readDatabase } from "@/lib/data/repository";
import { configuredAdministratorEmail, verifyStaffPassword } from "@/lib/security/staff-accounts";
import { staffHomePath, staffRoleOptions } from "@/lib/security/staff-roles";
export const dynamic = "force-dynamic";
export const POST = route(async (req) => {
    const { email, password, returnTo } = await req.json();
    const allowedEmail = configuredAdministratorEmail();
    const allowedPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV !== "production" ? "admin" : "");
    if (!allowedEmail || !allowedPassword)
        throw new RequestError("Administrator login needs server configuration. Contact admissions.", 503, { code: "AUTH_NOT_CONFIGURED" });
    const invalid = () => new RequestError("Invalid email or password.", 401, { code: "INVALID_CREDENTIALS" });
    if (typeof email !== "string" || email.length > 254 || typeof password !== "string" || password.length > 1024)
        throw invalid();
    let user: StaffUser;
    if (email.trim().toLowerCase() === allowedEmail) {
        if (!safeEqual(password, allowedPassword)) throw invalid();
        user = { email: allowedEmail, name: "Admissions Administrator", role: "super_admin" };
    } else {
        const account = (await readDatabase()).staffAccounts.find(account => account.email === email.trim().toLowerCase());
        const valid = await verifyStaffPassword(password, account?.password_hash);
        if (!account || !valid || !staffRoleOptions.some(role => role.value === account.role)) throw invalid();
        user = { email: account.email, name: account.name, role: account.role };
    }
    let redirectTo = staffHomePath(user.role);
    if (typeof returnTo === "string" && /^\/admin(?:\/|$)/.test(returnTo) && !returnTo.includes("\\")) {
        const target = new URL(returnTo, req.nextUrl.origin);
        if (target.origin === req.nextUrl.origin && /^\/admin(?:\/|$)/.test(target.pathname) && canAccess(user, target.pathname)) redirectTo = `${target.pathname}${target.search}${target.hash}`;
    }
    const res = NextResponse.json({ success: true, user, redirectTo });
    res.cookies.set(SESSION_COOKIE, signSession(user), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 604800 });
    return res;
}, false, { database: false, bodyLimit: 8192 });

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getSession } from "@/lib/security/session";
import { getDb } from "@/lib/data/store";
import { configuredAdministratorEmail, hashStaffPassword, publicStaffAccount, type StaffAccount } from "@/lib/security/staff-accounts";
export const dynamic = "force-dynamic";

export const GET = route(async req => {
    const user = getSession(req)!;
    const email = configuredAdministratorEmail();
    const administrator = email ? [{ id: "server-administrator", name: "Admissions Administrator", email, role: "super_admin", createdAt: null, source: "Server administrator" }] : [];
    return NextResponse.json({ success: true, currentUser: user, accounts: [...administrator, ...getDb().staffAccounts.map(publicStaffAccount)], managementAvailable: user.role === "super_admin" });
}, true);

const createUserSchema = z.object({
    name: z.string().trim().min(2, "Enter at least 2 characters.").max(100),
    email: z.string().trim().toLowerCase().email("Enter a valid staff email.").max(254),
    password: z.string().min(12, "Use at least 12 characters.").max(128, "Use no more than 128 characters.").refine(value => value.trim().length > 0, "Enter a password, not just spaces."),
    role: z.enum(["admin", "entrance_staff", "examiner"]),
}).strict();

export const POST = route(async req => {
    const actor = getSession(req)!;
    if (actor.role !== "super_admin") throw new RequestError("Only a Super Admin can create staff users.", 403, { code: "FORBIDDEN" });
    const input = createUserSchema.parse(await req.json());
    const db = getDb();
    if (input.email === configuredAdministratorEmail() || db.staffAccounts.some(account => account.email.toLowerCase() === input.email))
        throw new RequestError("A staff account already uses this email.", 409, { code: "STAFF_EMAIL_EXISTS", fieldErrors: { email: ["This email already has staff access. Use a different email."] } });
    const account: StaffAccount = { id: randomUUID(), name: input.name, email: input.email, role: input.role, password_hash: await hashStaffPassword(input.password), created_at: new Date().toISOString(), created_by: actor.email };
    db.staffAccounts.push(account);
    db.auditLogs.push({ id: randomUUID(), user_email: actor.email, action: "STAFF_USER_CREATED", entity_name: "staff_accounts", entity_id: account.id, changes: { name: account.name, email: account.email, role: account.role }, created_at: account.created_at });
    return NextResponse.json({ success: true, account: publicStaffAccount(account), message: "Staff user created. They can now sign in with their email and password." }, { status: 201 });
}, true, { bodyLimit: 8192 });

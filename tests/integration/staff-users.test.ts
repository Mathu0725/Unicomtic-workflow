import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET as listUsers, POST as createUser } from "../../src/app/api/admin/users/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { GET as readSettings } from "../../src/app/api/admin/settings/route";
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { canAccess, getSession, SESSION_COOKIE, signSession } from "../../src/lib/security/session";
import { hashStaffPassword, verifyStaffPassword } from "../../src/lib/security/staff-accounts";

let dir: string;
const password = "Test-only password 123!";
const input = { name: "Test Staff", email: "new-staff@example.test", password, role: "entrance_staff" };
function request(url: string, body?: unknown, role?: string, cookie?: string) {
  return new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-forwarded-for": "staff-users-tests", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(role || cookie ? { cookie: cookie || `${SESSION_COOKIE}=${signSession({ name: "Operator", email: "root@example.test", role: role! })}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function create(body: Record<string, unknown> = input) {
  return createUser(request("/api/admin/users", body, "super_admin"), undefined);
}
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tic-staff-users-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv("APP_SECRET", "staff-test-secret-with-at-least-32-characters");
  vi.stubEnv("ADMIN_EMAIL", "root@example.test");
  vi.stubEnv("ADMIN_PASSWORD", "Existing root password");
  await transaction(() => {});
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

describe("Staff account creation and sign-in", () => {
  it("requires a signed session and reserves creation for Super Admin", async () => {
    expect((await listUsers(request("/api/admin/users"), undefined)).status).toBe(401);
    expect((await createUser(request("/api/admin/users", input), undefined)).status).toBe(401);
    for (const role of ["admin", "examiner", "entrance_staff"]) {
      expect((await createUser(request("/api/admin/users", input, role), undefined)).status).toBe(403);
    }
    expect((await readDatabase()).staffAccounts).toHaveLength(0);
  });

  it("persists a normalized account, redacts credentials and records its creator", async () => {
    const response = await create({ ...input, name: "  Test Staff  ", email: "  New-Staff@Example.Test  " });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.account).toMatchObject({ name: "Test Staff", email: input.email, role: input.role });
    expect(json.account).not.toHaveProperty("password");
    expect(json.account).not.toHaveProperty("password_hash");
    expect(JSON.stringify(json)).not.toContain(password);
    expect(JSON.stringify(json)).not.toMatch(/scrypt/);
    const db = await readDatabase();
    expect(db.staffAccounts[0]).toMatchObject({ name: "Test Staff", email: input.email, created_by: "root@example.test" });
    expect(db.staffAccounts[0].password_hash).toMatch(/^scrypt-v1\$/);
    expect(await readFile(path.join(dir, "platform.json"), "utf8")).not.toContain(password);
    expect(db.auditLogs).toHaveLength(1);
    expect(db.auditLogs[0]).toMatchObject({ action: "STAFF_USER_CREATED", entity_id: json.account.id });
    expect(JSON.stringify(db.auditLogs)).not.toMatch(/password|scrypt/);
    const list = await (await listUsers(request("/api/admin/users", undefined, "super_admin"), undefined)).json();
    expect(list).toMatchObject({ managementAvailable: true });
    expect(list.accounts).toHaveLength(2);
    expect(JSON.stringify(list)).not.toMatch(/password|scrypt|created_by/);
  });

  it.each(["admin", "entrance_staff", "examiner"])("allows a created %s to sign in and routes them to a permitted module", async role => {
    expect((await create({ ...input, role })).status).toBe(201);
    const response = await login(request("/api/auth/login", { email: " NEW-STAFF@EXAMPLE.TEST ", password, returnTo: "/admin/users" }), undefined);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.user).toEqual({ name: input.name, email: input.email, role });
    expect(json.redirectTo).toBe(role === "admin" ? "/admin/users" : role === "entrance_staff" ? "/admin/attendance" : "/admin/exams");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    const authenticated = request("/api/admin/settings", undefined, undefined, cookie.split(";")[0]);
    const session = getSession(authenticated)!;
    expect(session.role).toBe(role);
    expect(canAccess(session, "/api/admin/users")).toBe(role === "admin");
    expect((await readSettings(authenticated, undefined)).status).toBe(role === "admin" ? 200 : 403);
    expect(JSON.stringify(json)).not.toMatch(/password|scrypt/);
  });

  it("rejects duplicate and bootstrap-admin emails without changing credentials", async () => {
    expect((await create()).status).toBe(201);
    expect((await create({ ...input, email: "NEW-STAFF@EXAMPLE.TEST", password: "Different password 456!" })).status).toBe(409);
    expect((await create({ ...input, email: " ROOT@EXAMPLE.TEST " })).status).toBe(409);
    expect((await readDatabase()).staffAccounts).toHaveLength(1);
    expect((await login(request("/api/auth/login", { email: input.email, password }), undefined)).status).toBe(200);
  });

  it("deduplicates two simultaneous creates", async () => {
    const responses = await Promise.all([create(), create()]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect((await readDatabase()).staffAccounts).toHaveLength(1);
  });

  it.each([
    { password: "short" }, { password: " ".repeat(12) }, { password: "a".repeat(129) },
    { email: "invalid-email" }, { name: " " }, { role: "super_admin" }, { role: "unknown" },
    { password_hash: "client-controlled-hash" },
  ])("validates staff input without saving it (%j)", async overrides => {
    expect((await create({ ...input, ...overrides })).status).toBe(400);
    expect((await readDatabase()).staffAccounts).toHaveLength(0);
  });

  it("keeps invalid-password and unknown-account responses generic", async () => {
    await create();
    for (const email of [input.email, "unknown@example.test"]) {
      const response = await login(request("/api/auth/login", { email, password: "Wrong password" }), undefined);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "INVALID_CREDENTIALS", message: "Invalid email or password." });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("does not treat a connected Google email as a staff credential", async () => {
    await transaction(db => { db.integrations.google = { email: "connected@example.test" } as any; });
    const listing = await (await listUsers(request("/api/admin/users", undefined, "super_admin"), undefined)).json();
    expect(listing.accounts.map((account: any) => account.email)).toEqual(["root@example.test"]);
    expect((await login(request("/api/auth/login", { email: "connected@example.test", password }), undefined)).status).toBe(401);
  });

  it("retains bootstrap sign-in and rejects external or disallowed return paths", async () => {
    for (const returnTo of ["https://other.example/admin", "/admin/../login", "/admin\\other", "/admin/%2e%2e/login"]) {
      const response = await login(request("/api/auth/login", { email: "ROOT@EXAMPLE.TEST", password: "Existing root password", returnTo }), undefined);
      expect(await response.json()).toMatchObject({ user: { role: "super_admin" }, redirectTo: "/admin" });
    }
    await create({ ...input, role: "examiner" });
    const permitted = await login(request("/api/auth/login", { email: input.email, password, returnTo: "/admin/interviews?view=panel" }), undefined);
    expect(await permitted.json()).toMatchObject({ redirectTo: "/admin/interviews?view=panel" });
  });

  it("loads pre-feature snapshots with no staff users and rejects malformed account storage", async () => {
    const file = path.join(dir, "platform.json");
    const snapshot = JSON.parse(await readFile(file, "utf8"));
    delete snapshot.data.staffAccounts;
    await writeFile(file, JSON.stringify(snapshot));
    expect((await readDatabase()).staffAccounts).toEqual([]);
    expect((await create()).status).toBe(201);
    const saved = JSON.parse(await readFile(file, "utf8"));
    saved.data.staffAccounts = null;
    await writeFile(file, JSON.stringify(saved));
    await expect(readDatabase()).rejects.toMatchObject({ code: "STORAGE_CORRUPT" });
  });

  it("uses unique salts and verifies without accepting truncated or malformed hashes", async () => {
    const first = await hashStaffPassword(password), second = await hashStaffPassword(password);
    expect(first).not.toBe(second);
    expect(await verifyStaffPassword(password, first)).toBe(true);
    expect(await verifyStaffPassword("wrong", first)).toBe(false);
    expect(await verifyStaffPassword(password, first.slice(0, -2))).toBe(false);
  });
});

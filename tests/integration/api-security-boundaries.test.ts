import { readdir } from "node:fs/promises";
import path from "node:path";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { route } from "../../src/lib/http";
import { canAccess, signSession, SESSION_COOKIE } from "../../src/lib/security/session";

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
async function routes(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? routes(path.join(dir, entry.name))
    : Promise.resolve(entry.name === "route.ts" ? [path.join(dir, entry.name)] : [])))).flat();
}
const files = await routes(path.resolve("src/app/api/admin"));
beforeAll(() => {
  vi.stubEnv("APP_SECRET", "isolated-api-boundary-test-secret-32-characters");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost");
});
afterAll(() => vi.unstubAllEnvs());

// Invoke actual route exports: an unprotected handler cannot pass just because
// a source file happens to contain an authentication-related string.
for (const file of files) {
  const url = "/" + path.relative(path.resolve("src/app"), path.dirname(file)).replaceAll("\\", "/");
  it(`denies anonymous and forged staff sessions on every method of ${url}`, async () => {
    const module = await import(file.replaceAll("\\", "/"));
    const exported = methods.filter(method => typeof module[method] === "function");
    expect(exported.length).toBeGreaterThan(0);
    for (const method of exported) {
      for (const cookie of ["", `${SESSION_COOKIE}=forged.invalid`]) {
        const request = new NextRequest(`http://localhost${url}`, { method, headers: { cookie } });
        const response = await module[method](request, { params: Promise.resolve({ id: "security-test-id" }) });
        expect(response.status, `${method} ${url} cookie=${cookie ? "forged" : "absent"}`).toBe(401);
        expect((await response.json()).code).toBe("SESSION_REQUIRED");
      }
      for (const role of ["entrance_staff", "examiner", "unknown"]) {
        const user = { email: "synthetic@example.com", name: "Synthetic", role };
        if (canAccess(user, url)) continue;
        const request = new NextRequest(`http://localhost${url}`, {
          method, headers: { cookie: `${SESSION_COOKIE}=${signSession(user)}` },
        });
        const response = await module[method](request, { params: Promise.resolve({ id: "security-test-id" }) });
        expect(response.status, `${role}: ${method} ${url}`).toBe(403);
      }
    }
  });
}

it.each(["entrance_staff", "examiner", "unknown"])("rejects %s before executing a privileged handler", async role => {
  const handler = vi.fn(async () => NextResponse.json({ success: true }));
  const guarded = route(handler, true, { database: false });
  const cookie = `${SESSION_COOKIE}=${signSession({ email: "synthetic@example.com", name: "Synthetic", role })}`;
  const response = await guarded(new NextRequest("http://localhost/api/admin/users", { headers: { cookie } }), undefined);
  expect(response.status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});

it("rejects a foreign-origin authenticated mutation before invoking its handler", async () => {
  const handler = vi.fn(async () => NextResponse.json({ success: true }));
  const cookie = `${SESSION_COOKIE}=${signSession({ email: "synthetic@example.com", name: "Synthetic", role: "admin" })}`;
  const response = await route(handler, true, { database: false })(new NextRequest("http://localhost/api/admin/users", {
    method: "POST", headers: { cookie, origin: "https://untrusted.example", host: "localhost" },
  }), undefined);
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe("ORIGIN_REJECTED");
  expect(handler).not.toHaveBeenCalled();
});

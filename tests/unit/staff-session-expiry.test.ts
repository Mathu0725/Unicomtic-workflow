import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession } from "../../src/lib/security/session";

describe("staff session expiration", () => {
  afterEach(() => vi.useRealTimers());

  it("expires a newly signed staff session after one day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T09:00:00.000Z"));
    const token = signSession({ email: "staff@example.test", name: "Staff", role: "admin" });
    const req = new NextRequest("https://example.test/api/auth/session", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(SESSION_MAX_AGE_SECONDS).toBe(86400);
    vi.advanceTimersByTime(SESSION_MAX_AGE_SECONDS * 1000 - 1);
    expect(getSession(req)?.email).toBe("staff@example.test");
    vi.advanceTimersByTime(1);
    expect(getSession(req)).toBeNull();
  });
});

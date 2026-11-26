import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET } from "../../src/app/api/admin/google-picker/route";
import * as google from "../../src/lib/google/oauth";
import { transaction } from "../../src/lib/data/repository";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";

let directory: string;
const admin = {
  email: "admin@example.test",
  name: "Admin",
  role: "super_admin" as const,
};

function request(authorized = true) {
  return new NextRequest("http://localhost/api/admin/google-picker", {
    headers: authorized
      ? {
          cookie: `${SESSION_COOKIE}=${signSession(admin)}`,
        }
      : {},
  });
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-google-picker-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv("APP_SECRET", "picker-test-secret-at-least-32-characters-long");
  vi.stubEnv("GOOGLE_PICKER_API_KEY", "browser-api-key");
  vi.stubEnv("GOOGLE_CLOUD_PROJECT_NUMBER", "1234567890");
  await transaction((db) => {
    db.integrations.google = {
      email: "connected@example.test",
      refresh_token: "encrypted-refresh-token",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
      connected_at: new Date().toISOString(),
    };
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it("returns a short-lived access token and public Picker config to an admin", async () => {
  const token = vi.spyOn(google, "googleAccessToken").mockResolvedValue("short-lived-access-token");
  const response = await GET(request(), undefined);
  expect(response.status).toBe(200);
  expect(token).toHaveBeenCalledWith(google.GOOGLE_DRIVE_SCOPE);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({
    success: true,
    accessToken: "short-lived-access-token",
    developerKey: "browser-api-key",
    appId: "1234567890",
  });
});

it("does not expose an access token to signed-out users", async () => {
  const token = vi.spyOn(google, "googleAccessToken");
  expect((await GET(request(false), undefined)).status).toBe(401);
  expect(token).not.toHaveBeenCalled();
});

it("requires the user to grant the per-file Drive scope", async () => {
  await transaction((db) => {
    db.integrations.google!.scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  });
  const token = vi.spyOn(google, "googleAccessToken");
  const response = await GET(request(), undefined);
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("GOOGLE_DRIVE_SCOPE_MISSING");
  expect(token).not.toHaveBeenCalled();
});

it("requires Google Picker API configuration", async () => {
  vi.stubEnv("GOOGLE_PICKER_API_KEY", "");
  const token = vi.spyOn(google, "googleAccessToken");
  const response = await GET(request(), undefined);
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe("GOOGLE_PICKER_NOT_CONFIGURED");
  expect(token).not.toHaveBeenCalled();
});


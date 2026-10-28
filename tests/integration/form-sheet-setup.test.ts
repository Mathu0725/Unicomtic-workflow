import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST } from "../../src/app/api/admin/forms/[id]/sheets/route";
import { transaction, readDatabase } from "../../src/lib/data/repository";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import * as google from "../../src/lib/google/oauth";
let directory: string;
const id = "form-reg-2025",
  context = { params: { id } };
function request(body: unknown, role = "super_admin") {
  return new NextRequest(`http://localhost/api/admin/forms/${id}/sheets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(role
        ? {
            Cookie: `${SESSION_COOKIE}=${signSession({ email: "editor@example.com", name: "Editor", role })}`,
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-sheet-setup-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co");
  vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv("APP_SECRET", "sheet-setup-test-secret-at-least-32-characters");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await transaction((db) => {
    db.integrations.google = {
      email: "connected@example.com",
      refresh_token: "test",
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      connected_at: new Date().toISOString(),
    };
    db.integrations.registration_sheet_id = "global-destination";
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it("inspects the selected spreadsheet and returns its worksheets without writing to Google", async () => {
  const provider = vi
    .spyOn(google, "googleRequest")
    .mockResolvedValue({
      spreadsheetId: "existing-sheet",
      properties: { title: "Admissions" },
      sheets: [
        { properties: { title: "Responses" } },
        { properties: { title: "Archive" } },
      ],
    });
  const response = await POST(
    request({
      action: "inspect",
      sheetId: "https://docs.google.com/spreadsheets/d/existing-sheet/edit",
    }),
    context,
  );
  expect(response.status).toBe(200);
  expect((await response.json()).worksheets).toEqual(["Responses", "Archive"]);
  expect(provider.mock.calls[0][0]).toContain("/existing-sheet?fields=");
  expect(provider.mock.calls[0][1]).toBeUndefined();
});
it("creates a per-form spreadsheet without replacing any saved global or per-form destination", async () => {
  const before = await readDatabase(),
    provider = vi
      .spyOn(google, "googleRequest")
      .mockResolvedValue({
        spreadsheetId: "new-sheet",
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/new-sheet/edit",
        sheets: [{ properties: { title: "Responses" } }],
      });
  const response = await POST(
    request({ action: "create", title: "Workshop responses" }),
    context,
  );
  expect(response.status).toBe(200);
  expect((await response.json()).sheetId).toBe("new-sheet");
  expect(provider.mock.calls[0][1]?.method).toBe("POST");
  expect(JSON.parse(String(provider.mock.calls[0][1]?.body))).toMatchObject({
    properties: { title: "Workshop responses" },
    sheets: [{ properties: { title: "Responses" } }],
  });
  expect(await readDatabase()).toEqual(before);
});
it("does not automatically retry uncertain spreadsheet creation", async () => {
  const provider = vi
    .spyOn(google, "googleRequest")
    .mockRejectedValue(new Error("Timed out"));
  const response = await POST(request({ action: "create" }), context);
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe("SHEET_CREATE_UNCONFIRMED");
  expect(provider).toHaveBeenCalledTimes(1);
});
it.each(["", "examiner", "entrance_staff"])(
  "does not allow an unauthorized user to inspect or create sheets (%s)",
  async (role) => {
    const provider = vi.spyOn(google, "googleRequest");
    const response = await POST(request({ action: "create" }, role), context);
    expect(response.status).toBe(role ? 403 : 401);
    expect(provider).not.toHaveBeenCalled();
  },
);
it("requires a connected account and rejects invalid spreadsheet URLs", async () => {
  const provider = vi.spyOn(google, "googleRequest");
  expect(
    (
      await POST(
        request({ action: "inspect", sheetId: "https://evil.example" }),
        context,
      )
    ).status,
  ).toBe(400);
  await transaction((db) => {
    db.integrations.google = undefined;
  });
  expect((await POST(request({ action: "create" }), context)).status).toBe(409);
  expect(provider).not.toHaveBeenCalled();
});

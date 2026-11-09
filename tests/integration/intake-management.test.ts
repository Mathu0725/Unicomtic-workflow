import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
import { transaction } from "../../src/lib/data/repository";
import { SESSION_COOKIE, signSession } from "../../src/lib/security/session";
import { POST as createIntake, PATCH as updateIntake } from "../../src/app/api/admin/campaigns/route";
import { POST as createForm } from "../../src/app/api/admin/forms/route";
import { PATCH as updateForm } from "../../src/app/api/admin/forms/[id]/route";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tic-intake-management-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("SEED_DEMO_DATA", "true");
  vi.stubEnv("APP_SECRET", "test-secret-only-32-characters-or-more");
  await transaction(() => {});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

function request(url: string, body: unknown, method = "POST") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      cookie: `${SESSION_COOKIE}=${signSession({ name: "Admissions", email: "admissions@example.com", role: "super_admin" })}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

it("creates year-specific intakes, moves an existing form, and prevents new forms after that intake closes", async () => {
  const intakeResponse = await createIntake(request("/api/admin/campaigns", {
    title: "Scholarship Intake",
    academic_year: "2030",
    start_date: "2030-01-15",
    end_date: "2030-06-30",
  }), undefined);
  expect(intakeResponse.status).toBe(200);
  const { campaign } = await intakeResponse.json();
  expect(campaign).toMatchObject({ academic_year: "2030", is_active: true, code: "TIC-2030" });

  const formResponse = await createForm(request("/api/admin/forms", {
    title: "2030 Scholarship Registration",
    type: "registration",
    campaignId: campaign.id,
  }), undefined);
  expect(formResponse.status).toBe(200);
  const { form } = await formResponse.json();
  expect(form.campaign_id).toBe(campaign.id);

  const nextIntakeResponse = await createIntake(request("/api/admin/campaigns", {
    title: "Scholarship Intake",
    academic_year: "2031",
  }), undefined);
  const { campaign: nextCampaign } = await nextIntakeResponse.json();
  const moved = await updateForm(request(`/api/admin/forms/${form.id}`, {
    campaign_id: nextCampaign.id,
    expectedUpdatedAt: form.updated_at,
  }, "PATCH"), { params: Promise.resolve({ id: form.id }) });
  expect(moved.status).toBe(200);
  expect((await moved.json()).form.campaign_id).toBe(nextCampaign.id);

  expect((await updateIntake(request("/api/admin/campaigns", { id: nextCampaign.id, is_active: false }, "PATCH"), undefined)).status).toBe(200);
  const blocked = await createForm(request("/api/admin/forms", {
    title: "Another 2031 Registration",
    type: "registration",
    campaignId: nextCampaign.id,
  }), undefined);
  expect(blocked.status).toBe(400);
  expect((await blocked.json()).message).toContain("active intake");
});


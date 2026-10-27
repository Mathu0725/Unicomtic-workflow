import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { PATCH as patchForm } from "../../src/app/api/admin/forms/[id]/route";
import { POST as createForm } from "../../src/app/api/admin/forms/route";
import { GET as readForm, POST as submitForm } from "../../src/app/api/forms/[slug]/route";
import { POST as webhook } from "../../src/app/api/forms/[slug]/google-webhook/route";
import { POST as upload } from "../../src/app/api/forms/[slug]/uploads/route";
import { POST as requestAccess } from "../../src/app/api/candidate-access/request/route";
import { POST as exchangeAccess } from "../../src/app/api/candidate-access/exchange/route";
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { candidateLink } from "../../src/lib/security/candidate-access";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import { formSlugProblem } from "../../src/lib/forms/public-links";
import { submitCustomForm } from "../../src/lib/admissions/service";

let directory: string;
const formId = "form-reg-2025", oldSlug = "tic-2025-registration";
const person = { fullName: "Link Test Student", nic: "200012345601", email: "link-student@example.com", phone: "0771234501", terms: true };
function request(url: string, body?: unknown, role?: string, method = "POST") {
  return new NextRequest(`http://localhost${url}`, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(role ? { cookie: `${SESSION_COOKIE}=${signSession({ email: "links-admin@example.com", name: "Link editor", role })}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const context = (slug: string) => ({ params: Promise.resolve({ slug }) });
const currentForm = async (id = formId) => (await readDatabase()).customForms.find(form => form.id === id)!;
async function rename(slug: string, id = formId) {
  const form = await currentForm(id);
  return patchForm(request(`/api/admin/forms/${id}`, { slug, expectedUpdatedAt: form.updated_at }, "super_admin", "PATCH"), { params: { id } });
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-form-links-"));
  vi.stubEnv("DATA_DIR", directory); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false"); vi.stubEnv("APP_SECRET", "test-secret-for-form-links-at-least-32-characters");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Provider calls are not allowed in form link tests")));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await transaction(db => {
    for (const form of db.customForms) form.fields = [
      { id: "fullName", type: "text", label: "Full name", required: true }, { id: "nic", type: "nic", label: "NIC", required: true },
      { id: "email", type: "email", label: "Email", required: true }, { id: "phone", type: "phone", label: "Phone", required: true },
      { id: "terms", type: "terms", label: "I accept the terms", required: true },
    ];
    db.customForms[0].google_form_config = { enabled: true, response_mode: "webhook", webhook_secret: "test-webhook-secret" };
  });
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

it.each([undefined, "examiner", "entrance_staff"])("requires administrator access to rename a form (%s)", async role => {
  const form = await currentForm();
  const result = await patchForm(request(`/api/admin/forms/${form.id}`, { slug: "new-link", expectedUpdatedAt: form.updated_at }, role, "PATCH"), { params: { id: form.id } });
  expect(result.status).toBe(role ? 403 : 401);
  expect((await currentForm()).slug).toBe(oldSlug);
});

it("persists a normalized new link, reserves the old link, and leaves responses and queued messages unchanged", async () => {
  const before = await readDatabase();
  const result = await rename("  TIC-2027-Registration  ");
  expect(result.status).toBe(200);
  const after = await readDatabase(), form = after.customForms.find(form => form.id === formId)!;
  expect(form.slug).toBe("tic-2027-registration"); expect(form.previous_slugs).toEqual([oldSlug]);
  expect(form.updated_at > before.customForms[0].updated_at).toBe(true);
  expect(after.formSubmissions).toEqual(before.formSubmissions); expect(after.registrations).toEqual(before.registrations); expect(after.outbox).toEqual(before.outbox);
  for (const key of [oldSlug, form.slug, form.id]) {
    const response = await readForm(request(`/api/forms/${key}`, undefined, undefined, "GET"), context(key));
    expect(response.status).toBe(200); expect((await response.json()).form).toMatchObject({ id: form.id, slug: form.slug });
  }
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["", "bad link", "/form/link", "https://other.example", "../link", "link?next=bad", "-link", "link-", "link--name", "a".repeat(101)])("rejects an invalid public link: %s", async slug => {
  expect((await rename(slug)).status).toBe(400);
  expect((await currentForm()).slug).toBe(oldSlug);
});

it("requires the current form version for a rename and rejects stale edits", async () => {
  const form = await currentForm();
  const unversioned = await patchForm(request(`/api/admin/forms/${form.id}`, { slug: "unversioned" }, "admin", "PATCH"), { params: { id: form.id } });
  expect(unversioned.status).toBe(409);
  expect((await rename("current-link")).status).toBe(200);
  const stale = await patchForm(request(`/api/admin/forms/${form.id}`, { slug: "stale-link", expectedUpdatedAt: form.updated_at }, "admin", "PATCH"), { params: { id: form.id } });
  expect(stale.status).toBe(409); expect((await stale.json()).code).toBe("VERSION_CONFLICT");
  expect((await currentForm()).slug).toBe("current-link");
});

it("rejects collisions with another form's current link, prior link, and stable ID", async () => {
  const other = await currentForm("form-app-2025");
  expect((await rename(other.slug)).status).toBe(409);
  expect((await rename(other.id)).status).toBe(409);
  expect((await rename("new-registration-link")).status).toBe(200);
  const result = await rename(oldSlug, other.id);
  expect(result.status).toBe(409); expect((await result.json()).code).toBe("FORM_LINK_TAKEN");
  expect((await currentForm(other.id)).slug).toBe(other.slug);
});

it("keeps every historical link through repeated renames and allows returning to an old name", async () => {
  expect((await rename("second-link")).status).toBe(200);
  expect((await rename("third-link")).status).toBe(200);
  expect((await rename(oldSlug)).status).toBe(200);
  expect((await currentForm()).previous_slugs).toEqual(["second-link", "third-link"]);
  for (const slug of [oldSlug, "second-link", "third-link"]) expect((await readForm(request(`/api/forms/${slug}`, undefined, undefined, "GET"), context(slug))).status).toBe(200);
});

it("lets only one of two competing form renames claim the same link", async () => {
  const responses = await Promise.all([rename("shared-public-link"), rename("shared-public-link", "form-app-2025")]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
  expect((await readDatabase()).customForms.filter(form => form.slug === "shared-public-link")).toHaveLength(1);
});

it("creates bounded unique links for long titles and does not copy the source's historical links", async () => {
  await rename("source-link");
  const duplicate = await createForm(request("/api/admin/forms", { action: "duplicate", formId }, "admin"), undefined);
  expect(duplicate.status).toBe(200);
  const copy = (await duplicate.json()).form;
  expect(copy.previous_slugs).toEqual([]); expect(copy.slug).not.toBe("source-link"); expect(formSlugProblem(copy.slug)).toBe("");
  const created = await createForm(request("/api/admin/forms", { title: "Long title ".repeat(23).trim() }, "admin"), undefined);
  expect(created.status).toBe(200); expect(formSlugProblem((await created.json()).form.slug)).toBe("");
  expect((await readForm(request(`/api/forms/${oldSlug}`, undefined, undefined, "GET"), context(oldSlug)).then(response => response.json())).form.id).toBe(formId);
});

it("accepts submissions from a previously shared URL and still rejects duplicate registrations", async () => {
  await rename("new-registration-link");
  const form = await currentForm();
  const first = await submitForm(request(`/api/forms/${oldSlug}`, { data: person, expectedFormVersion: form.updated_at }), context(oldSlug));
  expect(first.status).toBe(200);
  const duplicate = await submitForm(request(`/api/forms/${form.slug}`, { data: person, expectedFormVersion: form.updated_at }), context(form.slug));
  expect(duplicate.status).toBe(409);
  const db = await readDatabase(); expect(db.formSubmissions).toHaveLength(1); expect(db.registrations).toHaveLength(1); expect(db.formSubmissions[0].form_id).toBe(form.id);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps an existing Google webhook working across a rename and deduplicates its response ID", async () => {
  await rename("new-registration-link");
  const body = { secret: "test-webhook-secret", responseId: "existing-google-response", answers: person };
  const first = await webhook(request(`/api/forms/${oldSlug}/google-webhook`, body), context(oldSlug));
  expect(first.status).toBe(200);
  const second = await webhook(request("/api/forms/new-registration-link/google-webhook", body), context("new-registration-link"));
  expect(second.status).toBe(200); expect((await second.json()).duplicate).toBe(true);
  expect((await readDatabase()).formSubmissions).toHaveLength(1);
  expect((await webhook(request(`/api/forms/${oldSlug}/google-webhook`, { ...body, secret: "wrong" }), context(oldSlug))).status).toBe(401);
});

it("does not let historical links bypass closed-form or candidate authorization checks", async () => {
  const oldApplication = (await currentForm("form-app-2025")).slug;
  await rename("renamed-application", "form-app-2025");
  const submission = await submitForm(request(`/api/forms/${oldApplication}`, { data: person }), context(oldApplication));
  expect(submission.status).toBe(401);
  const form = await currentForm("form-app-2025"), body = new FormData();
  body.set("file", new File(["%PDF-1.4 test"], "sample.pdf", { type: "application/pdf" })); body.set("fieldId", "document"); body.set("expectedFormVersion", form.updated_at);
  const uploaded = await upload(new NextRequest(`http://localhost/api/forms/${oldApplication}/uploads`, { method: "POST", headers: { "Idempotency-Key": "test-upload-attempt-12345" }, body }), context(oldApplication));
  expect(uploaded.status).toBe(401);
  await transaction(db => { db.customForms.find(form => form.id === "form-app-2025")!.is_active = false; });
  expect((await readForm(request(`/api/forms/${oldApplication}`, undefined, undefined, "GET"), context(oldApplication))).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});

it("opens previously emailed secure application links at the latest form URL and uses it for new access requests", async () => {
  const oldApplication = (await currentForm("form-app-2025")).slug;
  let token: string, reference: string;
  await transaction(db => {
    submitCustomForm(db.customForms[0], person);
    const registration = db.registrations[0], student = db.students[0]; registration.status = "invited"; reference = registration.reference_no;
    token = decodeURIComponent(candidateLink(registration, student, "apply", `/form/${db.customForms[1].slug}`).split("#token=")[1]);
    db.outbox = [];
  });
  await rename("application-2027", "form-app-2025");
  const exchanged = await exchangeAccess(request("/api/candidate-access/exchange", { token: token! }), undefined);
  expect(exchanged.status).toBe(200); expect((await exchanged.json()).redirectTo).toBe("/form/application-2027");
  const requested = await requestAccess(request("/api/candidate-access/request", { reference: reference!, email: person.email, purpose: "apply", formSlug: oldApplication }), undefined);
  expect(requested.status).toBe(200);
  expect((await readDatabase()).outbox[0].payload.candidateAccess.destination).toBe("/form/application-2027");
  await transaction(db => { db.customForms[1].is_active = false; });
  expect((await exchangeAccess(request("/api/candidate-access/exchange", { token: token! }), undefined)).status).toBe(409);
});

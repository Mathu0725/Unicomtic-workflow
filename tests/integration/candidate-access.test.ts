import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
import { transaction, readDatabase } from "../../src/lib/data/repository";
import { candidateLink, candidateSession, CANDIDATE_COOKIE, LINK_LIFETIME, SESSION_LIFETIME, secureCandidateEmail } from "../../src/lib/security/candidate-access";
import { POST as requestAccess } from "../../src/app/api/candidate-access/request/route";
import { POST as exchange } from "../../src/app/api/candidate-access/exchange/route";
import { GET as session } from "../../src/app/api/candidate-access/session/route";
import { GET as status } from "../../src/app/api/status/route";
import { POST as application } from "../../src/app/api/applications/route";
import { POST as customForm } from "../../src/app/api/forms/[slug]/route";
import { canonicalStudent, registrationFor } from "../../src/lib/admissions/service";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";

let dir: string, cookie: string, token: string, reference: string, secondReference: string;
function request(url: string, body?: any, credentials = "", extra: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${url}`, { method: body ? "POST" : "GET", headers: { ...(credentials ? { cookie: credentials } : {}), ...extra, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function tokenFromLink(link: string) { return new URLSearchParams(new URL(link).hash.slice(1)).get("token")!; }
const person = (n: number) => ({ fullName: `Candidate ${n}`, email: `candidate${n}@example.com`, nic: `20001234560${n}`, phone: `077123450${n}`, district: "Jaffna" });
const answers = (reference: string) => ({ registrationRef: reference, courseId: "course-1", olYear: "2018", olIndexNo: "882104", olMathsGrade: "A", olEnglishGrade: "B", olScienceGrade: "A", alStream: "Physical Science", alYear: "2021", alIndexNo: "330912", alResultsSummary: "Mathematics B, Chemistry C, Physics B", emergencyContactName: "Test Guardian", emergencyContactRelation: "Parent", emergencyContactPhone: "0777654321", statementOfPurpose: "I am interested in software engineering and learning new technical skills.", declarationAccepted: true });
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tic-candidate-access-"));
  vi.stubEnv("DATA_DIR", dir); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false"); vi.stubEnv("APP_SECRET", "test-only-secret-with-at-least-32-characters"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  await transaction(db => {
    const student = canonicalStudent(person(1)), reg = registrationFor(student); reference = reg.reference_no;
    const second = canonicalStudent(person(2)), secondReg = registrationFor(second); secondReference = secondReg.reference_no;
    token = tokenFromLink(candidateLink(reg, student, "apply"));
    cookie = `${CANDIDATE_COOKIE}=${candidateSession(db, token).cookie}`;
    db.customForms[1].fields = [{ id: "fullName", type: "text", required: true, label: "Name" }, { id: "email", type: "email", required: true, label: "Email" }, { id: "nic", type: "nic", required: true, label: "NIC" }, { id: "phone", type: "phone", required: true, label: "Phone" }];
  });
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

it.each(["?ref=REG-UNKNOWN", "?nic=200012345601", ""])("rejects unauthenticated status lookups %s without exposing candidate details", async query => {
  const response = await status(request(`/api/status${query}`), undefined);
  expect(response.status).toBe(401); const data = await response.json(); expect(data.data).toBeUndefined(); expect(JSON.stringify(data)).not.toContain("Candidate 1");
});
it("rejects a bare reference even when it is a real record", async () => {
  expect((await status(request(`/api/status?ref=${reference}`), undefined)).status).toBe(401);
});
it("exchanges a valid email link for an HttpOnly session and restricts it to its registration", async () => {
  const response = await exchange(request("/api/candidate-access/exchange", { token }), undefined);
  expect(response.status).toBe(200); expect(response.headers.get("set-cookie")).toContain("HttpOnly"); expect(response.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
  expect((await response.json()).redirectTo).toBe(`/apply?ref=${encodeURIComponent(reference)}`);
  const own = await status(request(`/api/status?ref=${reference}`, undefined, cookie), undefined); expect(own.status).toBe(200); expect((await own.json()).data.studentName).toBe("Candidate 1");
  expect((await status(request(`/api/status?ref=${secondReference}`, undefined, cookie), undefined)).status).toBe(403);
  expect((await status(request("/api/status?nic=200012345601", undefined, cookie), undefined)).status).toBe(403);
});
it("does not accept staff cookies or a link token as a candidate session", async () => {
  const staff = `${SESSION_COOKIE}=${signSession({ email: "admin@example.com", name: "Admin", role: "super_admin" })}`;
  expect((await status(request(`/api/status?ref=${reference}`, undefined, staff), undefined)).status).toBe(401);
  expect((await status(request(`/api/status?ref=${reference}`, undefined, `${CANDIDATE_COOKIE}=${token}`), undefined)).status).toBe(401);
});
it("rejects tampered, expired and cross-origin link exchanges", async () => {
  expect((await exchange(request("/api/candidate-access/exchange", { token: token.slice(0, -8) + "tampered" }), undefined)).status).toBe(401);
  expect((await exchange(request("/api/candidate-access/exchange", { token }, "", { origin: "https://untrusted.example" }), undefined)).status).toBe(403);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + LINK_LIFETIME + 1000);
  expect((await exchange(request("/api/candidate-access/exchange", { token }), undefined)).status).toBe(401);
});
it("invalidates links and sessions when the candidate email changes or registration is cancelled", async () => {
  await transaction(db => { db.students[0].email = "corrected@example.com"; });
  expect((await exchange(request("/api/candidate-access/exchange", { token }), undefined)).status).toBe(401);
  expect((await status(request("/api/status", undefined, cookie), undefined)).status).toBe(401);
  await transaction(db => { db.students[0].email = person(1).email; db.registrations[0].status = "cancelled"; });
  expect((await exchange(request("/api/candidate-access/exchange", { token }), undefined)).status).toBe(401);
});
it("expires verified access after one hour", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + SESSION_LIFETIME + 1000);
  expect((await status(request("/api/status", undefined, cookie), undefined)).status).toBe(401);
  expect((await session(request("/api/candidate-access/session", undefined, cookie), undefined)).status).toBe(200);
  expect(await (await session(request("/api/candidate-access/session", undefined, cookie), undefined)).json()).toEqual({ success: true, verified: false });
});
it("uses only an active custom-form destination belonging to the verified intake", async () => {
  const db = await readDatabase(), form = db.customForms[1];
  const customToken = tokenFromLink(candidateLink(db.registrations[0], db.students[0], "apply", `/form/${form.slug}`));
  expect(await (await exchange(request("/api/candidate-access/exchange", { token: customToken }), undefined)).json()).toMatchObject({ redirectTo: `/form/${form.slug}` });
  await transaction(db => { db.customForms[1].campaign_id = "different-intake"; });
  expect((await exchange(request("/api/candidate-access/exchange", { token: customToken }), undefined)).status).toBe(409);
  await transaction(db => { db.customForms[1].campaign_id = db.registrations[0].campaign_id; db.customForms[1].is_active = false; });
  expect((await exchange(request("/api/candidate-access/exchange", { token: customToken }), undefined)).status).toBe(409);
});
it("provides the same public response for matching and nonmatching details and queues no raw token", async () => {
  const good = await (await requestAccess(request("/api/candidate-access/request", { reference, email: person(1).email, purpose: "status" }), undefined)).json();
  const bad = await (await requestAccess(request("/api/candidate-access/request", { reference, email: "wrong@example.com", purpose: "status" }), undefined)).json();
  expect(good).toEqual(bad); const db = await readDatabase(); expect(db.outbox).toHaveLength(1); expect(db.outbox[0].payload.to).toBe(person(1).email); expect(db.outbox[0].payload.html).not.toContain("#token=");
});
it("deduplicates concurrent link requests and persists their shared rate limit", async () => {
  const input = { reference, email: person(1).email, purpose: "status" };
  await Promise.all(Array.from({ length: 6 }, () => requestAccess(request("/api/candidate-access/request", input), undefined)));
  let db = await readDatabase(); expect(db.outbox).toHaveLength(1);
  await transaction(db => { db.outbox[0].status = "sent"; });
  await requestAccess(request("/api/candidate-access/request", input), undefined);
  db = await readDatabase(); expect(db.outbox).toHaveLength(1); expect(db.candidateAccessAttempts.some(bucket => bucket.count === 1)).toBe(true);
});
it("mints the link only when the queued email is dispatched and never grants it to another recipient", async () => {
  const db = await readDatabase(), payload = { to: person(1).email, subject: "Secure access", html: "pending", candidateAccess: { registrationId: db.registrations[0].id, purpose: "status" } };
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + LINK_LIFETIME + 1000);
  const rendered = secureCandidateEmail(db, payload);
  const freshToken = tokenFromLink(rendered.html.match(/href="([^"]+)"/)![1]);
  expect(candidateSession(db, freshToken).registration.reference_no).toBe(reference);
  expect(() => secureCandidateEmail(db, { ...payload, to: "other@example.com" })).toThrow("Candidate contact changed");
});
it("upgrades existing confirmation links only for the registered recipient", async () => {
  const db = await readDatabase();
  const payload = { to: person(1).email, html: `<a href="http://localhost:3000/status?ref=${reference}">Status</a><a href="https://external.example/apply?ref=${reference}">External</a>` };
  const rendered = secureCandidateEmail(db, payload);
  expect(rendered.html).toContain("/access#token="); expect(rendered.html).toContain("https://external.example/apply?");
  expect(secureCandidateEmail(db, { ...payload, to: "admin@example.com" }).html).not.toContain("/access#token=");
});
it("requires a verified session for legacy applications and refuses a different candidate reference", async () => {
  expect((await application(request("/api/applications", answers(reference)), undefined)).status).toBe(401);
  expect((await application(request("/api/applications", answers(secondReference), cookie), undefined)).status).toBe(403);
  expect((await application(request("/api/applications", answers(reference), cookie), undefined)).status).toBe(200);
  expect((await readDatabase()).applications).toHaveLength(1);
});
it("protects custom applications including idempotency receipt replay before authorization", async () => {
  const db = await readDatabase(), form = db.customForms[1], body = { data: person(1), expectedFormVersion: form.updated_at }, context = { params: Promise.resolve({ slug: form.slug }) };
  expect((await customForm(request(`/api/forms/${form.slug}`, body), context)).status).toBe(401);
  const headers = { "idempotency-key": "candidate-verified-application-attempt" };
  const accepted = await customForm(request(`/api/forms/${form.slug}`, body, cookie, headers), context); expect(accepted.status).toBe(200);
  expect((await customForm(request(`/api/forms/${form.slug}`, body, "", headers), context)).status).toBe(401);
  expect((await customForm(request(`/api/forms/${form.slug}`, body, cookie, headers), context)).headers.get("Idempotency-Replayed")).toBe("true");
});
it("does not replay another verified candidate's application receipt", async () => {
  const db = await readDatabase(), form = db.customForms[1];
  const otherToken = tokenFromLink(candidateLink(db.registrations[1], db.students[1], "apply"));
  const otherCookie = `${CANDIDATE_COOKIE}=${candidateSession(db, otherToken).cookie}`;
  const headers = { "idempotency-key": "shared-retry-key-between-candidates" };
  const body = { data: person(1), expectedFormVersion: form.updated_at }, context = { params: { slug: form.slug } };
  expect((await customForm(request(`/api/forms/${form.slug}`, body, cookie, headers), context)).status).toBe(200);
  const replay = await customForm(request(`/api/forms/${form.slug}`, body, otherCookie, headers), context);
  expect(replay.status).toBe(403); expect(replay.headers.get("Idempotency-Replayed")).toBeNull();
  expect((await readDatabase()).applications).toHaveLength(1);
});
it("scopes legacy application retry receipts to the verified registration", async () => {
  const db = await readDatabase(), otherToken = tokenFromLink(candidateLink(db.registrations[1], db.students[1], "apply"));
  const otherCookie = `${CANDIDATE_COOKIE}=${candidateSession(db, otherToken).cookie}`;
  const headers = { "idempotency-key": "legacy-private-application-receipt" };
  expect((await application(request("/api/applications", answers(reference), cookie, headers), undefined)).status).toBe(200);
  expect((await application(request("/api/applications", answers(reference), otherCookie, headers), undefined)).status).toBe(403);
  expect((await application(request("/api/applications", answers(reference), cookie, headers), undefined)).headers.get("Idempotency-Replayed")).toBe("true");
  expect((await readDatabase()).applications).toHaveLength(1);
});
it("rejects another candidate's answers and an uninvited application, without partial writes", async () => {
  const db = await readDatabase(), form = db.customForms[1];
  const response = await customForm(request(`/api/forms/${form.slug}`, { data: person(2) }, cookie), { params: { slug: form.slug } });
  expect(response.status).toBe(403); expect((await readDatabase()).applications).toHaveLength(0);
  await transaction(db => { db.registrations[0].status = "registered"; });
  expect((await application(request("/api/applications", answers(reference), cookie), undefined)).status).toBe(403);
});
it("reports unauthenticated session state without exposing identity", async () => {
  expect(await (await session(request("/api/candidate-access/session"), undefined)).json()).toEqual({ success: true, verified: false });
});

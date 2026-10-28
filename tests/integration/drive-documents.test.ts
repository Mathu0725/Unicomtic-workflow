import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
import { GET as driveStatus, POST as setupDrive } from "../../src/app/api/admin/drive/route";
import { POST as uploadFile } from "../../src/app/api/forms/[slug]/uploads/route";
import { GET as publicForm, POST as submitForm } from "../../src/app/api/forms/[slug]/route";
import { GET as adminResponses } from "../../src/app/api/admin/forms/[id]/responses/route";
import { readDatabase, transaction } from "../../src/lib/data/repository";
import { GOOGLE_DRIVE_SCOPE, GOOGLE_SCOPES, clearGoogleTokenCache } from "../../src/lib/google/oauth";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import { encrypt } from "../../src/lib/security/secrets";
import { DOCUMENT_MAX_BYTES } from "../../src/lib/documents/constants";
import { canonicalStudent, registrationFor } from "../../src/lib/admissions/service";
import { candidateLink, candidateSession, CANDIDATE_COOKIE } from "../../src/lib/security/candidate-access";

let directory: string;
let serial: number;
let failUploadAfterSave: boolean;
let failFolderAfterSave: boolean;
let allowDrive: boolean;
let files: Map<string, any>;
const fileBytes = Buffer.from("%PDF-1.7\nSynthetic isolated test document\n%%EOF");
const key = "isolated-document-attempt-0001";
const slug = "document-test";
const version = "2026-10-26T00:00:00.000Z";
const person = { fullName: "Test Applicant", email: "applicant@example.test", phone: "0771234567", nic: "200012345678", terms: true };
const adminCookie = () => `${SESSION_COOKIE}=${signSession({ name: "Test Admin", email: "operator@example.test", role: "super_admin" })}`;
function adminRequest(body?: object, role?: string) {
  return new NextRequest("http://localhost/api/admin/drive", { method: body ? "POST" : "GET", headers: { cookie: role ? `${SESSION_COOKIE}=${signSession({ name: "Test", email: "operator@example.test", role })}` : adminCookie(), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function uploadRequest({ bytes = fileBytes, name = "certificate.pdf", mime = "application/pdf", fieldId = "certificate", formVersion = version, uploadKey = key, cookie = "" }: { bytes?: Buffer; name?: string; mime?: string; fieldId?: string; formVersion?: string; uploadKey?: string; cookie?: string } = {}) {
  const data = new FormData();
  data.set("file", new File([new Uint8Array(bytes)], name, { type: mime }));
  data.set("fieldId", fieldId); data.set("expectedFormVersion", formVersion);
  return new NextRequest(`http://localhost/api/forms/${slug}/uploads`, { method: "POST", body: data, headers: { "idempotency-key": uploadKey, ...(cookie ? { cookie } : {}) } });
}
const upload = (options?: Parameters<typeof uploadRequest>[0]) => uploadFile(uploadRequest(options), { params: { slug } });
async function postAnswers(receipt: string, extra = {}, requestKey?: string, cookie = "") {
  return submitForm(new NextRequest(`http://localhost/api/forms/${slug}`, { method: "POST", headers: { "content-type": "application/json", ...(requestKey ? { "idempotency-key": requestKey } : {}), ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ data: { ...person, certificate: receipt, ...extra }, expectedFormVersion: version }) }), { params: { slug } });
}
const otherPerson = { ...person, fullName: "Other Applicant", email: "other@example.test", nic: "200012345679", phone: "0771234568" };
async function applicationCandidates() {
  return transaction(db => {
    db.customForms[0].type = "application";
    return [person, otherPerson].map(input => {
      const student = canonicalStudent(input), registration = registrationFor(student); registration.status = "invited";
      const token = new URLSearchParams(new URL(candidateLink(registration, student, "apply")).hash.slice(1)).get("token")!;
      return `${CANDIDATE_COOKIE}=${candidateSession(db, token).cookie}`;
    });
  });
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-drive-test-"));
  vi.stubEnv("DATA_DIR", directory); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false");
  vi.stubEnv("APP_SECRET", "drive-test-secret-with-at-least-32-characters"); vi.stubEnv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  clearGoogleTokenCache(); serial = 0; files = new Map(); failUploadAfterSave = false; failFolderAfterSave = false; allowDrive = true;
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "fake-access-token", expires_in: 3600 });
    if (!allowDrive) return Response.json({ error: { errors: [{ reason: "accessNotConfigured" }] } }, { status: 403 });
    if (url.pathname.endsWith("/generateIds")) return Response.json({ ids: [`drive-test-file-${++serial}`] });
    if (init?.method === "POST") {
      const multipart = url.pathname.includes("/upload/");
      const body = multipart ? Buffer.from(init.body as Uint8Array).toString() : String(init.body);
      const metadata = multipart ? JSON.parse(body.split("\r\n\r\n")[1].split("\r\n--")[0]) : JSON.parse(body);
      if (files.has(metadata.id)) return Response.json({ error: { code: 409 } }, { status: 409 });
      const mimeType = multipart ? body.match(/Content-Type: (application\/pdf|image\/png|image\/jpeg)/)![1] : metadata.mimeType;
      const raw = multipart ? Buffer.from(init.body as Uint8Array) : Buffer.alloc(0);
      const marker = Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`);
      const size = multipart ? raw.lastIndexOf(Buffer.from("\r\n--")) - raw.indexOf(marker) - marker.length : undefined;
      const result = { ...metadata, mimeType, size: multipart ? String(size) : undefined, trashed: false };
      files.set(metadata.id, result);
      if (multipart && failUploadAfterSave) { failUploadAfterSave = false; throw new TypeError("Network interrupted after Drive accepted the file"); }
      if (!multipart && failFolderAfterSave) { failFolderAfterSave = false; throw new TypeError("Network interrupted after Drive created the folder"); }
      return Response.json(result);
    }
    const result = files.get(url.pathname.split("/").pop()!);
    return result ? Response.json(result) : Response.json({ error: { code: 404 } }, { status: 404 });
  }));
  await transaction(db => {
    db.integrations.google = { email: "drive-owner@example.test", refresh_token: encrypt("test-refresh-token"), scopes: [...GOOGLE_SCOPES, GOOGLE_DRIVE_SCOPE], connected_at: version };
    const form = db.customForms[0]; form.slug = slug; form.updated_at = version; form.is_active = true;
    form.fields = [{ id: "fullName", label: "Name", type: "text", required: true }, { id: "email", label: "Email", type: "email", required: true }, { id: "phone", label: "Phone", type: "phone", required: true }, { id: "nic", label: "NIC", type: "nic", required: true }, { id: "terms", label: "Terms", type: "terms", required: true }, { id: "certificate", label: "Certificate", type: "file", required: true }];
  });
});
afterEach(async () => { clearGoogleTokenCache(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

it("restricts Drive setup to administrators and hides tokens from its status response", async () => {
  expect((await setupDrive(adminRequest({ action: "create_folder" }, "examiner"), undefined)).status).toBe(403);
  const noCookie = new NextRequest("http://localhost/api/admin/drive");
  expect((await driveStatus(noCookie, undefined)).status).toBe(401);
  const response = await driveStatus(adminRequest(), undefined);
  const result = await response.json();
  expect(result).toMatchObject({ connected: true, folder: null });
  expect(JSON.stringify(result)).not.toContain("refresh_token");
});
it("requires a verified candidate before creating an application document in Drive", async () => {
  await transaction(db => { db.customForms[0].type = "application"; });
  const response = await upload();
  expect(response.status).toBe(401);
  expect(files.size).toBe(0); expect((await readDatabase()).documentUploads).toHaveLength(0);
});
it("accepts private document uploads for an open application without prior registration", async () => {
  await transaction(db => { db.customForms[0].type = "application"; db.customForms[0].application_mode = "open"; });
  await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  const response = await upload(); expect(response.status).toBe(200);
  const uploaded = await response.json(); expect((await postAnswers(uploaded.receipt)).status).toBe(200);
  const db = await readDatabase(); expect(db.applications).toHaveLength(1); expect(db.registrations[0].source).toBe("direct_application"); expect(db.documentUploads[0].submission_id).toBe(db.formSubmissions[0].id);
});
it("blocks document uploads after an open application's closing date", async () => {
  await transaction(db => { db.customForms[0].type = "application"; db.customForms[0].application_mode = "open"; db.customForms[0].closes_at = new Date(Date.now()-1000).toISOString(); });
  expect((await upload()).status).toBe(404); expect(files.size).toBe(0); expect((await readDatabase()).documentUploads).toHaveLength(0);
});
it("binds application uploads and their retry keys to the verified candidate", async () => {
  const [firstCookie, otherCookie] = await applicationCandidates();
  await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  const firstResponse = await upload({ cookie: firstCookie }); expect(firstResponse.status).toBe(200);
  const otherResponse = await upload({ cookie: otherCookie }); expect(otherResponse.status).toBe(200);
  const first = await firstResponse.json(), other = await otherResponse.json();
  expect(first.receipt).not.toBe(other.receipt); expect(files.size).toBe(3);
  expect((await postAnswers(first.receipt, otherPerson, undefined, otherCookie)).status).toBe(403);
  expect((await readDatabase()).applications).toHaveLength(0);
  expect((await postAnswers(first.receipt, {}, undefined, firstCookie)).status).toBe(200);
  expect((await postAnswers(other.receipt, otherPerson, undefined, otherCookie)).status).toBe(200);
  expect((await readDatabase()).applications).toHaveLength(2);
});
it("refuses uninvited application uploads before contacting Drive", async () => {
  const [cookie] = await applicationCandidates();
  await transaction(db => { db.registrations[0].status = "registered"; });
  expect((await upload({ cookie })).status).toBe(403);
  expect(files.size).toBe(0); expect((await readDatabase()).documentUploads).toHaveLength(0);
});

it("creates one private documents folder and reuses it on setup retries", async () => {
  expect((await setupDrive(adminRequest({ action: "create_folder" }), undefined)).status).toBe(200);
  expect((await setupDrive(adminRequest({ action: "create_folder" }), undefined)).status).toBe(200);
  expect(files.size).toBe(1);
  expect((await readDatabase()).integrations.drive_documents).toMatchObject({ ready: true, google_email: "drive-owner@example.test" });
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls.some(([url]) => String(url).includes("/permissions"))).toBe(false);
});

it("uploads, confirms, and attaches a private document to the submitted response", async () => {
  await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  const available = await publicForm(new NextRequest(`http://localhost/api/forms/${slug}`), { params: { slug } });
  expect((await available.json()).form.documentUploadsReady).toBe(true);
  const response = await upload(); expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.receipt).toMatch(/^document:/);
  expect(files.size).toBe(2);
  const accepted = await postAnswers(result.receipt, {}, "isolated-form-submit-0001"); expect(accepted.status).toBe(200);
  const db = await readDatabase(), record = db.documentUploads[0], submission = db.formSubmissions[0];
  expect(record.submission_id).toBe(submission.id);
  expect(submission.data.certificate).toBe(`https://drive.google.com/file/d/${record.drive_file_id}/view`);
  expect(JSON.stringify(submission)).not.toContain(result.receipt);
  expect(db.students).toHaveLength(1);
  const replay = await postAnswers(result.receipt, {}, "isolated-form-submit-0001");
  expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
  const admin = await adminResponses(new NextRequest(`http://localhost/api/admin/forms/${submission.form_id}/responses`, { headers: { cookie: adminCookie() } }), { params: { id: submission.form_id } });
  expect((await admin.json()).submissions[0].data.certificate).toContain("https://drive.google.com/");
});

it("reuses a confirmed upload and rejects changed bytes for the same retry key", async () => {
  await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  const first = await (await upload()).json();
  const repeated = await (await upload()).json();
  expect(repeated.receipt).toBe(first.receipt); expect(files.size).toBe(2);
  expect((await upload({ bytes: Buffer.from("%PDF-different file") })).status).toBe(409);
});

it.each([
  { name: "certificate.png", mime: "image/png", bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]) },
  { name: "certificate.jpg", mime: "image/jpeg", bytes: Buffer.from([255, 216, 255, 219, 0, 0]) },
])("accepts a matching image format (case %#)", async options => {
  await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  expect((await upload(options)).status).toBe(200);
  expect((await readDatabase()).documentUploads[0].mime_type).toBe(options.mime);
});

it("resumes uncertain folder setup using the original reserved ID", async () => {
  failFolderAfterSave = true;
  expect((await setupDrive(adminRequest({ action: "create_folder" }), undefined)).status).toBe(503);
  expect((await readDatabase()).integrations.drive_documents?.ready).toBe(false);
  expect((await setupDrive(adminRequest({ action: "create_folder" }), undefined)).status).toBe(200);
  expect(files.size).toBe(1);
});

it("does not duplicate documents when the same upload is submitted concurrently", async () => {
  await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  const responses = await Promise.all([upload(), upload()]);
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  const [first, second] = await Promise.all(responses.map(response => response.json()));
  expect(first.receipt).toBe(second.receipt);
  expect(files.size).toBe(2);
  expect((await readDatabase()).documentUploads).toHaveLength(1);
});

it("recovers an uncertain upload without creating a duplicate Drive file", async () => {
  await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  failUploadAfterSave = true;
  expect((await upload()).status).toBe(503);
  expect((await readDatabase()).documentUploads[0].status).toBe("pending");
  expect((await upload()).status).toBe(200);
  expect(files.size).toBe(2);
  expect((await readDatabase()).documentUploads[0].status).toBe("uploaded");
});

it("rejects forged, expired, wrong-question and already-claimed document receipts", async () => {
  await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  const uploaded = await (await upload()).json();
  expect((await postAnswers("https://drive.google.com/file/d/arbitrary-file/view")).status).toBe(400);
  expect((await postAnswers(uploaded.receipt.slice(0, -1) + "!")).status).toBe(400);
  await transaction(db => { db.documentUploads[0].field_id = "other-question"; });
  expect((await postAnswers(uploaded.receipt)).status).toBe(400);
  await transaction(db => { db.documentUploads[0].field_id = "certificate"; db.documentUploads[0].expires_at = 1; });
  expect((await postAnswers(uploaded.receipt)).status).toBe(400);
  await transaction(db => { db.documentUploads[0].expires_at = Date.now() + 60000; });
  expect((await postAnswers(uploaded.receipt)).status).toBe(200);
  expect((await postAnswers(uploaded.receipt, { email: "second@example.test", nic: "200012345679", phone: "0771234568" })).status).toBe(400);
  expect((await readDatabase()).students).toHaveLength(1);
});

it.each([
  { bytes: Buffer.from("<html>not a PDF</html>") },
  { bytes: Buffer.alloc(DOCUMENT_MAX_BYTES + 1) },
  { bytes: Buffer.alloc(0) },
  { name: "certificate.html" },
  { mime: "image/png" },
  { fieldId: "not-a-file-question" },
  { formVersion: "old-version" },
  { uploadKey: "short" },
])("rejects invalid uploads before creating a file (case %#)", async options => {
  await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  const response = await upload(options);
  expect([400, 409]).toContain(response.status); expect(files.size).toBe(1);
  expect((await readDatabase()).documentUploads).toHaveLength(0);
});

it("blocks closed forms, missing Drive scope, wrong accounts and missing folder setup", async () => {
  expect((await upload()).status).toBe(409);
  await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  await transaction(db => { db.customForms[0].is_active = false; });
  expect((await upload()).status).toBe(404);
  await transaction(db => { db.customForms[0].is_active = true; db.integrations.google!.scopes = GOOGLE_SCOPES; });
  expect((await upload()).status).toBe(409);
  await transaction(db => { db.integrations.google!.scopes = [...GOOGLE_SCOPES, GOOGLE_DRIVE_SCOPE]; db.integrations.google!.email = "different@example.test"; });
  expect((await upload()).status).toBe(409);
  expect(files.size).toBe(1);
});

it("reports a disabled Drive API without marking the documents folder ready", async () => {
  allowDrive = false;
  const response = await setupDrive(adminRequest({ action: "create_folder" }), undefined);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: "DRIVE_API_DISABLED" });
  expect((await readDatabase()).integrations.drive_documents?.ready).not.toBe(true);
});

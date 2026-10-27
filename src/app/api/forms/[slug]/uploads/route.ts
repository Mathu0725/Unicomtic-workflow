import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { route, RequestError } from "@/lib/http";
import { readDatabase, transaction } from "@/lib/data/repository";
import { databaseContext, getDb } from "@/lib/data/store";
import { documentsFolder, generateDriveId, uploadDocumentToDrive } from "@/lib/google/drive-service";
import { DOCUMENT_MAX_BYTES } from "@/lib/documents/constants";
import { MULTIPART_MAX_BYTES } from "@/lib/upload-limits";
import { uploadReceipt, type DocumentUpload } from "@/lib/documents/receipts";
import { requireCandidateAccess } from "@/lib/security/candidate-access";
import { findPublicForm } from "@/lib/forms/public-links";
export const dynamic = "force-dynamic";

function assertForm(slug: string, fieldId: string, version: string, req: NextRequest) {
  const form = findPublicForm(getDb(), slug);
  if (!form?.is_active || !getDb().campaigns.some(campaign => campaign.id === form.campaign_id && campaign.is_active)) throw new RequestError("This form is unavailable or closed.", 404);
  const access = ["application", "workshop_rsvp"].includes(form.type) ? requireCandidateAccess(getDb(), req) : undefined;
  if (access && access.registration.campaign_id !== form.campaign_id) throw new RequestError("This form belongs to a different intake.", 403);
  if (access && form.type === "application" && !["invited", "applied"].includes(access.registration.status)) throw new RequestError("An application invitation is required. Contact admissions.", 403);
  if (form.updated_at !== version) throw new RequestError("The form changed. Refresh its questions before uploading.", 409, { code: "FORM_CHANGED" });
  if (!form.fields.some(field => field.id === fieldId && field.type === "file")) throw new RequestError("Choose a valid document question.");
  return { form, candidateRegistrationId: access?.registration.id };
}
function fileType(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
}
export const POST = route(async (req, { params }: { params: { slug: string } }) => {
  const key = req.headers.get("idempotency-key") || "";
  if (!/^[\w-]{16,128}$/.test(key)) throw new RequestError("Choose the file again to start a valid upload.");
  const body = await req.formData();
  const fieldId = String(body.get("fieldId") || ""), version = String(body.get("expectedFormVersion") || "");
  const file = body.get("file");
  if (!(file instanceof File) || body.getAll("file").length !== 1 || !file.size || file.size > DOCUMENT_MAX_BYTES) throw new RequestError("Choose one PDF, JPG or PNG file, up to 4 MB.", 400, { code: "DOCUMENT_INVALID" });
  const snapshot = await readDatabase();
  const { form, candidateRegistrationId, folder } = databaseContext.run(snapshot, () => ({ ...assertForm(params.slug, fieldId, version, req), folder: documentsFolder() }));
  const bytes = Buffer.from(await file.arrayBuffer()), mimeType = fileType(bytes);
  if (!mimeType || (file.type && file.type !== mimeType)) throw new RequestError("This file's contents must match its PDF, JPG or PNG format.", 400, { code: "DOCUMENT_INVALID" });
  const name = file.name.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 180);
  if (!name || !(mimeType === "application/pdf" ? /\.pdf$/i : mimeType === "image/png" ? /\.png$/i : /\.jpe?g$/i).test(name)) throw new RequestError("The document filename must end in .pdf, .jpg, .jpeg or .png and match its contents.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const id = createHash("sha256").update(`${form.id}:${fieldId}${candidateRegistrationId ? `:${candidateRegistrationId}` : ""}:${key}`).digest("hex");
  const existing = snapshot.documentUploads.find(upload => upload.id === id);
  const driveId = existing?.drive_file_id || await databaseContext.run(snapshot, generateDriveId);
  const upload = await transaction(db => {
    assertForm(params.slug, fieldId, version, req);
    const currentFolder = documentsFolder();
    if (currentFolder.folder_id !== folder.folder_id || currentFolder.google_email !== folder.google_email) throw new RequestError("The upload connection changed. Choose the file again.", 409);
    let record = db.documentUploads.find(upload => upload.id === id);
    if (record && (record.sha256 !== sha256 || record.form_version !== version || record.field_id !== fieldId || record.folder_id !== folder.folder_id || record.google_email !== folder.google_email || record.candidate_registration_id !== candidateRegistrationId || record.submission_id || record.expires_at <= Date.now())) throw new RequestError("This upload belongs to a different or expired attempt. Choose the file again.", 409, { code: "DOCUMENT_ATTEMPT_CHANGED" });
    if (!record) {
      record = { id, form_id: form.id, field_id: fieldId, form_version: version, drive_file_id: driveId, google_email: folder.google_email, folder_id: folder.folder_id, name, mime_type: mimeType, size: bytes.length, sha256, status: "pending", created_at: new Date().toISOString(), expires_at: Date.now() + 86400000, ...(candidateRegistrationId ? { candidate_registration_id: candidateRegistrationId } : {}) } satisfies DocumentUpload;
      db.documentUploads.push(record);
    }
    return { ...record };
  }, { maxConflictRetries: 8 });
  if (upload.status !== "uploaded") {
    await databaseContext.run(snapshot, () => uploadDocumentToDrive(upload, bytes));
    await transaction(db => {
      const record = db.documentUploads.find(record => record.id === id)!;
      if (db.integrations.google?.email !== upload.google_email || db.integrations.drive_documents?.folder_id !== upload.folder_id) throw new RequestError("Google connection changed before the upload could be confirmed. Contact admissions.", 409);
      record.status = "uploaded";
    }, { maxConflictRetries: 8 });
  }
  return NextResponse.json({ success: true, receipt: uploadReceipt(id), name: upload.name, message: "Document uploaded. Submit the form to attach it to your application." });
}, false, { database: false, submission: true, bodyLimit: MULTIPART_MAX_BYTES });

import { getDb, databaseContext } from "../data/store";
import { readDatabase, transaction } from "../data/repository";
import { RequestError } from "../http";
import { googleRequest, hasDriveAccess } from "./oauth";
import type { DocumentUpload } from "../documents/receipts";

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const FOLDER_TYPE = "application/vnd.google-apps.folder";
const validId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{10,200}$/.test(id);

export function requireDriveAccess() {
  const connection = getDb().integrations.google;
  if (!connection || !hasDriveAccess()) throw new RequestError("Connect Google Drive in System Settings → Google integrations before accepting documents.", 409, { code: "DRIVE_NOT_CONNECTED" });
  return connection;
}
export function documentsFolder() {
  const connection = requireDriveAccess(), folder = getDb().integrations.drive_documents;
  if (!folder?.ready || folder.google_email !== connection.email) throw new RequestError("The student documents folder needs administrator setup before uploads can be accepted.", 409, { code: "DRIVE_FOLDER_REQUIRED" });
  return folder;
}
export async function generateDriveId() {
  const result = await googleRequest(`${DRIVE}/generateIds?count=1&space=drive&type=files`);
  if (!validId(result.ids?.[0])) throw new RequestError("Google Drive did not allocate a file ID. Try again.", 503, { code: "DRIVE_INVALID_RESPONSE", retryable: true });
  return result.ids[0] as string;
}
export async function driveFile(id: string) {
  return googleRequest(`${DRIVE}/${encodeURIComponent(id)}?fields=id,name,mimeType,size,trashed,appProperties&supportsAllDrives=true`);
}
function isExistingFile(error: unknown) { return error instanceof RequestError && error.code === "DRIVE_FILE_EXISTS" || error instanceof Error && "code" in error && error.code === "DRIVE_FILE_EXISTS"; }

export async function createDocumentsFolder() {
  const snapshot = await readDatabase();
  const connection = databaseContext.run(snapshot, requireDriveAccess);
  const previous = snapshot.integrations.drive_documents;
  const id = previous?.google_email === connection.email ? previous.folder_id : await databaseContext.run(snapshot, generateDriveId);
  const reserved = await transaction(db => {
    if (db.integrations.google?.refresh_token !== connection.refresh_token) throw new RequestError("Google connection changed. Reload and try again.", 409);
    requireDriveAccess();
    if (db.integrations.drive_documents?.google_email !== connection.email) db.integrations.drive_documents = { folder_id: id, folder_name: "Unicom TIC Student Documents", google_email: connection.email, ready: false };
    return { ...db.integrations.drive_documents! };
  }, { maxConflictRetries: 8 });
  const result = await databaseContext.run(snapshot, async () => {
    if (reserved.ready) return driveFile(reserved.folder_id);
    try {
      return await googleRequest(`${DRIVE}?fields=id,name,mimeType,trashed,appProperties`, { method: "POST", body: JSON.stringify({ id: reserved.folder_id, name: reserved.folder_name, mimeType: FOLDER_TYPE, appProperties: { unicomTic: "student-documents" } }) });
    } catch (error) {
      if (!isExistingFile(error)) throw error;
      return driveFile(reserved.folder_id);
    }
  });
  if (result.id !== reserved.folder_id || result.mimeType !== FOLDER_TYPE || result.trashed || result.appProperties?.unicomTic !== "student-documents") throw new RequestError("The documents folder could not be verified. Check the connected Google account and restore the portal's folder if it was moved to Trash.", 409, { code: "DRIVE_FOLDER_INVALID" });
  await transaction(db => {
    if (db.integrations.google?.refresh_token !== connection.refresh_token || db.integrations.drive_documents?.folder_id !== reserved.folder_id) throw new RequestError("Google connection changed. Reload and finish folder setup again.", 409);
    db.integrations.drive_documents.ready = true;
  }, { maxConflictRetries: 8 });
  return reserved.folder_id;
}

export async function uploadDocumentToDrive(upload: DocumentUpload, bytes: Buffer) {
  const boundary = `unicom-document-${upload.id}`;
  const metadata = { id: upload.drive_file_id, name: upload.name, parents: [upload.folder_id], appProperties: { portalUpload: upload.id, sha256: upload.sha256 } };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${upload.mime_type}\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  let result: any;
  try {
    result = await googleRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,trashed,appProperties", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: new Uint8Array(body) });
  } catch (error) {
    if (!isExistingFile(error)) throw error;
    result = await driveFile(upload.drive_file_id);
  }
  if (result.id !== upload.drive_file_id || result.trashed || result.mimeType !== upload.mime_type || Number(result.size) !== upload.size || result.appProperties?.portalUpload !== upload.id || result.appProperties?.sha256 !== upload.sha256) throw new RequestError("Google Drive did not confirm this document. Retry the same file to verify its upload.", 503, { code: "DOCUMENT_UPLOAD_UNCONFIRMED", retryable: true });
}

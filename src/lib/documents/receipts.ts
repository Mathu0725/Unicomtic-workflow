import { createHmac, timingSafeEqual } from "node:crypto";
import { appSecret } from "../security/secrets";
import { getDb, type CustomForm, type FormField } from "../data/store";
export interface DocumentUpload {
  id: string;
  form_id: string;
  field_id: string;
  form_version: string;
  drive_file_id: string;
  google_email: string;
  folder_id: string;
  name: string;
  mime_type: string;
  size: number;
  sha256: string;
  status: "pending" | "uploaded";
  created_at: string;
  expires_at: number;
  submission_id?: string;
  candidate_registration_id?: string;
}
export const documentUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/view`;
export function uploadReceipt(id: string) {
  return `document:${id}.${createHmac("sha256", appSecret()).update(`document:${id}`).digest("base64url")}`;
}
export function documentAnswer(form: CustomForm, field: FormField, value: unknown) {
  if (typeof value !== "string") return undefined;
  const match = /^document:([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return undefined;
  const expected = Buffer.from(uploadReceipt(match[1])), actual = Buffer.from(value);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  return getDb().documentUploads.find(upload => upload.id === match[1] && upload.status === "uploaded" && upload.form_id === form.id && upload.field_id === field.id && upload.form_version === form.updated_at && upload.expires_at > Date.now() && !upload.submission_id);
}

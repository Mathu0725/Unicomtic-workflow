import { z } from "zod";

// Keep the encoded request below the hosting platform's request size limit.
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const EMAIL_REQUEST_LIMIT = 3 * 1024 * 1024;
export const attachmentTypes: Record<string, string> = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain",
};
export const emailAttachmentSchema = z.object({
  filename: z.string().min(1).max(160).regex(/^[^\\/\x00-\x1f\x7f]+$/),
  contentType: z.string().max(100),
  content: z.string().min(4).max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict();
export const emailAttachmentsSchema = z.array(emailAttachmentSchema).max(5).superRefine((files, ctx) => {
  let total = 0;
  for (const file of files) {
    const extension = file.filename.split(".").pop()?.toLowerCase() || "";
    if (!attachmentTypes[extension] || attachmentTypes[extension] !== file.contentType)
      ctx.addIssue({ code: "custom", message: "Attach PDF, DOCX, XLSX, PNG, JPG or TXT files with the matching file type." });
    total += file.content.length * 3 / 4 - (file.content.endsWith("==") ? 2 : file.content.endsWith("=") ? 1 : 0);
  }
  if (total > MAX_ATTACHMENT_BYTES) ctx.addIssue({ code: "custom", message: "Attachments must total 2 MB or less." });
});
export type EmailAttachment = z.infer<typeof emailAttachmentSchema>;
export function attachmentSummary(files: EmailAttachment[] = []) {
  return files.map(({ filename, contentType, content }) => ({ filename, contentType, bytes: content.length * 3 / 4 - (content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0) }));
}

"use client";
import { useState } from "react";
import { attachmentTypes, attachmentSummary, emailAttachmentsSchema, type EmailAttachment } from "@/lib/email/attachments";

export default function EmailAttachments({ value, onChange, disabled = false, onReadingChange }: {
  value: EmailAttachment[]; onChange: (files: EmailAttachment[]) => void; disabled?: boolean; onReadingChange?: (reading: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  return <div className="space-y-2 text-sm">
    <label className="block font-semibold">Attachments (optional)
      <input className="mt-2 block w-full text-xs" type="file" multiple disabled={disabled || reading}
        accept={Object.keys(attachmentTypes).map(ext => `.${ext}`).join(",")}
        onChange={async event => {
          const files = Array.from(event.target.files || []); event.target.value = ""; setError("");
          if (value.length + files.length > 5 || files.reduce((sum, file) => sum + file.size, 0) + attachmentSummary(value).reduce((sum, file) => sum + file.bytes, 0) > 2 * 1024 * 1024) {
            setError("Choose up to 5 attachments, totaling 2 MB or less."); return;
          }
          setReading(true); onReadingChange?.(true);
          try {
            const additions = await Promise.all(files.map(file => new Promise<EmailAttachment>((resolve, reject) => {
              const reader = new FileReader(); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
              reader.onload = () => resolve({ filename: file.name, contentType: attachmentTypes[file.name.split(".").pop()?.toLowerCase() || ""] || "", content: String(reader.result).split(",")[1] || "" });
              reader.readAsDataURL(file);
            })));
            const parsed = emailAttachmentsSchema.safeParse([...value, ...additions]);
            if (!parsed.success) throw new Error(parsed.error.issues[0].message);
            onChange(parsed.data);
          } catch (err) { setError(err instanceof Error ? err.message : "Could not read attachments."); }
          finally { setReading(false); onReadingChange?.(false); }
        }} />
    </label>
    <p className="text-xs text-slate-500">Up to 5 PDF, DOCX, XLSX, PNG, JPG or TXT files; 2 MB total. Files are included in each recipient's email.</p>
    {reading && <p role="status">Reading files…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {attachmentSummary(value).map((file, index) => <div key={`${index}:${file.filename}`} className="flex items-center justify-between gap-3 rounded border p-2">
      <span className="break-all">{file.filename} ({Math.ceil(file.bytes / 1024)} KB)</span>
      <button type="button" disabled={disabled || reading} className="text-red-700" aria-label={`Remove ${file.filename}`} onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove</button>
    </div>)}
  </div>;
}

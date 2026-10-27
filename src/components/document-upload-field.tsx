"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, RotateCw, X } from "lucide-react";
import { apiResponse, readJson } from "@/lib/client/api";
import { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, DOCUMENT_TYPES } from "@/lib/documents/constants";

export default function DocumentUploadField({ slug, fieldId, version, label, required, ready, value, disabled, onChange, onBusyChange }: {
  slug: string; fieldId: string; version: string; label: string; required: boolean; ready: boolean;
  value: string; disabled: boolean; onChange: (receipt: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null), [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null), attempt = useRef(""), request = useRef<AbortController | null>(null);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => () => { request.current?.abort(); busyCallback.current(false); }, []);

  const upload = async (selected: File, key: string) => {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const body = new FormData();
      body.set("file", selected); body.set("fieldId", fieldId); body.set("expectedFormVersion", version);
      const response = await apiResponse(`/api/forms/${encodeURIComponent(slug)}/uploads`, { method: "POST", headers: { "Idempotency-Key": key }, body, signal: controller.signal });
      const result = await readJson(response);
      if (!controller.signal.aborted) { setName(result.name); onChange(result.receipt); }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not upload this document. Retry the same file.");
    } finally {
      if (!controller.signal.aborted) { setBusy(false); onBusyChange(false); }
    }
  };
  const choose = (selected: File | null) => {
    if (!selected) return;
    onChange(""); setName(""); setError(""); setFile(null);
    if (!selected.size || selected.size > DOCUMENT_MAX_BYTES || (selected.type && !(DOCUMENT_TYPES as readonly string[]).includes(selected.type))) {
      setError("Choose a PDF, JPG or PNG file, up to 4 MB.");
      if (input.current) input.current.value = "";
      return;
    }
    setFile(selected); attempt.current = crypto.randomUUID();
    void upload(selected, attempt.current);
  };
  const clear = () => { setFile(null); setName(""); setError(""); attempt.current = ""; onChange(""); if (input.current) input.current.value = ""; };
  return <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
    <input ref={input} type="file" aria-label={label} accept={DOCUMENT_ACCEPT} required={required && !value} disabled={disabled || busy || !ready} onChange={event => choose(event.target.files?.[0] || null)} className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:font-semibold file:text-slate-800 disabled:opacity-50" />
    <p className="text-[11px] text-slate-500">PDF, JPG or PNG · Maximum 4 MB. Submit the form after uploading to complete your application.</p>
    {!ready && <p role="alert" className="text-xs text-amber-800">Document uploads are temporarily unavailable. Please contact admissions.</p>}
    {busy && <p role="status" className="flex items-center gap-2 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading document…</p>}
    {value && !busy && <p role="status" className="flex items-center gap-2 text-xs text-emerald-800"><Paperclip className="h-3.5 w-3.5" />{name || "Document"} uploaded <button type="button" disabled={disabled} onClick={clear} className="ml-auto inline-flex items-center gap-1 text-slate-600 underline"><X className="h-3 w-3" />Remove</button></p>}
    {error && <div role="alert" className="space-y-2 text-xs text-red-700"><p>{error}</p>{file && <button type="button" disabled={busy || disabled || !ready} onClick={() => upload(file, attempt.current)} className="inline-flex items-center gap-1.5 font-semibold underline"><RotateCw className="h-3.5 w-3.5" />Retry same file</button>}</div>}
  </div>;
}

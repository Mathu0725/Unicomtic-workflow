"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api, inputClass, buttonClass, Notice } from "./live-data";
import { emailValidationMessage } from "@/lib/validations/email";

export type EmailEditTarget = { studentId: string; name: string; email: string };
export default function CandidateEmailEditor({ target, onClose, onSaved }: { target: EmailEditTarget | null; onClose: () => void; onSaved: (result: any) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!target) { if (dialog.current?.open) dialog.current.close(); return; }
    setEmail(target.email); setError("");
    if (!dialog.current?.open) dialog.current?.showModal();
    const content = document.getElementById("admin-page-content"), previous = content?.style.overflow || "";
    if (content) content.style.overflow = "hidden";
    return () => { if (content) content.style.overflow = previous; };
  }, [target]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target || busy) return;
    const validation = emailValidationMessage(email);
    if (validation) { setError(validation); return; }
    setBusy(true); setError("");
    try {
      const result = await api("/api/admin/candidates/email", { studentId: target.studentId, expectedEmail: target.email, email }, "PATCH");
      onSaved(result); onClose();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} aria-labelledby="edit-candidate-email-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/60">
    <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="edit-candidate-email-title" className="text-lg font-bold">Edit candidate email</h2><p className="mt-1 text-sm text-slate-500">{target?.name}</p></div><button type="button" disabled={busy} aria-label="Close email editor" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
    <form onSubmit={save} className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">Current email</p><p className="mt-1 break-all text-sm">{target?.email}</p></div>
      <label className="block text-sm font-semibold" htmlFor="corrected-candidate-email">Correct email address</label>
      <input id="corrected-candidate-email" required type="email" maxLength={254} autoComplete="off" spellCheck={false} autoCapitalize="none" value={email} onChange={event => { setEmail(event.target.value); setError(""); }} onBlur={() => { if (email.trim()) setError(emailValidationMessage(email) || ""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "candidate-email-edit-error" : undefined} disabled={busy} className={inputClass} />
      <div id="candidate-email-edit-error"><Notice error>{error}</Notice></div>
      <p className="text-xs leading-relaxed text-slate-500">Updates this candidate across registrations, applications and future messages. Old-address pending emails pause for review. Review the corrected address before saving.</p>
      <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button><button className={buttonClass} disabled={busy}>{busy ? "Saving…" : "Save email"}</button></div>
    </form>
  </dialog>;
}

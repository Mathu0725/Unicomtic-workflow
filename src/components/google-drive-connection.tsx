"use client";
import { useState } from "react";
import { CheckCircle2, Folder, HardDrive, Loader2 } from "lucide-react";
import { api, useLiveData, Notice, panelClass, buttonClass } from "@/components/live-data";

export default function GoogleDriveConnection() {
  const live = useLiveData("/api/admin/drive", 0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const createFolder = async () => {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { const result = await api("/api/admin/drive", { action: "create_folder" }); setMessage(result.message); await live.reload(); }
    catch (error) { setError(error instanceof Error ? error.message : "Drive setup could not be confirmed. Try finishing folder setup again."); }
    finally { setBusy(false); }
  };
  return <section id="student-documents-drive" aria-labelledby="drive-heading" className={panelClass}>
    <div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><HardDrive className="h-5 w-5" aria-hidden="true" /></span><div><h2 id="drive-heading" className="text-lg font-bold">Google Drive · Student documents</h2><p className="mt-1 text-sm text-slate-500">Save student PDFs and photos in a dedicated admissions folder.</p></div></div>
    <Notice error>{error || live.error}</Notice><Notice>{message}</Notice>
    {!live.data && !live.error && <p role="status" className="text-sm text-slate-500">Checking Drive connection…</p>}
    {live.data && <>
      <p className="text-sm">{live.data.connected ? <span className="inline-flex items-center gap-2 text-emerald-800"><CheckCircle2 className="h-4 w-4" />Drive connected: {live.data.email}</span> : live.data.email ? `Drive permission is needed for ${live.data.email}.` : "Connect the admissions Google account to enable Drive uploads."}</p>
      {!live.data.connected ? <a className={`${buttonClass} gap-2`} href="/api/auth/google?drive=1"><HardDrive className="h-4 w-4" aria-hidden="true" />Connect Google Drive</a> : <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy} onClick={createFolder} className={`${buttonClass} gap-2`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Folder className="h-4 w-4" />}{busy ? "Checking folder…" : live.data.folder?.ready ? "Check documents folder" : live.data.folder ? "Finish documents folder setup" : "Create documents folder"}</button>{live.data.folder?.ready && <a href={`https://drive.google.com/drive/folders/${live.data.folder.folder_id}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700 underline">Open {live.data.folder.folder_name} ↗</a>}</div>}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600"><p>Drive access covers files this portal creates or you share with it. Documents inherit the folder&apos;s sharing permissions; the portal creates no public sharing links.</p><p className="mt-2">After folder setup, open Form Builder and add <strong>File upload (PDF / image)</strong> questions. Students can upload one PDF, JPG or PNG up to 4 MB per question. Submitted documents appear in the form&apos;s Responses page.</p></div>
      <p className="text-xs text-slate-500">If Drive API is disabled, <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer" className="text-blue-700 underline">enable Google Drive API</a> in the Google Cloud project used for this connection, then finish folder setup.</p>
    </>}
    {live.error && <button type="button" onClick={() => live.reload()} className="text-sm text-blue-700 underline">Retry Drive status</button>}
  </section>;
}

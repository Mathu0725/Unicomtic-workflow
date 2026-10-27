"use client";
import { useEffect, useState } from "react";
import { Eye, Mail, Send, X } from "lucide-react";
import { api, useLiveData, inputClass, buttonClass, panelClass, Notice } from "./live-data";
import EmailPreview from "./reminder-email-preview";
import SubmissionRecovery from "./submission-recovery";
import { pendingPayload, submitRequest } from "@/lib/client/submit";
import { readJson, responseError } from "@/lib/client/api";
import type { CandidateStage, EmailCandidate } from "@/lib/email/candidates";
import { personalizeTemplate } from "@/lib/email/template-catalog";

const endpoint = "/api/admin/email/candidates";
export default function CandidateEmailComposer({ onQueued }: { onQueued: () => Promise<void> }) {
  const [stage, setStage] = useState<CandidateStage>("registration"), [status, setStatus] = useState(""), [search, setSearch] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1), [initialId, setInitialId] = useState("");
  const [selected, setSelected] = useState<EmailCandidate | null>(null), [subject, setSubject] = useState(""), [body, setBody] = useState(""), [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [jobId, setJobId] = useState(""), [unresolved, setUnresolved] = useState(false), [attemptId, setAttemptId] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stage") === "application") setStage("application");
    setInitialId(params.get("candidate") || "");
    setAttemptId(crypto.randomUUID());
    setUnresolved(pendingPayload(endpoint) !== undefined);
  }, []);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const directory = useLiveData(`${endpoint}?${new URLSearchParams({ stage, status, search: query, page: String(page), ...(initialId ? { candidate: initialId } : {}) })}`, 15000);
  useEffect(() => { if (!selected && initialId && directory.data?.candidates?.[0]?.id === initialId) setSelected(directory.data.candidates[0]); }, [initialId, directory.data, selected]);
  const choose = (candidate: EmailCandidate) => { if (candidate.id !== selected?.id || candidate.stage !== selected.stage) { setSubject(""); setBody(""); setMessage(""); setError(""); setJobId(""); } setSelected(candidate); };
  const refreshDelivery = async (data: any) => {
    setJobId(data.jobId); setMessage("Email saved. Checking delivery status…"); setUnresolved(false);
    setSubject(""); setBody(""); setAttemptId(crypto.randomUUID());
    try {
      const result = await api("/api/admin/email/dispatch", { jobId: data.jobId });
      if (result.deliveryStatus === "failed" || result.deliveryStatus === "uncertain") { setError(result.message); setMessage(""); }
      else setMessage(result.message);
    }
    catch (e: any) { setMessage("Email is saved in the queue. Delivery is not yet confirmed; check its status below before composing another copy."); setError(e.message); }
    await onQueued();
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || busy || unresolved) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await submitRequest(endpoint, { stage: selected.stage, recordId: selected.id, expectedEmail: selected.email, subject, body, clientAttemptId: attemptId });
      const data = await readJson(response);
      if (!response.ok || !data.success) throw responseError(response, data);
      await refreshDelivery(data);
    } catch (e: any) { setError(e.message); setUnresolved(pendingPayload(endpoint) !== undefined); }
    finally { setBusy(false); }
  };
  return <section className={panelClass}>
    <div><h2 className="text-lg font-bold">Email a candidate</h2><p className="mt-1 text-sm text-slate-500">Filter registrations or applications, select one candidate, then preview and send.</p></div>
    <Notice error>{error || directory.error}</Notice>{(message || jobId) && <Notice>{message}{jobId && <span className="mt-1 block text-xs break-all">Delivery reference: {jobId}</span>}</Notice>}
    <SubmissionRecovery url={endpoint} show={unresolved} onResolved={data => { setBusy(true); void refreshDelivery(data).finally(() => setBusy(false)); }} />
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Candidate source<select className={`${inputClass} mt-1`} value={stage} onChange={event => { setStage(event.target.value as CandidateStage); setStatus(""); setPage(1); setInitialId(""); setSelected(null); setSubject(""); setBody(""); }}><option value="registration">Registrations</option><option value="application">Applications</option></select></label>
          <label className="text-xs font-semibold">Candidate status<select className={`${inputClass} mt-1`} value={status} onChange={event => { setStatus(event.target.value); setPage(1); setInitialId(""); }}><option value="">All statuses</option>{directory.data?.statuses.map((value: string) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        </div>
        <label className="block text-xs font-semibold">Find candidate<input className={`${inputClass} mt-1`} placeholder="Name, email or reference" value={search} onChange={event => { setSearch(event.target.value); setInitialId(""); }} /></label>
        {initialId && <button type="button" className="text-xs font-semibold text-blue-700 underline" onClick={() => setInitialId("")}>Show all candidates</button>}
        <div role="group" aria-label="Candidate results" className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
          {directory.loading && <p className="p-5 text-sm text-slate-500">Loading candidates…</p>}
          {directory.data?.candidates.map((candidate: EmailCandidate) => <label key={candidate.id} className={`flex cursor-pointer items-start gap-3 p-3 ${selected?.id === candidate.id && selected.stage === candidate.stage ? "bg-blue-50" : "hover:bg-slate-50"}`}>
            <input type="radio" name="email-candidate" className="mt-1" checked={selected?.id === candidate.id && selected.stage === candidate.stage} onChange={() => choose(candidate)} disabled={busy || unresolved} />
            <span className="min-w-0 text-sm"><span className="block font-semibold">{candidate.name}</span><span className="block break-all text-xs text-slate-500">{candidate.email || "No email address"}</span><span className="mt-1 block text-xs text-slate-500">{candidate.reference} · {candidate.status.replaceAll("_", " ")}</span></span>
          </label>)}
          {directory.data && !directory.data.candidates.length && <p className="p-5 text-sm text-slate-500">No {stage === "application" ? "applications" : "registrations"} match these filters.</p>}
        </div>
        {directory.data && <div className="flex items-center justify-between text-xs text-slate-500"><span>{directory.data.total} candidates · Page {page}</span><span className="flex gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="text-blue-700 disabled:text-slate-300">Previous</button><button type="button" disabled={page * directory.data.pageSize >= directory.data.total} onClick={() => setPage(page + 1)} className="text-blue-700 disabled:text-slate-300">Next</button></span></div>}
      </div>
      {selected ? <form onSubmit={send} className="space-y-3">
        <button type="button" disabled={busy || unresolved || !directory.data?.messageTemplate} className="text-sm font-semibold text-blue-700 disabled:opacity-50" onClick={() => { const template = directory.data.messageTemplate, values = { name: selected.name, email: selected.email, reference: selected.reference, intake: directory.data.intakeTitles?.[selected.id] || "Unicom TIC" }; setSubject(personalizeTemplate(template.subject, values)); setBody(personalizeTemplate(template.body, values)); }}>Use saved message template</button>
        <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Mail className="h-3.5 w-3.5" />To · {selected.reference}</p><p className="mt-1 text-sm font-semibold">{selected.name}</p><p className="break-all text-xs text-slate-500">{selected.email}</p></div><button type="button" aria-label="Clear selected candidate" disabled={busy || unresolved} onClick={() => { setSelected(null); setInitialId(""); }} className="p-1 text-slate-400"><X className="h-4 w-4" /></button></div>
        <label className="block text-xs font-semibold">Email subject<input required maxLength={250} className={`${inputClass} mt-1`} value={subject} disabled={busy || unresolved} onChange={event => setSubject(event.target.value)} /></label>
        <label className="block text-xs font-semibold">Message<textarea required maxLength={10000} rows={6} className={`${inputClass} mt-1 resize-y`} placeholder="Write your message in English or Tamil…" value={body} disabled={busy || unresolved} onChange={event => setBody(event.target.value)} /></label>
        <div className="flex flex-wrap gap-3"><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={!subject.trim() || !body.trim() || busy} onClick={() => setPreview(true)}><Eye className="h-4 w-4" />Preview email</button><button className={`${buttonClass} gap-2`} disabled={busy || unresolved || !selected.email || !attemptId}><Send className="h-4 w-4" />{busy ? "Saving & checking…" : "Send email"}</button></div>
        <p className="text-xs leading-relaxed text-slate-500">Uses the daily allowance. Excess messages wait in the queue. “Sent” confirms provider acceptance; delivery errors appear below.</p>
      </form> : <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Select a candidate to compose an email.</div>}
    </div>
    <EmailPreview open={preview && Boolean(selected)} onClose={() => setPreview(false)} recipient={{ name: selected?.name || "", email: selected?.email || "" }} subject={subject} body={body} actionLabel="" actionUrl="" description="Candidate message" />
  </section>;
}

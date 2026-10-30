"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, buttonClass, inputClass, Notice, panelClass } from "@/components/live-data";
import { apiResponse, readJson } from "@/lib/client/api";

type FormOption = { id: string; title: string; type: string; total: number };
type ResponseRow = { id: string; reference: string; name: string; email: string; createdAt: string };
type TemplateOption = { id: string; title: string; subject: string };
type AccountOption = { id: string; name: string; active: boolean };
type Preview = { recipientCount: number; preview: { reference: string; to: string; subject: string; text: string }[]; accountId: string; attemptId: string };

export default function FormCampaignsPage() {
  const [forms, setForms] = useState<FormOption[]>([]);
  const [formId, setFormId] = useState("");
  const [filter, setFilter] = useState<"all" | "not_contacted" | "failed">("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [matching, setMatching] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<"all" | "selected">("all");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [batchId, setBatchId] = useState("");
  const [recent, setRecent] = useState<{ id: string; formTitle: string; createdAt: string; total: number; queued: number; sent: number; failed: number }[]>([]);
  const [progress, setProgress] = useState<{ total: number; queued: number; processing: number; sent: number; failed: number } | null>(null);
  const [deliveries, setDeliveries] = useState<{ id: string; reference: string; to: string; status: string; error?: string; attempts: number }[]>([]);
  const [moreDeliveries, setMoreDeliveries] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [message, setMessage] = useState("");

  const load = useCallback(async (id: string, mode: typeof filter, pageNumber: number, signal?: AbortSignal) => {
    const query = id ? `?formId=${encodeURIComponent(id)}&filter=${mode}&page=${pageNumber}` : "";
    const data = await api(`/api/admin/email/form-campaigns${query}`, undefined, "GET", signal);
    if (signal?.aborted) return;
    setForms(data.forms);
    setRecent(data.recent || []);
    setAccounts(data.accounts);
    setAccountId(current => data.accounts.some((item: AccountOption) => item.id === current && item.active) ? current : data.accounts.find((item: AccountOption) => item.id === data.defaultAccountId && item.active)?.id || data.accounts.find((item: AccountOption) => item.active)?.id || "");
    if (!id) { setFormId(data.forms[0]?.id || ""); return; }
    setRows(data.rows);
    setTotal(data.totalResponses);
    setMatching(data.matchingResponses);
    setTemplates(data.templates);
    setTemplateId(current => data.templates.some((item: TemplateOption) => item.id === current) ? current : data.templates[0]?.id || "");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(formId, filter, page, controller.signal).catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load, formId, filter, page]);
  useEffect(() => {
    if (!batchId) return;
    let active = true;
    const refresh = async () => {
      try { const data = await api(`/api/admin/email/form-campaigns?batchId=${encodeURIComponent(batchId)}`, undefined, "GET"); if (active) { setProgress(data.progress); setDeliveries(data.deliveries || []); setMoreDeliveries(Boolean(data.moreDeliveries)); setRecent(data.recent || []); } }
      catch (cause) { if (active) setError((cause as Error).message); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => { active = false; clearInterval(timer); };
  }, [batchId]);
  const invalidate = () => { setPreview(null); setMessage(""); setError(""); };
  const payload = (attemptId?: string, recipientCount?: number) => ({
    formId, filter, selectionMode, selectedIds, templateId, accountId,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    ...(attemptId ? { clientAttemptId: attemptId } : {}),
    ...(recipientCount !== undefined ? { expectedRecipientCount: recipientCount } : {}),
  });
  const review = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await api("/api/admin/email/form-campaigns/preview", payload());
      setPreview({ ...data, attemptId: crypto.randomUUID() });
    } catch (cause) { setError((cause as Error).message); setPreview(null); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!preview || !window.confirm(`Queue ${preview.recipientCount} individual emails${scheduledAt ? " for the selected time" : " now"}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiResponse("/api/admin/email/form-campaigns", { method: "POST", headers: { "Content-Type": "application/json", "idempotency-key": preview.attemptId }, body: JSON.stringify(payload(preview.attemptId, preview.recipientCount)) });
      const data = await readJson(response);
      setBatchId(data.batchId); setMessage(data.message); setPreview(null);
      await load(formId, filter, page);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <main className="space-y-5">
    <div><Link href="/admin/email" className="text-sm font-semibold text-blue-700 underline">← Email Center</Link><h1 className="mt-2 text-2xl font-extrabold">Form campaigns</h1><p className="mt-1 text-sm text-slate-600">Select a form, review real recipients, then queue one email per response.</p></div>
    <Notice error>{error}</Notice><Notice>{message}</Notice>
    <section className={panelClass}>
      <h2 className="font-bold">1. Select form and recipients</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Form<select className={`${inputClass} mt-1`} value={formId} onChange={event => { setFormId(event.target.value); setPage(1); setSelectedIds([]); setSelectionMode("all"); invalidate(); }}>{forms.map(form => <option key={form.id} value={form.id}>{form.title} ({form.total})</option>)}</select></label>
        <label className="text-sm font-semibold">Recipients<select className={`${inputClass} mt-1`} value={filter} onChange={event => { setFilter(event.target.value as typeof filter); setPage(1); setSelectedIds([]); setSelectionMode("all"); invalidate(); }}><option value="all">All responses</option><option value="not_contacted">No form campaign yet</option><option value="failed">Previous campaign failed</option></select></label>
      </div>
      <p className="text-sm text-slate-600">{total} responses · {matching} match this filter · {selectionMode === "selected" ? `${selectedIds.length} selected across pages` : "all matching selected"}. Maximum 500 per campaign.</p>
      {loading ? <p role="status">Loading responses…</p> : <div className="space-y-2">{rows.map(row => <label key={row.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={selectionMode === "selected" && selectedIds.includes(row.id)} onChange={event => { setSelectionMode("selected"); setSelectedIds(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id)); invalidate(); }} /><span><strong>{row.name || row.reference}</strong> · {row.email}<br /><span className="text-xs text-slate-500">{row.reference} · {new Date(row.createdAt).toLocaleString()}</span></span></label>)}{!rows.length && <p className="text-sm text-slate-500">No matching responses.</p>}</div>}
      <div className="flex gap-3 text-sm"><button type="button" className="text-blue-700 underline" onClick={() => { setSelectedIds([]); setSelectionMode("all"); invalidate(); }}>Use all matching</button><button type="button" disabled={page <= 1} className="disabled:opacity-40" onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={page * 50 >= matching} className="disabled:opacity-40" onClick={() => setPage(value => value + 1)}>Next</button></div>
    </section>
    <section className={panelClass}><h2 className="font-bold">2. Template, sender and time</h2><div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">Template<select className={`${inputClass} mt-1`} value={templateId} onChange={event => { setTemplateId(event.target.value); invalidate(); }}>{templates.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="text-sm font-semibold">Sending account<select className={`${inputClass} mt-1`} value={accountId} onChange={event => { setAccountId(event.target.value); invalidate(); }}>{accounts.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm font-semibold">Schedule (optional, local time)<input type="datetime-local" className={`${inputClass} mt-1`} value={scheduledAt} onChange={event => { setScheduledAt(event.target.value); invalidate(); }} /></label>
    </div><div className="flex gap-4 text-sm"><Link href="/admin/email/templates?view=templates" className="text-blue-700 underline">Edit system templates</Link><Link href="/admin/email/reusable-templates" className="text-blue-700 underline">Create reusable template</Link></div></section>
    <section className={panelClass}><h2 className="font-bold">3. Review and send</h2><button type="button" className={buttonClass} disabled={busy || !formId || !templateId || !matching || selectionMode === "selected" && !selectedIds.length} onClick={() => void review()}>Preview real emails</button>{preview && <div className="space-y-3"><p className="font-semibold">{preview.recipientCount} recipients validated. These are the first three emails:</p>{preview.preview.map(item => <div key={item.reference} className="rounded-lg border p-3 text-sm"><p>To: {item.to}</p><p>Subject: {item.subject}</p><pre className="mt-2 whitespace-pre-wrap font-sans">{item.text}</pre></div>)}<button type="button" className={buttonClass} disabled={busy} onClick={() => void send()}>Confirm and {scheduledAt ? "schedule" : "queue"} {preview.recipientCount} emails</button></div>}</section>
    <section className={panelClass}><h2 className="font-bold">Recent campaigns</h2>{recent.length ? <div className="space-y-2">{recent.map(item => <button type="button" key={item.id} onClick={() => setBatchId(item.id)} className="block w-full rounded-lg border p-3 text-left text-sm hover:bg-slate-50"><strong>{item.formTitle}</strong> · {item.total} emails · {item.sent} sent · {item.failed} need review<br /><span className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</span></button>)}</div> : <p className="text-sm text-slate-500">No form campaigns yet.</p>}</section>
    {batchId && <section className={panelClass}><h2 className="font-bold">Campaign progress</h2><p className="text-sm">{progress ? `${progress.sent} sent · ${progress.queued} queued · ${progress.processing} processing · ${progress.failed} need review · ${progress.total} total` : "Loading…"}</p><p className="text-xs text-slate-500">Sent means the provider accepted the message. Inbox delivery is not confirmed.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Reference</th><th className="p-2">Recipient</th><th className="p-2">Status</th><th className="p-2">Attempts</th><th className="p-2">Issue</th></tr></thead><tbody>{deliveries.map(item => <tr key={item.id} className="border-t"><td className="p-2">{item.reference}</td><td className="p-2">{item.to}</td><td className="p-2">{item.status}</td><td className="p-2">{item.attempts}</td><td className="p-2">{item.error || "—"}</td></tr>)}</tbody></table></div>{moreDeliveries && <p className="text-xs text-slate-500">Showing the first 500 recipients.</p>}</section>}
  </main>;
}

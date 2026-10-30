"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, buttonClass, inputClass, Notice, panelClass } from "@/components/live-data";
import { personalizeTemplate, plainEmailHtml, templateExampleValues } from "@/lib/email/template-catalog";

type Template = { id: string; title: string; form_id?: string; subject: string; body_html: string; is_active: boolean; version: number; revisionCount: number };
type Form = { id: string; title: string; variables: string[] };
type Draft = { title: string; formId: string; subject: string; bodyHtml: string };
const empty: Draft = { title: "", formId: "", subject: "", bodyHtml: "<p>Dear {{name}},</p><p></p>" };
export default function ReusableTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]), [forms, setForms] = useState<Form[]>([]), [commonVariables, setCommonVariables] = useState<string[]>([]);
  const [id, setId] = useState(""), [draft, setDraft] = useState<Draft>(empty);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const selected = templates.find(item => item.id === id);
  const variables = forms.find(form => form.id === draft.formId)?.variables || commonVariables;
  const dirty = JSON.stringify(draft) !== JSON.stringify(selected ? { title: selected.title, formId: selected.form_id || "", subject: selected.subject, bodyHtml: selected.body_html } : empty);
  const load = useCallback(async (preferred?: string, signal?: AbortSignal) => {
    const data = await api("/api/admin/email/reusable-templates", undefined, "GET", signal);
    if (signal?.aborted) return;
    setTemplates(data.templates); setForms(data.forms); setCommonVariables(data.commonVariables);
    const item = data.templates.find((entry: Template) => entry.id === preferred);
    if (item) { setId(item.id); setDraft({ title: item.title, formId: item.form_id || "", subject: item.subject, bodyHtml: item.body_html }); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(undefined, controller.signal).catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); }); return () => controller.abort(); }, [load]);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const choose = (item?: Template) => { if (dirty) { setError("Save or discard your changes before switching templates."); return; } setId(item?.id || ""); setDraft(item ? { title: item.title, formId: item.form_id || "", subject: item.subject, bodyHtml: item.body_html } : empty); setError(""); setMessage(""); };
  const act = async (action: "create" | "update" | "duplicate" | "archive" | "restore") => {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const body = action === "create" ? { action, ...draft } : action === "update" ? { action, id, expectedVersion: selected?.version, ...draft } : action === "duplicate" ? { action, id } : { action, id, expectedVersion: selected?.version };
      const result = await api("/api/admin/email/reusable-templates", body);
      await load(result.id);
      setMessage(result.message);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const sample = Object.fromEntries(variables.map(variable => [variable, templateExampleValues[variable] || `Sample ${variable}`]));
  const preview = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">${personalizeTemplate(draft.bodyHtml, sample)}`;
  return <main className="space-y-5"><div><Link href="/admin/email" className="text-sm font-semibold text-blue-700 underline">← Email Center</Link><h1 className="mt-2 text-2xl font-extrabold">Reusable templates</h1><p className="mt-1 text-sm text-slate-600">Create a message once and choose it for a form campaign. Queued emails retain the version used when they were created.</p></div><Notice error>{error}</Notice><Notice>{message}</Notice><div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><aside className={panelClass}><button type="button" className={buttonClass} disabled={busy} onClick={() => choose()}>New template</button><div className="space-y-1">{templates.map(item => <button type="button" key={item.id} className={`block w-full rounded-lg p-2 text-left text-sm ${item.id === id ? "bg-blue-50 font-bold text-blue-800" : "hover:bg-slate-50"}`} onClick={() => choose(item)}>{item.title}{!item.is_active && <span className="ml-2 text-xs text-slate-500">Archived</span>}</button>)}</div>{!templates.length && <p className="text-sm text-slate-500">No reusable templates yet.</p>}</aside><section className={panelClass}><h2 className="font-bold">{selected ? `Edit ${selected.title}` : "Create template"}</h2><form className="space-y-3" onSubmit={event => { event.preventDefault(); void act(selected ? "update" : "create"); }}><label className="block text-sm font-semibold">Name<input required maxLength={120} className={`${inputClass} mt-1`} value={draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} /></label><label className="block text-sm font-semibold">Available for<select className={`${inputClass} mt-1`} value={draft.formId} onChange={event => setDraft(value => ({ ...value, formId: event.target.value }))}><option value="">All forms</option>{forms.map(form => <option key={form.id} value={form.id}>{form.title}</option>)}</select></label><label className="block text-sm font-semibold">Subject<input required maxLength={250} className={`${inputClass} mt-1`} value={draft.subject} onChange={event => setDraft(value => ({ ...value, subject: event.target.value }))} /></label><label className="block text-sm font-semibold">HTML message<textarea required rows={12} maxLength={12000} className={`${inputClass} mt-1 font-mono text-xs`} value={draft.bodyHtml} onChange={event => setDraft(value => ({ ...value, bodyHtml: event.target.value }))} /></label><label className="block text-sm font-semibold">Insert placeholder<select className={`${inputClass} mt-1`} value="" onChange={event => setDraft(value => ({ ...value, bodyHtml: `${value.bodyHtml}{{${event.target.value}}}` }))}><option value="">Choose a field…</option>{variables.map(variable => <option key={variable} value={variable}>{variable}</option>)}</select></label><p className="text-xs text-slate-500">Use HTML paragraphs and links. Preview uses sample values; Form Campaigns previews each real recipient before sending.</p><div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy}>{selected ? "Save changes" : "Create template"}</button>{selected && <><button type="button" disabled={busy || dirty} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={() => void act("duplicate")}>Duplicate</button><button type="button" disabled={busy || dirty} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={() => void act(selected.is_active ? "archive" : "restore")}>{selected.is_active ? "Archive" : "Restore"}</button></>}</div></form>{selected && <p className="text-xs text-slate-500">Version {selected.version} · {selected.revisionCount} saved revisions · {selected.is_active ? "Available" : "Archived"}</p>}<div className="space-y-2"><h3 className="font-semibold">Sample preview</h3><p className="text-sm">{personalizeTemplate(draft.subject, sample)}</p><iframe title="Template preview" sandbox="" srcDoc={preview || plainEmailHtml("Preview appears here.")} className="h-64 w-full rounded-lg border" /></div></section></div></main>;
}

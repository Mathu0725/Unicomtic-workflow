"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { buttonClass, inputClass, Notice, panelClass } from "./live-data";

export type IntakeOption = { id: string; title: string; is_active: boolean };
export type CandidateOption = { studentId: string; campaignId: string; studentName: string; email: string; reference: string; utNumber: string };
type Action = Record<string, unknown>;
type EditorProps = { onSave: (action: Action) => Promise<void>; onCancel: () => void };

export function IntakeSelect({ intakes, value, onChange }: { intakes: IntakeOption[]; value: string; onChange: (value: string) => void }) {
  return <label className="block max-w-md space-y-1 text-sm font-semibold text-slate-700">Intake
    <select className={inputClass} value={value} onChange={event => onChange(event.target.value)}>
      {!intakes.length && <option value="">No intakes available</option>}
      {intakes.map(intake => <option key={intake.id} value={intake.id}>{intake.title}{intake.is_active ? " (active)" : ""}</option>)}
    </select>
  </label>;
}

function ActionForm({ title, children, action, submitLabel, onSave, onCancel, disabled = false }: EditorProps & { title: string; children: ReactNode; action: () => Action; submitLabel: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await onSave(action()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save. Please try again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className={panelClass} aria-label={title}>
    <h2 className="text-lg font-bold text-slate-900">{title}</h2>
    <Notice error>{error}</Notice>
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      {children}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onCancel} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold">Cancel</button>
        <button type="submit" disabled={disabled} className={buttonClass}>{busy ? "Saving…" : submitLabel}</button>
      </div>
    </fieldset>
  </form>;
}

export function sriLankaInputTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return parts.replace(" ", "T");
}
const toInstant = (value: string) => new Date(`${value}:00+05:30`).toISOString();
const labelClass = "block space-y-1 text-sm font-semibold text-slate-700";

export function CreateInterviewForm({ campaignId, ...props }: EditorProps & { campaignId: string }) {
  const [title, setTitle] = useState(""), [date, setDate] = useState(""), [venue, setVenue] = useState(""), [url, setUrl] = useState(""), [panel, setPanel] = useState("");
  return <ActionForm {...props} title="Create interview session" submitLabel="Create session" action={() => ({ action: "create_session", campaignId, title, date: toInstant(date), venue, meetingUrl: url, panelMembers: panel.split(",").map(name => name.trim()).filter(Boolean) })}>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>Session title<input autoFocus required minLength={3} maxLength={255} className={inputClass} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className={labelClass}>Date and start time (Sri Lanka)<input required type="datetime-local" className={inputClass} value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className={labelClass}>Venue<input required minLength={3} maxLength={1000} className={inputClass} value={venue} onChange={e => setVenue(e.target.value)} /></label>
      <label className={labelClass}>Meeting URL (optional)<input type="url" className={inputClass} value={url} onChange={e => setUrl(e.target.value)} /></label>
    </div>
    <label className={labelClass}>Panel members<input required maxLength={2000} placeholder="Names separated by commas" className={inputClass} value={panel} onChange={e => setPanel(e.target.value)} /></label>
    <p className="text-sm text-slate-500">Create the session, then choose candidates and review their slots before queuing invitations.</p>
  </ActionForm>;
}

export function AssignInterviewForm({ interviewId, start, candidates, ...props }: EditorProps & { interviewId: string; start: string; candidates: CandidateOption[] }) {
  const [selected, setSelected] = useState<string[]>([]), [search, setSearch] = useState(""), [time, setTime] = useState(sriLankaInputTime(start));
  const visible = candidates.filter(candidate => `${candidate.studentName} ${candidate.email} ${candidate.reference} ${candidate.utNumber}`.toLowerCase().includes(search.toLowerCase()));
  return <ActionForm {...props} title="Assign interview candidates" submitLabel={`Assign ${selected.length} & queue invitations`} disabled={!selected.length} action={() => ({ action: "assign_candidates", interviewId, studentIds: selected, startTime: toInstant(time) })}>
    <label className={labelClass}>First slot (Sri Lanka)<input required type="datetime-local" value={time} onChange={e => setTime(e.target.value)} className={inputClass} /></label>
    <label className={labelClass}>Find candidates<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, email, reference or UT number" className={inputClass} /></label>
    <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
      {!visible.length && <p className="p-4 text-sm text-slate-500">No unassigned candidates match this intake and search.</p>}
      {visible.map(candidate => <label key={candidate.studentId} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-slate-50">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={selected.includes(candidate.studentId)} onChange={e => setSelected(ids => e.target.checked ? [...ids, candidate.studentId] : ids.filter(id => id !== candidate.studentId))} />
        <span className="min-w-0 break-words text-sm"><span className="block font-semibold">{candidate.studentName}</span><span className="text-slate-500">{candidate.reference} · {candidate.email}{candidate.utNumber && ` · ${candidate.utNumber}`}</span></span>
      </label>)}
    </div>
    <p className="text-sm text-slate-600">{selected.length} selected. Each slot is 30 minutes, in selection order. Invitations enter the email queue when you save.</p>
    {!!selected.length && time && <ol className="max-h-40 overflow-y-auto space-y-1 text-sm text-slate-600">{selected.map((id, index) => <li key={id}>{candidates.find(c => c.studentId === id)?.studentName} — {new Date(Date.parse(`${time}:00+05:30`) + index * 30 * 60000).toLocaleString("en-GB", { timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short" })}</li>)}</ol>}
  </ActionForm>;
}

export function CreateDecisionForm({ campaignId, candidates, ...props }: EditorProps & { campaignId: string; candidates: CandidateOption[] }) {
  const [studentId, setStudentId] = useState(""), [search, setSearch] = useState(""), [rank, setRank] = useState(""), [score, setScore] = useState(""), [notes, setNotes] = useState("");
  const visible = candidates.filter(candidate => candidate.studentId === studentId || `${candidate.studentName} ${candidate.reference} ${candidate.utNumber}`.toLowerCase().includes(search.toLowerCase()));
  return <ActionForm {...props} title="Create draft decision" submitLabel="Save draft decision" disabled={!studentId} action={() => ({ action: "update_decision", campaignId, studentId, finalStatus: "pending_decision", expectedDecisionId: null, rank: rank ? Number(rank) : undefined, compositeScore: score !== "" ? Number(score) : undefined, notes })}>
    <label className={labelClass}>Find candidate<input type="search" className={inputClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, reference or UT number" /></label>
    <label className={labelClass}>Candidate<select required className={inputClass} value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">Choose a candidate</option>{visible.map(candidate => <option key={candidate.studentId} value={candidate.studentId}>{candidate.studentName} · {candidate.reference}{candidate.utNumber && ` · ${candidate.utNumber}`}</option>)}</select></label>
    {!candidates.length && <p className="text-sm text-slate-500">All available candidates in this intake already have a decision.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>Rank (optional)<input type="number" min={1} max={100000} step={1} className={inputClass} value={rank} onChange={e => setRank(e.target.value)} /></label>
      <label className={labelClass}>Composite score (optional)<input type="number" min={0} max={1000} step="any" className={inputClass} value={score} onChange={e => setScore(e.target.value)} /></label>
    </div>
    <label className={labelClass}>Decision notes (optional)<textarea rows={3} maxLength={10000} className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <p className="text-sm text-slate-600">Saved as pending decision. Review the candidate and choose an outcome in the table, then queue result emails separately.</p>
  </ActionForm>;
}

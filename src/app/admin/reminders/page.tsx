"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, Check, CheckCircle2, Eye, Mail, RefreshCw, Search, Users } from "lucide-react";
import { useLiveData, inputClass, buttonClass, panelClass, Notice } from "@/components/live-data";
import { submitRequest } from "@/lib/client/submit";
import { readJson, responseError } from "@/lib/client/api";
import { reminderCopy, reminderKinds, renderReminderText, type ReminderKind } from "@/lib/reminders/templates";
import type { ReminderCandidate } from "@/lib/reminders/eligibility";
import ReminderEmailPreview from "@/components/reminder-email-preview";

type Recipient = ReminderCandidate & { token: string; canQueue: boolean; reason: string; lastStatus: string | null; lastReminderAt: string | null; actionUrl: string };
export default function RemindersPage() {
    const [kind, setKind] = useState<ReminderKind>("application_pending");
    const [campaignId, setCampaignId] = useState("");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<string[]>([]);
    const [previewId, setPreviewId] = useState("");
    const [previewOpen, setPreviewOpen] = useState(false);
    const [page, setPage] = useState(0);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [failure, setFailure] = useState("");
    const [drafts, setDrafts] = useState(() => Object.fromEntries(reminderKinds.map(value => [value, { subject: reminderCopy[value].subject, body: reminderCopy[value].body, actionUrl: "" }])) as Record<ReminderKind, { subject: string; body: string; actionUrl: string }>);
    const { data, error, reload, loading } = useLiveData(`/api/admin/reminders?kind=${kind}&campaignId=${encodeURIComponent(campaignId)}`, 0);
    useEffect(() => { setSelected([]); setPreviewId(""); setPreviewOpen(false); setPage(0); }, [kind, campaignId, data?.expiresAt]);
    useEffect(() => { setPage(0); }, [search]);
    const recipients: Recipient[] = data?.recipients || [];
    const visible = recipients.filter(row => `${row.name} ${row.email} ${row.reference} ${row.workshop}`.toLowerCase().includes(search.toLowerCase()));
    const rows = visible.slice(page * 25, (page + 1) * 25);
    const selectable = visible.filter(row => row.canQueue);
    const hasAvailableRecipients = recipients.some(row => row.canQueue);
    const chosen = recipients.filter(row => selected.includes(row.id));
    const preview = recipients.find(row => row.id === previewId) || chosen[0] || visible[0];
    const draft = drafts[kind];
    const openPreview = (id: string) => {
        setPreviewId(id);
        setPreviewOpen(true);
    };
    const updateDraft = (field: "subject" | "body" | "actionUrl", value: string) => setDrafts(current => ({ ...current, [kind]: { ...current[kind], [field]: value } }));
    const queue = async () => {
        if (!data || !chosen.length || busy) return;
        setBusy(true); setFailure(""); setMessage("");
        try {
            const response = await submitRequest("/api/admin/reminders", { kind, campaignId: campaignId || undefined, expiresAt: data.expiresAt, recipients: chosen.map(row => ({ id: row.id, token: row.token })), ...draft });
            const result = await readJson(response);
            if (!response.ok || result.success !== true) throw responseError(response, result);
            setMessage(result.message); setSelected([]); await reload();
        } catch (e: any) { setFailure(e.message || "Could not confirm the reminder batch. Refresh recipients before trying again."); }
        finally { setBusy(false); }
    };
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Admissions follow-up</p><h1 className="mt-1 text-2xl font-extrabold">Student reminders</h1><p className="mt-2 text-sm text-slate-500">Reach students who are waiting at the next admission step.</p></div>
                <Link href="/admin/email" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300"><Mail className="h-4 w-4" />Email delivery activity<ArrowRight className="h-4 w-4" /></Link>
            </div>
            <Notice error>{failure || error}</Notice><Notice>{message}</Notice>
            <section aria-labelledby="missing-step-heading" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="missing-step-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">1</span>Filter by missing step</h2>
                    <p className="text-xs text-slate-500">Click a group to see its students</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                    {reminderKinds.map((value, index) => (
                        <button key={value} type="button" aria-pressed={kind === value} aria-controls="reminder-recipients" aria-label={`Filter: ${reminderCopy[value].title}`} disabled={busy}
                            onClick={() => { setKind(value); setSearch(""); }}
                            className={`flex flex-col rounded-2xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${kind === value ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"}`}>
                            <span className="flex w-full items-center justify-between gap-3">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{["Registration → Application", "Application → Workshop", "Booking → Attendance"][index]}</span>
                                {kind === value && <Check className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />}
                            </span>
                            <span className="mt-3 flex items-baseline gap-2"><span className="text-3xl font-extrabold text-slate-900">{data?.counts[value] ?? "…"}</span><span className="text-xs text-slate-500">{data?.counts[value] === 1 ? "student" : "students"}</span></span>
                            <span className="mt-1 block text-sm font-bold text-slate-900">{reminderCopy[value].title}</span>
                            <span className="mt-1 block flex-1 text-xs leading-relaxed text-slate-500">{reminderCopy[value].description}</span>
                            <span className={`mt-4 inline-flex items-center gap-1 text-xs font-semibold ${kind === value ? "text-blue-700" : "text-slate-600"}`}>{kind === value ? "Showing this group" : "View students"}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
                        </button>
                    ))}
                </div>
            </section>
            <section id="reminder-recipients" className={panelClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><h2 className="flex items-center gap-2 text-sm font-bold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">2</span>Choose recipients</h2><p className="mt-2 text-xs text-slate-500">Showing: <span className="font-semibold text-slate-700">{reminderCopy[kind].title}</span></p></div>
                    <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700" aria-live="polite">{selected.length} selected</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
                    <label className="min-w-0 text-xs font-semibold">Intake<select disabled={busy} className={`${inputClass} mt-1`} value={campaignId} onChange={e => setCampaignId(e.target.value)}><option value="">All active intakes</option>{data?.campaigns.map((campaign: any) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label>
                    <label className="min-w-0 text-xs font-semibold">Search students<span className="relative mt-1 block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className={`${inputClass} pl-9`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, email or reference" /></span></label>
                    <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" disabled={busy || loading} onClick={reload}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
                </div>
                <details className="text-xs text-slate-500"><summary className="cursor-pointer font-medium">How students are matched</summary><p className="mt-2 leading-relaxed">Cancelled registrations, rejected/withdrawn applications and completed steps are excluded. Existing reminders and a 24-hour sending gap prevent repeat emails.</p></details>
                {kind === "workshop_missed" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Only explicit Absent records from finished workshops are included. {data?.attendanceReview || 0} ended booking(s) still need attendance review. <Link href="/admin/attendance" className="font-semibold underline">Review attendance →</Link></div>}
                {data?.total > 500 && <Notice>Showing the first 500 of {data.total} matching recipients. Select an intake to narrow the list.</Notice>}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs"><span className="text-slate-500">{visible.length} matching · <span className="font-semibold text-slate-700">{selectable.length} ready to remind</span></span>{selectable.length > 0 && <button type="button" disabled={busy} className="font-semibold text-blue-700 hover:underline disabled:opacity-50" onClick={() => setSelected(selectable.every(row => selected.includes(row.id)) ? [] : selectable.map(row => row.id))}>{selectable.every(row => selected.includes(row.id)) ? "Clear selection" : `Select all ${selectable.length}`}</button>}</div>
                {visible.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500"><tr>{["Select", "Student", "Intake / reference", kind === "workshop_missed" ? "Workshop / reminder status" : "Reminder status", ""].map((label, index) => <th key={index} className="px-3 py-3 font-semibold">{label || <span className="sr-only">Email preview</span>}</th>)}</tr></thead>
                        <tbody>{rows.map(row => <tr key={row.id} className={`border-t border-slate-100 ${selected.includes(row.id) ? "bg-blue-50/60" : "hover:bg-slate-50/70"}`}>
                            <td className="px-3 py-4"><input aria-label={`Select ${row.name}`} type="checkbox" className="h-4 w-4 rounded accent-blue-600" disabled={busy || !row.canQueue} checked={selected.includes(row.id)} onChange={e => setSelected(current => e.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} /></td>
                            <td className="px-3 py-4"><span className="text-sm font-semibold text-slate-900">{row.name}</span><span className="mt-1 block text-slate-500">{row.email}</span></td>
                            <td className="max-w-52 px-3 py-4"><span className="text-slate-700">{row.intake}</span><span className="mt-1 block font-mono text-[11px] text-slate-500">{row.reference}</span></td>
                            <td className="max-w-xs px-3 py-4">{row.workshop && <p className="mb-2 font-semibold">{row.workshop}<br /><span className="font-normal text-slate-500">{row.date} (Sri Lanka)</span></p>}<span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${row.canQueue ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{row.canQueue ? "Ready to remind" : "On hold"}</span>{row.lastStatus && <p className="mt-1.5 text-[11px] text-slate-500">Last: {row.lastStatus}{row.lastReminderAt && ` · ${new Date(row.lastReminderAt).toLocaleString()}`}</p>}{row.reason && <p className="mt-1.5 leading-relaxed text-amber-700">{row.reason}</p>}</td>
                            <td className="px-3 py-4"><button type="button" aria-haspopup="dialog" aria-controls="reminder-email-preview-modal" onClick={() => openPreview(row.id)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"><Eye className="h-3.5 w-3.5" aria-hidden="true" />Preview</button></td>
                        </tr>)}</tbody>
                    </table>
                </div>}
                {!visible.length && <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center"><span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-400">{loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : search ? <Search className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</span><p className="text-sm font-semibold text-slate-700">{loading ? "Checking student progress…" : search ? "No students match your search" : "No students waiting at this step"}</p><p className="mt-1 text-xs text-slate-500">{loading ? "Finding the next incomplete step for this intake." : search ? "Try another name, email or reference." : "Choose another missing step or intake to check more students."}</p>{search && <button type="button" className="mt-3 text-xs font-semibold text-blue-700 underline" onClick={() => setSearch("")}>Clear search</button>}</div>}
                {visible.length > 25 && <div className="flex items-center justify-between text-xs"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)} className="font-semibold disabled:opacity-40">← Previous</button><span>Page {page + 1} of {Math.ceil(visible.length / 25)}</span><button type="button" disabled={(page + 1) * 25 >= visible.length} onClick={() => setPage(value => value + 1)} className="font-semibold disabled:opacity-40">Next →</button></div>}
            </section>
            {(visible.length > 0 || chosen.length > 0) && <div>
                <section className={panelClass}>
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-bold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">3</span>Review & queue reminder</h2><p className="mt-2 text-xs text-slate-500">One message, personalized for each selected student.</p></div><button type="button" aria-haspopup="dialog" aria-controls="reminder-email-preview-modal" disabled={!preview} onClick={() => { if (preview) openPreview(preview.id); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"><Eye className="h-4 w-4" aria-hidden="true" />Preview email</button></div>
                    <label className="block text-xs font-semibold">Email subject<input maxLength={200} className={`${inputClass} mt-1`} value={draft.subject} onChange={e => updateDraft("subject", e.target.value)} disabled={busy} /></label>
                    <label className="block text-xs font-semibold">Message<textarea rows={8} maxLength={6000} className={`${inputClass} mt-1 leading-relaxed`} value={draft.body} onChange={e => updateDraft("body", e.target.value)} disabled={busy} /></label>
                    <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Personalization & form link</summary><div className="mt-3 space-y-3"><p className="text-xs leading-relaxed text-slate-500">Personalize with {"{{name}}, {{intake}}, {{reference}}, {{workshop}}, {{date}}, {{venue}}"}.</p>
                    <label className="block text-xs font-semibold">Action link override (optional)<input type="url" maxLength={2048} className={`${inputClass} mt-1`} placeholder="https://…" value={draft.actionUrl} onChange={e => updateDraft("actionUrl", e.target.value)} disabled={busy} /></label>
                    <p className="text-xs leading-relaxed text-slate-500">Uses the intake’s active application or workshop RSVP form when available. Without an active form, students can reply for help. Add a link here to use another form.</p></div></details>
                    {data?.workerStale && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Queued emails need dispatch. Open <Link href="/admin/email" className="font-semibold underline">Email Center</Link> to process pending emails, or start the notification worker.</div>}
                    <div className="border-t border-slate-100 pt-4"><p className="mb-3 flex items-center gap-2 text-xs text-slate-500"><Users className="h-4 w-4 shrink-0" />{selected.length ? `${selected.length} student${selected.length === 1 ? "" : "s"} selected` : hasAvailableRecipients ? "Select students from the list above to continue" : "All matches are on hold. Check their reminder status above."}</p><button type="button" className={`${buttonClass} w-full gap-2 py-2.5`} onClick={queue} disabled={busy || !selected.length || !draft.subject.trim() || !draft.body.trim()}><BellRing className="h-4 w-4" />{busy ? "Saving reminders…" : selected.length ? `Queue ${selected.length} reminder${selected.length === 1 ? "" : "s"}` : hasAvailableRecipients ? "Select recipients to queue" : "No reminders ready to queue"}</button><p className="mt-3 text-xs leading-relaxed text-slate-500">Sender: {data?.sender === "gmail" ? "Gmail" : data?.sender === "smtp" ? "SMTP" : "checking"} · Delivery is tracked in Email Center. Queued does not mean sent.</p></div>
                </section>
            </div>}
            {preview && <ReminderEmailPreview open={previewOpen} onClose={() => setPreviewOpen(false)} recipient={preview} subject={renderReminderText(draft.subject, preview)} body={renderReminderText(draft.body, preview)} actionLabel={kind === "application_pending" ? "Complete your application" : "Workshop booking"} actionUrl={draft.actionUrl || preview.actionUrl} />}
        </div>
    );
}

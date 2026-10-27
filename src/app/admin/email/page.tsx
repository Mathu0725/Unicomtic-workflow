"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useLiveData, inputClass, buttonClass, panelClass, Notice } from "@/components/live-data";
import CandidateEmailComposer from "@/components/candidate-email-composer";
import EmailDeliveryActivity from "@/components/email-delivery-activity";

export default function EmailCenterPage() {
  const connection = useLiveData("/api/admin/integrations", 30000), limits = useLiveData("/api/admin/email/limits", 5000);
  const [smtp, setSmtp] = useState<any>({ host: "smtp.gmail.com", port: 587, secure: false, username: "", password: "", from_name: "Unicom TIC Admissions", from_email: "" });
  const [initialized, setInitialized] = useState(false), [recipient, setRecipient] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0), [dailyLimit, setDailyLimit] = useState(""), [limitInitialized, setLimitInitialized] = useState(false);
  useEffect(() => { if (connection.data && !initialized) { if (connection.data.smtp) setSmtp({ ...connection.data.smtp, password: "" }); setRecipient(connection.data.settings.admin_notification_email || connection.data.google?.email || ""); setInitialized(true); } }, [connection.data, initialized]);
  useEffect(() => { if (limits.data && !limitInitialized) { setDailyLimit(String(limits.data.budget.limit)); setLimitInitialized(true); } }, [limits.data, limitInitialized]);
  const reload = async () => { setRevision(value => value + 1); await limits.reload(); };
  const run = async (url: string, body: any) => { setBusy(true); setError(""); setMessage(""); try { const data = await api(url, body); setMessage(data.message); await Promise.all([reload(), connection.reload()]); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const budget = limits.data?.budget;
  return <div className="space-y-6">
    <div><p className="text-xs font-bold uppercase text-blue-600">Communications</p><h1 className="text-2xl font-extrabold">Email Center</h1><p className="mt-2 text-sm text-slate-500">Send candidate messages and track delivery. <Link className="font-semibold text-blue-600" href="/admin/google-integrations">Manage Google connection</Link><span className="mx-2">·</span><Link className="font-semibold text-blue-600" href="/admin/email/templates">Edit email templates</Link></p></div>
    <Notice error>{error || limits.error || connection.error}</Notice><Notice>{message}</Notice>
    <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold">Daily sending allowance</h2><p className="mt-1 break-all text-xs text-slate-500">{budget?.sender || "Checking sender…"} · {connection.data?.settings.email_provider || "…"} · rolling 24 hours</p></div><form onSubmit={event => { event.preventDefault(); void run("/api/admin/email/limits", { limit: Number(dailyLimit) }); }} className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold">Daily limit<input required type="number" min={1} max={500} className={`${inputClass} mt-1 !w-24 block`} value={dailyLimit} onChange={event => setDailyLimit(event.target.value)} /></label><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy || !budget}>Save limit</button></form></div>
      <div className="grid grid-cols-3 gap-3">{[["Used / reserved", budget?.used], ["Remaining", budget?.remaining], ["Maximum", budget?.limit]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{value ?? "—"}</p></div>)}</div>
      {budget && !budget.canSend && <Notice>{budget.paused ? budget.pauseReason : "Daily allowance reached. Additional messages remain queued."} {budget.nextAvailableAt && <>Next available: {new Date(budget.nextAvailableAt).toLocaleString()}.</>}</Notice>}
      <p className="text-xs leading-relaxed text-slate-500">Up to 500 emails per 24 hours; you can set a lower cap. Confirmations, admin alerts, reminders and test messages share this allowance. Unconfirmed sends reserve a place. Mail sent outside this portal also uses Google's quota; a provider daily-limit error pauses sending. <a className="text-blue-700 underline" href="https://support.google.com/mail/answer/22839" target="_blank" rel="noreferrer">Gmail limits</a></p>
    </section>
    <CandidateEmailComposer onQueued={reload} />
    <EmailDeliveryActivity revision={revision} run={run} busy={busy} />
    <details className={panelClass}><summary className="cursor-pointer font-bold">Sender settings & connection tests</summary>
      <div className="grid gap-6 lg:grid-cols-2"><section className="space-y-3"><h2 className="font-bold">SMTP configuration</h2><p className="text-xs text-slate-500">Personal Gmail: smtp.gmail.com, port 587, STARTTLS and a Google App Password. Connected Gmail uses the API.</p>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void run("/api/admin/integrations", { action: "save_smtp", ...smtp, port: Number(smtp.port) }); }}>
          <div className="grid gap-3 sm:grid-cols-2">{[["host", "SMTP host"], ["port", "Port"], ["username", "SMTP username"], ["password", smtp.passwordSaved ? "New app password (blank keeps saved)" : "App password"], ["from_name", "Sender name"], ["from_email", "Sender email"]].map(([key, label]) => <label key={key} className="text-xs font-semibold">{label}<input required={key !== "password" || !smtp.passwordSaved} className={`${inputClass} mt-1`} type={key === "password" ? "password" : key === "port" ? "number" : key === "from_email" ? "email" : "text"} autoComplete={key === "password" ? "new-password" : undefined} value={smtp[key]} onChange={event => setSmtp({ ...smtp, [key]: event.target.value })} /></label>)}</div>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={smtp.secure} onChange={event => setSmtp({ ...smtp, secure: event.target.checked })} />Implicit TLS (465); leave off for STARTTLS (587).</label>
          <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={busy}>Save & use SMTP</button><button type="button" className="text-sm text-blue-600" disabled={busy || !connection.data?.smtp} onClick={() => void run("/api/admin/email", { action: "verify_saved" })}>Verify saved SMTP</button></div>
        </form></section>
        <section className="space-y-3"><h2 className="font-bold">Test selected sender</h2><form className="space-y-3" onSubmit={event => { event.preventDefault(); void run("/api/admin/notifications", { action: "test_email", to: recipient }); }}><label className="block text-sm">Test recipient<input required type="email" className={`${inputClass} mt-1`} value={recipient} onChange={event => setRecipient(event.target.value)} /></label><button className={buttonClass} disabled={busy}>Send test notification</button></form><p className="text-xs text-slate-500">Sent means provider accepted; inbox delivery and reading are not confirmed.</p><button className="text-sm font-semibold text-blue-600" disabled={busy} onClick={() => void run("/api/admin/notifications", { action: "process" })}>Process pending jobs now</button><Link href="/admin/diagnostics" className="block text-sm text-blue-700 underline">System health & recovery</Link></section></div>
    </details>
  </div>;
}

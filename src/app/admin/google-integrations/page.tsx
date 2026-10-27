"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { api, useLiveData, inputClass, buttonClass, panelClass, Notice } from "@/components/live-data";
import { oauthMessage } from "@/lib/client/oauth-errors";
import GoogleDriveConnection from "@/components/google-drive-connection";
export default function GoogleIntegrationsPage() {
  const { data, error, reload } = useLiveData("/api/admin/integrations", 30000);
  const [settings, setSettings] = useState<any>(null), [message, setMessage] = useState(""), [failure, setFailure] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { if (data && !settings) setSettings(data.settings); }, [data, settings]);
  useEffect(() => { const query = new URLSearchParams(window.location.search); setFailure(oauthMessage(window.location.search)); if (query.get("connected")) setMessage(query.get("connected") === "drive" ? "Google Drive connected. Create or check the student documents folder below, then add upload questions in Form Builder." : "Google account connected. Create a spreadsheet or save your existing sheet links below. Release blocked jobs in Email Center after verifying access."); }, []);
  const run = async (body: any) => { setBusy(true); setFailure(""); setMessage(""); try { const result = await api("/api/admin/integrations", body); setMessage(result.message); if (result.sheetId) setSettings((s: any) => ({ ...s, registration_sheet_id: result.sheetId, application_sheet_id: result.sheetId })); await reload(); } catch (e: any) { setFailure(e.message); } finally { setBusy(false); } };
  return <div className="space-y-6 max-w-4xl"><div><p className="text-xs font-bold uppercase text-blue-600">Connections</p><h1 className="text-2xl font-extrabold">Google Drive, Sheets &amp; Gmail</h1><p className="text-sm text-slate-500 mt-2">Connect the admissions Google account to save student documents, sync form responses and send notifications.</p></div>
    <Notice error>{error || failure}</Notice><Notice>{message}</Notice>
    <section className={panelClass}><h2 className="text-lg font-bold">1. Connect Google Sheets &amp; Gmail</h2><p className="text-sm">{data ? data.google ? `Connected: ${data.google.email}` : "No Google account connected." : "Checking saved Google connection…"}</p>
      <p className="text-sm text-slate-500">This connection is for spreadsheet sync and notifications. Use your staff email and password to sign in to the portal.</p>
      {data && !data.oauthConfigured && <Notice>Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET using docs/GOOGLE_ADMISSIONS_SETUP.md, then restart the server.</Notice>}
      <p className="text-xs text-slate-500 break-all">Google Cloud authorized redirect URI: <code>{data?.redirectUri || "Loading…"}</code></p>
      <div className="flex flex-wrap gap-3"><a className={`${buttonClass} gap-2`} href="/api/auth/google"><Image src="/google-sign-in.svg" width={24} height={24} alt="" aria-hidden="true" />{data?.google ? "Reconnect Google Sheets & Gmail" : "Connect Google Sheets & Gmail"}</a>{data?.google && <button disabled={busy} className="text-sm text-red-600" onClick={() => run({ action: "disconnect" })}>Disconnect</button>}</div></section>
    <GoogleDriveConnection />
    {settings && <section className={panelClass}><h2 className="text-lg font-bold">2. Set your spreadsheets</h2><p className="text-sm text-slate-500">Create one spreadsheet with separate Registrations and Applications tabs, or paste existing URLs. References are updated to prevent duplicate rows.</p>
      <button disabled={busy || !data?.google} className={buttonClass} onClick={() => run({ action: "create_sheet" })}>Create admissions spreadsheet</button>
      {settings.registration_sheet_id && <a className="block text-sm text-blue-700 underline" href={`https://docs.google.com/spreadsheets/d/${settings.registration_sheet_id.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || settings.registration_sheet_id}/edit`} target="_blank" rel="noreferrer">Open admissions registrations spreadsheet</a>}
      {data?.sheetOverrides?.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">These forms use their own sheet instead of the admissions spreadsheet:</p>{data.sheetOverrides.map((form: any) => <p key={form.formId}><Link className="underline" href={`/admin/forms/${form.formId}/builder`}>{form.title}</Link> → {form.sheetName}. Turn off the separate-sheet setting in Builder to use the admissions spreadsheet.</p>)}</div>}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); run({ action: "save", ...settings }); }}>
        {[["registration_sheet_id", "Registrations spreadsheet URL / ID"], ["application_sheet_id", "Applications spreadsheet URL / ID"], ["admin_notification_email", "Notify admissions at this email"]].map(([key, label]) => <label className="block text-sm font-semibold" key={key}>{label}<input className={`${inputClass} mt-1`} type={key.includes("email") ? "email" : "text"} value={settings[key] || ""} onChange={e => setSettings({ ...settings, [key]: e.target.value })} /></label>)}
        <label className="block text-sm font-semibold">Send notifications using<select className={`${inputClass} mt-1`} value={settings.email_provider} onChange={e => setSettings({ ...settings, email_provider: e.target.value })}><option value="gmail">Connected Gmail account</option><option value="smtp">Saved SMTP account</option></select></label>
        <button className={buttonClass} disabled={busy}>Save connections</button>
      </form></section>}
    <section className={panelClass}><h2 className="text-lg font-bold">3. Send a test and inspect the queue</h2><p className="text-sm">Open Email Center to configure SMTP, send a test notification, and inspect sent, failed, pending or uncertain jobs with their provider IDs.</p><Link href="/admin/email" className="text-blue-600 font-semibold text-sm">Open Email Center →</Link><p className="text-xs text-slate-500">Storage: {data?.storageMode || "checking"}. Run the protected queue worker every minute for retries and workshop reminders.</p></section>
  </div>;
}

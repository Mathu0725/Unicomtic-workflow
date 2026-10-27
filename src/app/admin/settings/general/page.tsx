"use client";

import { useEffect, useState } from "react";
import { api, useLiveData, Notice, panelClass, inputClass, buttonClass } from "@/components/live-data";
import type { PortalSettings } from "@/lib/settings";

export default function GeneralSettingsPage() {
  const live = useLiveData("/api/admin/settings", 0);
  const [draft, setDraft] = useState<PortalSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (live.data && !draft) setDraft(live.data.settings);
  }, [live.data, draft]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/admin/settings", draft);
      setDraft(result.settings);
      setMessage("Configuration saved to admissions storage.");
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    if (draft && !confirm("Discard unsaved edits and reload saved settings?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/admin/settings");
      setDraft(result.settings);
      await live.reload();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">General &amp; policy</h1>
        <p className="mt-1 text-sm text-slate-500">Update the admissions contact and the terms shown to applicants.</p>
      </header>
      <Notice error>{error || live.error}</Notice>
      <Notice>{message}</Notice>
      {!draft && !live.error && <p role="status">Loading saved configuration…</p>}
      <button type="button" className="text-sm text-blue-700 underline" disabled={busy} onClick={reload}>Reload saved settings</button>
      {draft && (
        <form onSubmit={save} className="space-y-6">
          <section className={panelClass}>
            <h2 className="font-bold">Terms &amp; Conditions</h2>
            <p className="text-sm text-slate-600">Use a new version identifier whenever the policy text changes. Previous acceptances retain their recorded version.</p>
            <label className="block text-sm">Policy version
              <input required maxLength={64} className={inputClass} value={draft.termsVersion} onChange={event => setDraft({ ...draft, termsVersion: event.target.value })} />
            </label>
            <label className="block text-sm">Declaration
              <textarea required minLength={30} maxLength={20000} rows={6} className={inputClass} value={draft.termsContent} onChange={event => setDraft({ ...draft, termsContent: event.target.value })} />
            </label>
          </section>
          <section className={panelClass}>
            <h2 className="font-bold">Admissions contact</h2>
            {([["institutionName", "Institution name"], ["contactEmail", "Contact email"], ["phone", "Contact phone"]] as const).map(([key, label]) => (
              <label className="block text-sm" key={key}>{label}
                <input className={inputClass} type={key === "contactEmail" ? "email" : "text"} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
              </label>
            ))}
          </section>
          <button className={buttonClass} disabled={busy}>{busy ? "Saving…" : "Save configuration"}</button>
        </form>
      )}
    </div>
  );
}

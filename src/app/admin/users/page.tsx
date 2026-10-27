"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, Shield, UserPlus, X } from "lucide-react";
import { api, useLiveData, Notice, panelClass, inputClass, buttonClass } from "@/components/live-data";
import { ApiError } from "@/lib/client/api";
import { staffRoleLabel, staffRoleOptions, type ManagedStaffRole } from "@/lib/security/staff-roles";

type Account = { id: string; name: string; email: string; role: string; source: string; createdAt: string | null };
const emptyDraft = () => ({ name: "", email: "", password: "", confirmPassword: "", role: "entrance_staff" as ManagedStaffRole });

export default function AdminUsersPage() {
  const { data, error, reload } = useLiveData("/api/admin/users", 30000);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (creating) nameInput.current?.focus(); }, [creating]);

  const close = () => {
    setCreating(false);
    setDraft(emptyDraft());
    setFailure("");
    setFields({});
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFailure("");
    setFields({});
    setMessage("");
    if (draft.password !== draft.confirmPassword) {
      setFields({ confirmPassword: ["Passwords do not match."] });
      return;
    }
    setBusy(true);
    try {
      const { confirmPassword, ...input } = draft;
      const result = await api("/api/admin/users", input);
      close();
      setMessage(`${result.account.name} (${result.account.email}) can now sign in with their email and password.`);
      await reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not create this staff user.");
      if (error instanceof ApiError && error.fields) setFields(error.fields);
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (key: string) => fields[key]?.length ? <p id={`staff-${key}-error`} className="mt-1 text-xs text-red-700">{fields[key].join(" ")}</p> : null;
  const fieldProps = (key: string, hint?: string) => ({ "aria-invalid": Boolean(fields[key]?.length), "aria-describedby": [hint, fields[key]?.length ? `staff-${key}-error` : ""].filter(Boolean).join(" ") || undefined });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff accounts &amp; access</h1>
          <p className="mt-1 text-sm text-slate-500">Create staff sign-ins and assign access for the admissions team.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => reload()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh</button>
          {data?.managementAvailable && !creating && <button type="button" className={`${buttonClass} gap-2`} aria-expanded={creating} aria-controls="create-staff-user" onClick={() => { setMessage(""); setCreating(true); }}><Plus className="h-4 w-4" aria-hidden="true" />Create user</button>}
        </div>
      </header>
      <Notice error>{error}</Notice>
      <Notice>{message}</Notice>

      {creating && data?.managementAvailable && (
        <section id="create-staff-user" aria-labelledby="create-staff-title" className={panelClass}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><UserPlus className="h-5 w-5" aria-hidden="true" /></span><div><h2 id="create-staff-title" className="font-bold text-slate-900">Create staff user</h2><p className="mt-1 text-sm text-slate-500">After creating the account, share the login details securely with the staff member.</p></div></div>
            <button type="button" onClick={close} disabled={busy} aria-label="Cancel user creation" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          <Notice error>{failure}</Notice>
          <form onSubmit={create}>
            <fieldset disabled={busy} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">Full name
                  <input ref={nameInput} required minLength={2} maxLength={100} autoComplete="off" className={`${inputClass} mt-1.5`} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} {...fieldProps("name")} />{fieldError("name")}
                </label>
                <label className="block text-sm font-medium">Staff email
                  <input required type="email" maxLength={254} autoComplete="off" className={`${inputClass} mt-1.5`} value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} {...fieldProps("email")} />{fieldError("email")}
                </label>
                <label className="block text-sm font-medium"><span id="staff-password-label">Password</span>
                  <input required type="password" aria-labelledby="staff-password-label" minLength={12} maxLength={128} autoComplete="new-password" className={`${inputClass} mt-1.5`} value={draft.password} onChange={event => setDraft({ ...draft, password: event.target.value })} {...fieldProps("password", "staff-password-hint")} /><span id="staff-password-hint" className="mt-1 block text-xs font-normal text-slate-500">Use 12–128 characters.</span>{fieldError("password")}
                </label>
                <label className="block text-sm font-medium">Confirm password
                  <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" className={`${inputClass} mt-1.5`} value={draft.confirmPassword} onChange={event => setDraft({ ...draft, confirmPassword: event.target.value })} {...fieldProps("confirmPassword")} />{fieldError("confirmPassword")}
                </label>
              </div>
              <label className="block text-sm font-medium"><span id="staff-role-label">Role</span>
                <select aria-labelledby="staff-role-label" className={`${inputClass} mt-1.5 block max-w-md`} value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as ManagedStaffRole })} {...fieldProps("role", "staff-role-hint")}>{staffRoleOptions.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select>
                <span id="staff-role-hint" className="mt-2 block text-xs font-normal text-slate-500">{staffRoleOptions.find(role => role.value === draft.role)?.description}</span>{fieldError("role")}
              </label>
              <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                <button type="submit" className={`${buttonClass} gap-2`}><UserPlus className="h-4 w-4" aria-hidden="true" />{busy ? "Creating user…" : "Create staff user"}</button>
                <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              </div>
            </fieldset>
          </form>
        </section>
      )}

      {data ? (
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-slate-900">Staff users <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{data.accounts.length}</span></h2><p className="text-xs text-slate-500">Signed in as {data.currentUser.email}</p></div>
          {!data.managementAvailable && <p className="text-sm text-slate-500">Only a Super Admin can create staff users.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b bg-slate-50 text-xs text-slate-500"><th scope="col" className="p-3">Staff member</th><th scope="col" className="p-3">Role</th><th scope="col" className="p-3">Access source</th><th scope="col" className="p-3">Created</th></tr></thead>
              <tbody>{data.accounts.map((account: Account) => <tr className="border-b border-slate-100 last:border-0" key={account.id}><td className="p-3"><p className="font-medium text-slate-900">{account.name}</p><p className="mt-1 text-xs text-slate-500">{account.email}</p></td><td className="p-3"><span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"><Shield className="h-3 w-3" aria-hidden="true" />{staffRoleLabel(account.role)}</span></td><td className="p-3 text-xs text-slate-500">{account.source}</td><td className="p-3 text-xs text-slate-500">{account.createdAt ? new Date(account.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" }) : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : !error && <p role="status">Loading staff accounts…</p>}
    </div>
  );
}

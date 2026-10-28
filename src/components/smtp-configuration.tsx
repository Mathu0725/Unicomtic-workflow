"use client";
import { useEffect, useState } from "react";
import {
  api,
  useLiveData,
  inputClass,
  buttonClass,
  panelClass,
  Notice,
} from "./live-data";
import { pendingPayload, submitRequest } from "@/lib/client/submit";
import { readJson, responseError } from "@/lib/client/api";
import SubmissionRecovery from "./submission-recovery";
type Draft = {
  id?: string;
  updated_at?: string;
  passwordSaved?: boolean;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: "starttls" | "tls";
  from_name: string;
  from_email: string;
  reply_to: string;
  timeout_ms: number;
  daily_limit: number | null;
  is_active: boolean;
};
const empty = (): Draft => ({
  name: "",
  host: "smtp.gmail.com",
  port: 587,
  username: "",
  password: "",
  encryption: "starttls",
  from_name: "Unicom TIC Admissions",
  from_email: "",
  reply_to: "",
  timeout_ms: 10000,
  daily_limit: null,
  is_active: true,
});
export default function SmtpConfiguration({
  onChanged,
}: {
  onChanged: () => Promise<void>;
}) {
  const directory = useLiveData("/api/admin/email/accounts", 30000);
  const [draft, setDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [accountId, setAccountId] = useState(""),
    [recipient, setRecipient] = useState("");
  const [attemptId, setAttemptId] = useState(""),
    [unresolved, setUnresolved] = useState(false);
  useEffect(() => {
    setAttemptId(crypto.randomUUID());
    setUnresolved(
      pendingPayload("/api/admin/email/accounts/test") !== undefined,
    );
  }, []);
  const run = async (body: unknown) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await api("/api/admin/email/accounts", body);
      setMessage(data.message);
      if ((body as { action: string }).action === "save") setDraft(null);
      await directory.reload();
      await onChanged();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const test = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await submitRequest("/api/admin/email/accounts/test", {
        accountId,
        recipient,
        clientAttemptId: attemptId,
      });
      const data = await readJson(response);
      if (!response.ok || !data.success) throw responseError(response, data);
      setMessage(data.message);
      await onChanged();
      setAttemptId(crypto.randomUUID());
    } catch (error: any) {
      setError(error.message);
      setUnresolved(
        pendingPayload("/api/admin/email/accounts/test") !== undefined,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section id="smtp" className={`${panelClass} scroll-mt-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">SMTP Configuration</h2>
          <p className="mt-1 text-sm text-slate-500">
            Keep connected Gmail or add mail-server accounts. Adding an account
            leaves your current sender selected.
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || Boolean(draft)}
          onClick={() => setDraft(empty())}
        >
          Add SMTP account
        </button>
      </div>
      <Notice error>{error || directory.error}</Notice>
      <Notice>{message}</Notice>
      <SubmissionRecovery
        url="/api/admin/email/accounts/test"
        show={unresolved}
        onResolved={(data) => {
          setUnresolved(false);
          setMessage(data.message);
          setAttemptId(crypto.randomUUID());
          void onChanged();
        }}
      />
      <div className="space-y-3">
        {directory.data?.options.map((account: any) => (
          <div
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
          >
            <div>
              <p className="text-sm font-semibold">
                {account.name}
                {directory.data.defaultAccountId === account.id && (
                  <span className="ml-2 text-xs text-emerald-700">Default</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {account.provider} ·{" "}
                {account.active ? "Enabled" : "Inactive or credential required"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-semibold">
              <button
                type="button"
                disabled={
                  busy ||
                  !account.active ||
                  directory.data.defaultAccountId === account.id
                }
                className="text-blue-700 disabled:text-slate-400"
                onClick={() => void run({ action: "default", id: account.id })}
              >
                Set default
              </button>
              {directory.data.accounts.some(
                (item: any) => item.id === account.id,
              ) && (
                <button
                  type="button"
                  disabled={busy || Boolean(draft)}
                  className="text-blue-700"
                  onClick={() => {
                    const item = directory.data.accounts.find(
                      (item: any) => item.id === account.id,
                    );
                    setDraft({ ...empty(), ...item, password: "" });
                  }}
                >
                  Edit / enable / disable
                </button>
              )}
              {account.provider === "smtp" && account.id !== "legacy-smtp" && (
                <button
                  type="button"
                  disabled={busy || !account.active}
                  className="text-blue-700 disabled:text-slate-400"
                  onClick={() => void run({ action: "verify", id: account.id })}
                >
                  Verify connection
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {draft && (
        <form
          className="space-y-4 rounded-xl bg-slate-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const account = draft;
            void run({
              action: "save",
              id: account.id,
              expectedUpdatedAt: account.updated_at,
              account: {
                name: account.name,
                host: account.host,
                port: account.port,
                username: account.username,
                password: account.password,
                encryption: account.encryption,
                from_name: account.from_name,
                from_email: account.from_email,
                reply_to: account.reply_to,
                timeout_ms: account.timeout_ms,
                daily_limit: account.daily_limit,
                is_active: account.is_active,
              },
            });
          }}
        >
          <h3 className="font-bold">
            {draft.id ? "Edit SMTP account" : "New SMTP account"}
          </h3>
          <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
            {(
              [
                ["name", "Account name", "text"],
                ["host", "SMTP hostname", "text"],
                ["username", "SMTP username", "text"],
                [
                  "password",
                  draft.passwordSaved
                    ? "App password (saved · blank keeps it)"
                    : "App password",
                  "password",
                ],
                ["from_name", "From name", "text"],
                ["from_email", "From email", "email"],
                ["reply_to", "Reply-to email (optional)", "email"],
              ] as const
            ).map(([key, label, type]) => (
              <label className="text-xs font-semibold" key={key}>
                {label}
                <input
                  className={`${inputClass} mt-1`}
                  required={
                    key !== "reply_to" &&
                    (key !== "password" || !draft.passwordSaved)
                  }
                  type={type}
                  autoComplete={key === "password" ? "new-password" : "off"}
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                />
              </label>
            ))}
            <label className="text-xs font-semibold">
              Port
              <input
                className={`${inputClass} mt-1`}
                required
                type="number"
                min={1}
                max={65535}
                value={draft.port}
                onChange={(event) =>
                  setDraft({ ...draft, port: Number(event.target.value) })
                }
              />
            </label>
            <label className="text-xs font-semibold">
              Encryption
              <select
                className={`${inputClass} mt-1`}
                value={draft.encryption}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    encryption: event.target.value as Draft["encryption"],
                  })
                }
              >
                <option value="starttls">STARTTLS · usually port 587</option>
                <option value="tls">Implicit TLS · usually port 465</option>
              </select>
            </label>
            <label className="text-xs font-semibold">
              Connection timeout (ms)
              <input
                className={`${inputClass} mt-1`}
                required
                type="number"
                min={3000}
                max={20000}
                value={draft.timeout_ms}
                onChange={(event) =>
                  setDraft({ ...draft, timeout_ms: Number(event.target.value) })
                }
              />
            </label>
            <label className="text-xs font-semibold">
              Account daily limit (optional, 1–500)
              <input
                className={`${inputClass} mt-1`}
                type="number"
                min={1}
                max={500}
                value={draft.daily_limit ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    daily_limit: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(event) =>
                  setDraft({ ...draft, is_active: event.target.checked })
                }
              />
              Account enabled
            </label>
          </fieldset>
          <p className="text-xs text-slate-500">
            Passwords are encrypted on the server and never returned. Public
            SMTP servers with certificate-verified TLS are required. Gmail:
            smtp.gmail.com:587; Outlook: smtp.office365.com:587; both use
            STARTTLS.
          </p>
          <div className="flex gap-3">
            <button className={buttonClass} disabled={busy}>
              Save account
            </button>
            <button
              type="button"
              disabled={busy}
              className="text-sm text-slate-600"
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {directory.data?.accounts.map((account: any) => (
        <details
          key={account.id}
          className="rounded-xl border border-slate-200 p-3"
        >
          <summary className="cursor-pointer text-sm font-semibold">
            {account.name} · Health & recent errors
          </summary>
          <div className="mt-3 space-y-2 text-xs text-slate-600">
            <p>
              {account.budget.used} used / reserved of {account.budget.limit} ·{" "}
              {account.budget.remaining} remaining
            </p>
            <p>
              Connection test:{" "}
              {account.last_test
                ? `${account.last_test.message} (${new Date(account.last_test.at).toLocaleString()})`
                : "Not tested"}
            </p>
            <p>
              Created:{" "}
              {account.created_at
                ? new Date(account.created_at).toLocaleString()
                : "Legacy account"}{" "}
              · Updated:{" "}
              {account.updated_at
                ? new Date(account.updated_at).toLocaleString()
                : "—"}
            </p>
            {account.recentErrors.map((item: any) => (
              <p key={`${item.jobId}:${item.at}`}>
                {item.code}: {item.message}
              </p>
            ))}
          </div>
        </details>
      ))}
      <form onSubmit={test} className="grid items-end gap-3 md:grid-cols-3">
        <label className="text-xs font-semibold">
          Test sending account
          <select
            required
            className={`${inputClass} mt-1`}
            value={accountId}
            disabled={busy || unresolved}
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="">Choose account</option>
            {directory.data?.options.map((account: any) => (
              <option
                key={account.id}
                value={account.id}
                disabled={!account.active}
              >
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Explicit test recipient
          <input
            required
            type="email"
            className={`${inputClass} mt-1`}
            value={recipient}
            disabled={busy || unresolved}
            onChange={(event) => setRecipient(event.target.value)}
          />
        </label>
        <button
          className={buttonClass}
          disabled={busy || unresolved || !attemptId}
        >
          Queue test email
        </button>
      </form>
      <p className="text-xs text-slate-500">
        Connection verification does not send mail. Tests use the central queue
        and daily allowance.
      </p>
    </section>
  );
}

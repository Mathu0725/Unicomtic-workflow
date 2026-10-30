"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  useLiveData,
  inputClass,
  buttonClass,
  panelClass,
  Notice,
} from "@/components/live-data";
import CandidateEmailComposer from "@/components/candidate-email-composer";
import EmailDeliveryActivity from "@/components/email-delivery-activity";
import SmtpConfiguration from "@/components/smtp-configuration";

export default function EmailCenterPage() {
  const limits = useLiveData("/api/admin/email/limits", 5000);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [dailyLimit, setDailyLimit] = useState(""),
    [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (limits.data && !initialized) {
      setDailyLimit(String(limits.data.budget.limit));
      setInitialized(true);
    }
  }, [limits.data, initialized]);
  const reload = async () => {
    setRevision((value) => value + 1);
    await limits.reload();
  };
  const run = async (url: string, body: any) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await api(url, body);
      setMessage(data.message);
      await reload();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const budget = limits.data?.budget;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase text-blue-600">
          Communications
        </p>
        <h1 className="text-2xl font-extrabold">Email Center</h1>
        <p className="mt-2 text-sm text-slate-500">
          Configure senders, route confirmations and track automatic and manual
          email.
        </p>
      </div>
      <nav
        aria-label="Email Center sections"
        className="flex flex-wrap gap-3 text-sm font-semibold text-blue-700"
      >
        <a href="#smtp">SMTP Configuration</a>
        <Link href="/admin/email/templates">Form Email Routing</Link>
        <Link href="/admin/email/templates?view=templates">
          Template Management
        </Link>
        <Link href="/admin/email/form-campaigns">Form Campaigns</Link>
        <Link href="/admin/email/reports">Daily Reports</Link>
        <Link href="/admin/email/reusable-templates">Reusable Templates</Link>
        <a href="#manual">Manual Email Center</a>
        <a href="#delivery">Delivery Activity</a>
        <Link href="/admin/google-integrations">Google connection</Link>
      </nav>
      <Notice error>{error || limits.error}</Notice>
      <Notice>{message}</Notice>
      <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold">Daily sending allowance</h2>
            <p className="mt-1 break-all text-xs text-slate-500">
              Default sender: {budget?.sender || "Checking…"} · rolling 24 hours
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run("/api/admin/email/limits", {
                limit: Number(dailyLimit),
              });
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="text-xs font-semibold">
              Daily limit
              <input
                required
                type="number"
                min={1}
                max={500}
                className={`${inputClass} mt-1 !w-24 block`}
                value={dailyLimit}
                onChange={(event) => setDailyLimit(event.target.value)}
              />
            </label>
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={busy || !budget}
            >
              Save limit
            </button>
          </form>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Used / reserved", budget?.used],
            ["Remaining", budget?.remaining],
            ["Maximum", budget?.limit],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">
                {value ?? "—"}
              </p>
            </div>
          ))}
        </div>
        {budget && !budget.canSend && (
          <Notice>
            {budget.paused
              ? budget.pauseReason
              : "Daily allowance reached. Additional messages remain queued."}{" "}
            {budget.nextAvailableAt && (
              <>
                Next available:{" "}
                {new Date(budget.nextAvailableAt).toLocaleString()}.
              </>
            )}
          </Notice>
        )}
        <p className="text-xs leading-relaxed text-slate-500">
          Up to 500 emails per sending identity per rolling 24 hours, or a lower
          configured cap. Confirmations, staff alerts, reminders, manual and
          test messages share their sender's allowance. Gmail aliases share
          usage. Account limits can lower the cap. Uncertain sends keep their
          reservation.
        </p>
      </section>
      <SmtpConfiguration onChanged={reload} />
      <CandidateEmailComposer onQueued={reload} />
      <EmailDeliveryActivity revision={revision} run={run} busy={busy} />
      <section className={panelClass}>
        <h2 className="font-bold">Queue operations</h2>
        <p className="text-xs text-slate-500">
          The protected scheduler processes pending jobs. Processing manually
          also respects limits and retry schedules.
        </p>
        <button
          className={buttonClass}
          disabled={busy}
          onClick={() =>
            void run("/api/admin/notifications", { action: "process" })
          }
        >
          Process pending jobs now
        </button>
        <Link
          href="/admin/diagnostics"
          className="block text-sm text-blue-700 underline"
        >
          System health & recovery
        </Link>
      </section>
    </div>
  );
}

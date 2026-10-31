"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, buttonClass, inputClass, Notice, panelClass } from "./live-data";

type Row = {
  id: string;
  title: string;
  type: string;
  campaignId?: string;
  active: boolean;
  updatedAt: string;
  hasDraft: boolean;
  applicant: string;
  staff: string;
  staffEmails: string[];
  invitationFormId: string;
  staffText?: string;
  dirty?: boolean;
  applicantAccountId?: string;
  applicantFallbackAccountId?: string;
  staffAccountId?: string;
  staffFallbackAccountId?: string;
};
export default function FormEmailRouting({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [accounts, setAccounts] = useState<
    { id: string; name: string; active: boolean }[]
  >([]);
  const [defaultAccount, setDefaultAccount] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await api(
      "/api/admin/email/routing",
      undefined,
      "GET",
      signal,
    );
    setRows(
      data.forms.map((row: Row) => ({
        ...row,
        staffText: row.staffEmails.join(", "),
      })),
    );
    setAccounts(data.accounts || []);
    setDefaultAccount(data.defaultAccountId || "");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!rows.some((row) => row.dirty)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [rows]);
  useEffect(() => {
    onDirtyChange?.(rows.some((row) => row.dirty));
  }, [rows, onDirtyChange]);
  const change = (id: string, patch: Partial<Row>) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, ...patch, dirty: true } : row,
      ),
    );
    setMessage("");
  };
  const save = async (row: Row) => {
    if (busy) return;
    setBusy(row.id);
    setError("");
    setMessage("");
    try {
      const data = await api("/api/admin/email/routing", {
        formId: row.id,
        expectedUpdatedAt: row.updatedAt,
        applicant: row.applicant,
        staff: row.staff,
        applicantAccountId: row.applicantAccountId || "",
        applicantFallbackAccountId: row.applicantFallbackAccountId || "",
        staffAccountId: row.staffAccountId || "",
        staffFallbackAccountId: row.staffFallbackAccountId || "",
        staffEmails: (row.staffText || "")
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean),
        invitationFormId: row.invitationFormId,
      });
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, updatedAt: data.updatedAt, dirty: false }
            : item,
        ),
      );
      setMessage(data.message);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="space-y-4" aria-label="Form email routing">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Choose emails for each form</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            One applicant confirmation per accepted response. Staff alerts are
            separate. Secure access emails are sent only when someone requests a
            private link.
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={Boolean(busy) || loading}
          onClick={() => {
            if (rows.some((row) => row.dirty)) {
              setError("Save your routing changes before reloading.");
              return;
            }
            setError("");
            void load().catch((error) => setError(error.message));
          }}
        >
          Reload routing
        </button>
      </div>
      <Notice error>{error}</Notice>
      <Notice>{message}</Notice>
      {loading ? (
        <p role="status">Loading form routing…</p>
      ) : (
        rows.map((row) => (
          <form
            key={row.id}
            onSubmit={(event) => {
              event.preventDefault();
              void save(row);
            }}
            className={panelClass}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{row.title}</h3>
                {row.type === "workshop_rsvp" && <p className="mt-2 text-xs text-slate-600">Booking confirmations are configured on the workshop. This form receipt is only an additional email when enabled in Builder → Workshop settings, or a fallback when no workshop confirmation applies.</p>}
                <p className="mt-1 text-xs text-slate-500">
                  {row.type} · {row.active ? "Published" : "Closed or draft"}
                </p>
              </div>
              <Link
                href={`/admin/forms/${row.id}/builder`}
                className="text-sm font-semibold text-blue-700"
              >
                Form settings
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold">
                Applicant confirmation
                <select
                  className={`${inputClass} mt-1`}
                  value={row.applicant}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    change(row.id, { applicant: event.target.value })
                  }
                >
                  <option value="off">Off · no applicant confirmation</option>
                  <option value="form">This form's custom confirmation</option>
                  <option value="registration_confirmation">
                    Registration confirmation template
                  </option>
                  <option value="application_confirmation">
                    Application confirmation template
                  </option>
                  <option value="form_confirmation">
                    General form confirmation template
                  </option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                Admissions staff alert
                <select
                  className={`${inputClass} mt-1`}
                  value={row.staff}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    change(row.id, { staff: event.target.value })
                  }
                >
                  <option value="off">Off · no staff alert</option>
                  <option value="form">
                    This form's custom staff template
                  </option>
                  <option value="admin_submission">
                    New submission staff template
                  </option>
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ["applicantAccountId", "Applicant sending account", false],
                  [
                    "applicantFallbackAccountId",
                    "Applicant fallback account",
                    true,
                  ],
                  ["staffAccountId", "Staff sending account", false],
                  ["staffFallbackAccountId", "Staff fallback account", true],
                ] as const
              ).map(([key, label, fallback]) => (
                <label key={key} className="text-sm font-semibold">
                  {label}
                  <select
                    className={`${inputClass} mt-1`}
                    value={row[key] || ""}
                    disabled={Boolean(busy)}
                    onChange={(event) =>
                      change(row.id, { [key]: event.target.value })
                    }
                  >
                    <option value="">
                      {fallback
                        ? "Off · no automatic fallback"
                        : `Default · ${accounts.find((account) => account.id === defaultAccount)?.name || "current sender"}`}
                    </option>
                    {accounts.map((account) => (
                      <option
                        key={account.id}
                        value={account.id}
                        disabled={!account.active}
                      >
                        {account.name}
                        {account.active ? "" : " (inactive / incomplete)"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Fallback is used only after a confirmed failure before acceptance.
              Uncertain sends and daily-limit waits do not switch accounts.{" "}
              <Link
                className="text-blue-700 underline"
                href="/admin/email#smtp"
              >
                Manage SMTP accounts
              </Link>
            </p>
            <label className="block text-sm font-semibold">
              Additional staff recipients
              <input
                className={`${inputClass} mt-1`}
                value={row.staffText || ""}
                disabled={Boolean(busy)}
                onChange={(event) =>
                  change(row.id, { staffText: event.target.value })
                }
                placeholder="staff@example.com, another@example.com"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                The configured admissions notification address is included when
                staff alerts are on. A staff member who is also the applicant
                can receive both types.
              </span>
            </label>
            {row.type === "registration" && (
              <label className="block text-sm font-semibold">
                Optional application link in this registration email
                <select
                  className={`${inputClass} mt-1`}
                  value={row.invitationFormId}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    change(row.id, { invitationFormId: event.target.value })
                  }
                >
                  <option value="">None · registration receipt only</option>
                  {rows
                    .filter(
                      (target) =>
                        target.type === "application" &&
                        target.campaignId === row.campaignId,
                    )
                    .map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.title}
                        {target.active ? "" : " (not currently open)"}
                      </option>
                    ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Included only while the selected application accepts
                  responses. No extra invitation email is sent.
                </span>
              </label>
            )}
            {row.hasDraft && (
              <p role="status" className="text-sm text-amber-800">
                Publish or discard the saved builder draft before changing
                routing here.
              </p>
            )}
            <button
              className={buttonClass}
              disabled={!row.dirty || Boolean(busy) || row.hasDraft}
            >
              {busy === row.id ? "Saving…" : "Save routing"}
            </button>
          </form>
        ))
      )}
    </section>
  );
}

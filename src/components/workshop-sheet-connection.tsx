"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, inputClass, buttonClass, Notice } from "./live-data";
import { pendingPayload, submitRequest } from "@/lib/client/submit";
import { readJson, responseError } from "@/lib/client/api";
import SubmissionRecovery from "./submission-recovery";
import { suggestedWorkshopTab } from "@/lib/workshops/sheet-config";
type Config = {
  enabled: boolean;
  sheet_id: string;
  sheet_name: string;
  auto_sync: boolean;
  version: string;
  updated_at: string;
};
type Props = {
  workshop: {
    id: string;
    title: string;
    google_sheets_config?: Config;
    sheetSync?: {
      total: number;
      synced: number;
      pending: number;
      failed: number;
      lastSyncedAt: string | null;
      lastError: string | null;
    };
  };
  googleConnected: boolean;
  defaultSpreadsheetId: string;
  onChanged: () => Promise<void>;
};
export default function WorkshopSheetConnection({
  workshop,
  googleConnected,
  defaultSpreadsheetId,
  onChanged,
}: Props) {
  const endpoint = `/api/admin/workshops/${encodeURIComponent(workshop.id)}/sheets`,
    configUrl = endpoint + "/config",
    syncUrl = endpoint + "/sync",
    config = workshop.google_sheets_config;
  const initial = () => ({
    enabled: config?.enabled ?? true,
    sheetId: config?.sheet_id || defaultSpreadsheetId,
    sheetName: config?.sheet_name || suggestedWorkshopTab(workshop),
    autoSync: config?.auto_sync ?? true,
    syncExisting: true,
    expectedVersion: config?.version || "",
  });
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(initial),
    [worksheets, setWorksheets] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [attemptId, setAttemptId] = useState(""),
    [configPending, setConfigPending] = useState(false),
    [syncPending, setSyncPending] = useState(false);
  useEffect(() => {
    setAttemptId(crypto.randomUUID());
    setConfigPending(pendingPayload(configUrl) !== undefined);
    setSyncPending(pendingPayload(syncUrl) !== undefined);
  }, [configUrl, syncUrl]);
  const unresolved = configPending || syncPending;
  const finish = async (data: any) => {
    setConfigPending(false);
    setSyncPending(false);
    setMessage(data.message);
    setOpen(false);
    setAttemptId(crypto.randomUUID());
    await onChanged();
  };
  const send = async (url: string, payload: unknown) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await submitRequest(url, payload),
        data = await readJson(response);
      if (!response.ok || !data.success) throw responseError(response, data);
      await finish(data);
    } catch (error: any) {
      setError(error.message);
      setConfigPending(pendingPayload(configUrl) !== undefined);
      setSyncPending(pendingPayload(syncUrl) !== undefined);
    } finally {
      setBusy(false);
    }
  };
  const inspect = async (action: "inspect" | "create") => {
    setBusy(true);
    setError("");
    try {
      const data = await api(endpoint, {
        action,
        ...(action === "inspect"
          ? { sheetId: draft.sheetId }
          : { title: `${workshop.title} bookings`.slice(0, 255) }),
      });
      setWorksheets(data.worksheets);
      setDraft((current) => ({
        ...current,
        sheetId: data.sheetId,
        sheetName:
          action === "create"
            ? data.worksheets[0] || current.sheetName
            : current.sheetName,
      }));
      setMessage(data.message);
    } catch (error: any) {
      setError(
        action === "create"
          ? `Spreadsheet creation was not confirmed. Check Google Drive before creating another. ${error.message}`
          : error.message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="text-sm font-bold">Google Sheets · Bookings</h3>
        <span className="text-xs text-slate-500">
          {config?.enabled
            ? config.auto_sync
              ? "Auto-sync on"
              : "Manual sync only"
            : "Not connected / disabled"}
        </span>
      </div>
      <Notice error>{error}</Notice>
      <Notice>{message}</Notice>
      <SubmissionRecovery
        url={configUrl}
        show={configPending}
        onResolved={(data) => {
          void finish(data);
        }}
      />
      <SubmissionRecovery
        url={syncUrl}
        show={syncPending}
        onResolved={(data) => {
          void finish(data);
        }}
      />
      {config?.enabled && (
        <div className="space-y-1 text-xs text-slate-600">
          <p className="break-words">
            Tab: <strong>{config.sheet_name}</strong> ·{" "}
            {workshop.sheetSync?.synced || 0} of{" "}
            {workshop.sheetSync?.total || 0} booking rows synced ·{" "}
            {workshop.sheetSync?.pending || 0} pending ·{" "}
            {workshop.sheetSync?.failed || 0} need attention
          </p>
          {workshop.sheetSync?.lastSyncedAt && (
            <p>
              Last sync:{" "}
              {new Date(workshop.sheetSync.lastSyncedAt).toLocaleString()}
            </p>
          )}
          {workshop.sheetSync?.lastError && (
            <p className="text-red-700">{workshop.sheetSync.lastError}</p>
          )}
          <a
            className="inline-block text-blue-700 underline"
            href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(config.sheet_id)}/edit`}
            target="_blank"
            rel="noreferrer"
          >
            Open spreadsheet
          </a>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-xs font-semibold">
        <button
          type="button"
          disabled={busy || unresolved}
          className="text-blue-700 disabled:opacity-50"
          onClick={() => {
            if (!open) {
              setDraft(initial());
              setWorksheets([]);
              setError("");
            }
            setOpen(!open);
          }}
        >
          {open
            ? "Close Sheet settings"
            : config
              ? "Edit Sheet connection"
              : "Connect Google Sheet"}
        </button>
        {config?.enabled && (
          <button
            type="button"
            disabled={busy || unresolved || !attemptId || !googleConnected}
            className="text-blue-700 disabled:opacity-50"
            onClick={() =>
              void send(syncUrl, {
                expectedVersion: config.version,
                clientAttemptId: attemptId,
              })
            }
          >
            Sync all bookings
          </button>
        )}
        <Link
          href={`/admin/email?channel=sheet&deliverySearch=${encodeURIComponent(workshop.id)}#delivery`}
          className="text-blue-700 underline"
        >
          Export activity
        </Link>
      </div>
      {open && (
        <form
          className="space-y-3 rounded-xl bg-slate-50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(configUrl, { ...draft, clientAttemptId: attemptId });
          }}
        >
          {!googleConnected && (
            <p className="text-xs text-amber-800">
              <Link href="/admin/google-integrations" className="underline">
                Connect Google first
              </Link>
              , then return here to choose the spreadsheet.
            </p>
          )}
          <fieldset disabled={busy || unresolved} className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  setDraft({ ...draft, enabled: event.target.checked })
                }
              />
              Enable this workshop's Sheet connection
            </label>
            <label className="block text-xs font-semibold">
              Spreadsheet URL or ID
              <input
                className={`${inputClass} mt-1`}
                required={draft.enabled}
                maxLength={500}
                value={draft.sheetId}
                onChange={(event) => {
                  setDraft({ ...draft, sheetId: event.target.value });
                  setWorksheets([]);
                }}
                placeholder="https://docs.google.com/spreadsheets/d/…"
              />
            </label>
            <div className="flex flex-wrap gap-3 text-xs font-semibold">
              <button
                type="button"
                className="text-blue-700 disabled:opacity-50"
                disabled={!draft.sheetId || !googleConnected}
                onClick={() => void inspect("inspect")}
              >
                Check spreadsheet & load tabs
              </button>
              <button
                type="button"
                className="text-blue-700 disabled:opacity-50"
                disabled={!googleConnected}
                onClick={() => void inspect("create")}
              >
                Create a new spreadsheet
              </button>
            </div>
            {worksheets.length > 0 && (
              <label className="block text-xs font-semibold">
                Existing tabs (choose a dedicated workshop tab)
                <select
                  className={`${inputClass} mt-1`}
                  value={
                    worksheets.includes(draft.sheetName) ? draft.sheetName : ""
                  }
                  onChange={(event) => {
                    if (event.target.value)
                      setDraft({ ...draft, sheetName: event.target.value });
                  }}
                >
                  <option value="">Use the new tab name below</option>
                  {worksheets.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-xs font-semibold">
              Workshop tab name
              <input
                className={`${inputClass} mt-1`}
                required={draft.enabled}
                maxLength={100}
                value={draft.sheetName}
                onChange={(event) =>
                  setDraft({ ...draft, sheetName: event.target.value })
                }
              />
            </label>
            <p className="text-xs text-slate-500">
              Each workshop needs its own tab. A missing tab is created by the
              first queued export. Form response tabs and tabs owned by another
              workshop cannot be reused.
            </p>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.autoSync}
                onChange={(event) =>
                  setDraft({ ...draft, autoSync: event.target.checked })
                }
              />
              Automatically sync new bookings and attendance updates
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.syncExisting}
                onChange={(event) =>
                  setDraft({ ...draft, syncExisting: event.target.checked })
                }
              />
              Sync existing bookings when saving
            </label>
            <button className={buttonClass} disabled={!attemptId}>
              {busy ? "Saving…" : "Save Sheet connection"}
            </button>
          </fieldset>
          <p className="text-xs text-slate-500">
            Includes name, registration/application reference, contact details,
            NIC, district, booking time and attendance. Keep this spreadsheet
            private. The connected Google account needs Editor access. Sync runs
            through the background queue; saving a booking does not wait for
            Google.
          </p>
        </form>
      )}
    </div>
  );
}

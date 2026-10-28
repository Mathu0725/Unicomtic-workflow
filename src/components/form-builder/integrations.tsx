"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import type { CustomForm } from "@/lib/data/store";
import type { FormEditorValues } from "@/lib/forms/editor";
import {
  buttonClass,
  inputClass,
  SettingLabel,
  SettingsCard,
  Toggle,
} from "./controls";

export default function FormIntegrations({
  form,
  values,
  onChange,
  saved,
}: {
  form: CustomForm;
  values: FormEditorValues;
  onChange: (patch: Partial<FormEditorValues>) => void;
  saved: boolean;
}) {
  const [connection, setConnection] = useState<{
      google?: { email: string } | null;
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [worksheets, setWorksheets] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    api("/api/admin/integrations", undefined, "GET", controller.signal)
      .then(setConnection)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  const config = values.google_sheets_config,
    googleForm = values.google_form_config || {
      enabled: false,
      response_mode: "webhook" as const,
    };
  const mode = config.disabled
    ? "off"
    : config.enabled
      ? "separate"
      : "inherit";
  const sheetAction = async (action: "inspect" | "create") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(`/api/admin/forms/${form.id}/sheets`, {
        action,
        sheetId: config.sheet_id,
        title: `${values.title} responses`,
      });
      setWorksheets(result.worksheets);
      setNotice(result.message);
      if (action === "create")
        onChange({
          google_sheets_config: {
            ...config,
            enabled: true,
            disabled: false,
            sheet_id: result.sheetId,
            sheet_name: result.worksheets[0] || "Responses",
          },
        });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not reach Google.",
      );
    } finally {
      setBusy(false);
    }
  };
  const copyScript = async () => {
    const script = `function onFormSubmit(e) {\n  var answers = {};\n  e.response.getItemResponses().forEach(function(item) { answers[item.getItem().getTitle()] = item.getResponse(); });\n  var response = UrlFetchApp.fetch(${JSON.stringify(`${location.origin}/api/forms/${form.slug}/google-webhook`)}, { method: "post", contentType: "application/json", payload: JSON.stringify({ responseId: e.response.getId(), secret: ${JSON.stringify(form.google_form_config?.webhook_secret || "")}, formId: ${JSON.stringify(form.id)}, respondentEmail: e.response.getRespondentEmail() || "", timestamp: e.response.getTimestamp().toISOString(), answers: answers }), muteHttpExceptions: true });\n  if (response.getResponseCode() >= 300) throw new Error("Portal did not confirm delivery. Check the original Google response before retrying.");\n}`;
    try {
      await navigator.clipboard.writeText(script);
      setNotice(
        "Apps Script copied. Add an installable On form submit trigger in your Google Form.",
      );
    } catch {
      setError(
        "Clipboard access is unavailable. Allow clipboard access and try again.",
      );
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"
        >
          {notice}
        </p>
      )}
      <SettingsCard
        title="Google connection"
        description="Use the portal's connected account for this form's spreadsheet and notifications."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-700">
            {connection
              ? connection.google?.email || "No Google account connected"
              : "Checking connection…"}
          </span>
          <Link href="/admin/google-integrations" className={buttonClass}>
            {connection?.google ? "Manage connection" : "Connect Google"}
          </Link>
        </div>
      </SettingsCard>
      <SettingsCard
        title="Response spreadsheet"
        description="Choose where this form's responses go. Responses are saved in the portal before Google Sheets synchronization."
      >
        <SettingLabel label="Sync destination">
          <select
            className={inputClass}
            value={mode}
            onChange={(event) =>
              onChange({
                google_sheets_config: {
                  ...config,
                  enabled: event.target.value === "separate",
                  disabled: event.target.value === "off",
                },
              })
            }
          >
            <option value="inherit">Use admissions spreadsheet</option>
            <option value="separate">Use a separate spreadsheet</option>
            <option value="off">Turn spreadsheet sync off</option>
          </select>
        </SettingLabel>
        {mode === "inherit" && (
          <p className="text-sm leading-relaxed text-slate-500">
            Uses the destination configured in Google Integrations. Registration
            and application responses use their corresponding tabs.
          </p>
        )}
        {mode === "separate" && (
          <>
            <SettingLabel label="Spreadsheet URL or ID">
              <input
                className={inputClass}
                value={config.sheet_id}
                onChange={(event) => {
                  const value = event.target.value;
                  setWorksheets([]);
                  onChange({
                    google_sheets_config: {
                      ...config,
                      sheet_id:
                        value.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ||
                        value.trim(),
                    },
                  });
                }}
                placeholder="Paste your Google spreadsheet link"
              />
            </SettingLabel>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !config.sheet_id || !connection?.google}
                onClick={() => void sheetAction("inspect")}
              >
                {busy ? "Checking…" : "Check & load worksheets"}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !connection?.google}
                onClick={() => void sheetAction("create")}
              >
                Create new spreadsheet
              </button>
            </div>
            <SettingLabel
              label="Worksheet"
              hint="Choose a new empty tab for portal exports. Column A is reserved for referenceNo."
            >
              {worksheets.length ? (
                <select
                  className={inputClass}
                  value={config.sheet_name}
                  onChange={(event) =>
                    onChange({
                      google_sheets_config: {
                        ...config,
                        sheet_name: event.target.value,
                      },
                    })
                  }
                >
                  {!worksheets.includes(config.sheet_name) && (
                    <option value={config.sheet_name}>
                      {config.sheet_name} (new tab)
                    </option>
                  )}
                  {worksheets.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputClass}
                  value={config.sheet_name}
                  onChange={(event) =>
                    onChange({
                      google_sheets_config: {
                        ...config,
                        sheet_name: event.target.value,
                      },
                    })
                  }
                />
              )}
            </SettingLabel>
            <Toggle
              label="Sync new responses automatically"
              checked={config.auto_sync}
              onChange={(auto_sync) =>
                onChange({ google_sheets_config: { ...config, auto_sync } })
              }
            />
          </>
        )}
        <details className="border-t border-slate-100 pt-4 text-xs text-slate-500">
          <summary className="cursor-pointer font-semibold">
            Columns & synchronization status
          </summary>
          <p className="mt-3 leading-relaxed">
            Question keys remain stable when labels change. Retries update rows
            by reference number. Changes take effect after publishing; export
            existing responses from the Responses page.
          </p>
          <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2">Question</th>
                  <th className="p-2">Stable column</th>
                </tr>
              </thead>
              <tbody>
                {values.fields
                  .filter((field) => field.type !== "section")
                  .map((field) => (
                    <tr key={field.id} className="border-t border-slate-100">
                      <td className="p-2">{field.label}</td>
                      <td className="break-all p-2 font-mono">{field.id}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Link
            className="mt-3 inline-block font-semibold text-blue-700"
            href={`/admin/forms/${form.id}/responses`}
          >
            View responses & retry exports →
          </Link>
        </details>
      </SettingsCard>
      <details className="rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-bold text-slate-800">
          Import from an external Google Form
        </summary>
        <div className="mt-5 space-y-5">
          <p className="text-sm text-slate-500">
            Optional. Use this only when applicants submit through Google Forms.
          </p>
          <Toggle
            label="Enable external Google Form"
            checked={googleForm.enabled}
            onChange={(enabled) =>
              onChange({ google_form_config: { ...googleForm, enabled } })
            }
          />
          <SettingLabel label="Google Form URL">
            <input
              className={inputClass}
              type="url"
              value={googleForm.form_url || ""}
              onChange={(event) =>
                onChange({
                  google_form_config: {
                    ...googleForm,
                    form_url: event.target.value,
                  },
                })
              }
            />
          </SettingLabel>
          <SettingLabel label="Response mode">
            <select
              className={inputClass}
              value={googleForm.response_mode}
              onChange={(event) =>
                onChange({
                  google_form_config: {
                    ...googleForm,
                    response_mode: event.target
                      .value as typeof googleForm.response_mode,
                  },
                })
              }
            >
              <option value="webhook">Live webhook</option>
              <option value="sheet_sync">
                Import from response spreadsheet
              </option>
              <option value="embed">Embed Google Form</option>
            </select>
          </SettingLabel>
          <SettingLabel label="Google Form response spreadsheet">
            <input
              className={inputClass}
              value={googleForm.response_sheet_url || ""}
              onChange={(event) =>
                onChange({
                  google_form_config: {
                    ...googleForm,
                    response_sheet_url: event.target.value,
                  },
                })
              }
            />
          </SettingLabel>
          <SettingLabel label="Response worksheet">
            <input
              className={inputClass}
              value={googleForm.response_sheet_name || "Form Responses 1"}
              onChange={(event) =>
                onChange({
                  google_form_config: {
                    ...googleForm,
                    response_sheet_name: event.target.value,
                  },
                })
              }
            />
          </SettingLabel>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => void copyScript()}
              disabled={!saved || !form.google_form_config?.enabled}
            >
              Copy Apps Script
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={
                busy ||
                !saved ||
                !form.google_form_config?.enabled ||
                !form.google_form_config?.response_sheet_url
              }
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await api(
                    `/api/admin/forms/${form.id}/google-sync`,
                    {},
                  );
                  setNotice(result.message);
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : "Import failed.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Import saved Google responses
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Publish these settings before copying the script or importing
            responses. Match Google question titles to this form's labels or
            stable question keys.
          </p>
        </div>
      </details>
    </div>
  );
}

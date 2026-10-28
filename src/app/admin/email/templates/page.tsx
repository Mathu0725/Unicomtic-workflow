"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import FormEmailRouting from "@/components/form-email-routing";
import { Mail, RefreshCw, Save, Search, Undo2 } from "lucide-react";
import {
  api,
  buttonClass,
  inputClass,
  Notice,
  panelClass,
} from "@/components/live-data";
import {
  personalizeTemplate,
  templateExampleValues,
  templateProblem,
  type EmailTemplateContent,
} from "@/lib/email/template-catalog";

type Entry = EmailTemplateContent & {
  key: string;
  kind: "system" | "form";
  id: string;
  title: string;
  group: string;
  description: string;
  variables: string[];
  defaults: EmailTemplateContent;
  limits?: { subject: number; body: number };
  version?: number;
  updatedAt?: string | null;
  expectedUpdatedAt?: string;
  audience?: "applicant" | "admin";
  active?: boolean;
  linkNotice?: string;
  builderUrl?: string;
};
const draftFor = (entry: Entry): EmailTemplateContent => ({
  subject: entry.subject,
  body: entry.body,
  ...(entry.kind === "system" && entry.actionLabel !== undefined
    ? { actionLabel: entry.actionLabel }
    : {}),
});
const endpoint = "/api/admin/email/templates";

export default function EmailTemplatesPage() {
  const [view, setView] = useState<"templates" | "routing">("routing");
  const [routingDirty, setRoutingDirty] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]),
    [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState<EmailTemplateContent>({
    subject: "",
    body: "",
  });
  const [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const selected = entries.find((entry) => entry.key === selectedKey);
  const dirty = Boolean(
    selected && JSON.stringify(draft) !== JSON.stringify(draftFor(selected)),
  );
  const load = useCallback(async (preferredKey = "", signal?: AbortSignal) => {
    const data = await api(endpoint, undefined, "GET", signal);
    const rows: Entry[] = data.entries;
    const entry =
      rows.find((row) => row.key === preferredKey) ||
      rows.find((row) => row.kind === "form" && row.audience === "applicant") ||
      rows[0];
    setEntries(rows);
    setSelectedKey(entry?.key || "");
    if (entry) setDraft(draftFor(entry));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load("", controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const choose = (entry: Entry) => {
    if (dirty) {
      setError(
        "Save your changes or choose Discard changes before switching templates.",
      );
      return;
    }
    setSelectedKey(entry.key);
    setDraft(draftFor(entry));
    setError("");
    setMessage("");
  };
  const reload = async () => {
    if (dirty) {
      setError("Discard or save your changes before reloading templates.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await load(selectedKey);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || busy) return;
    const problem = templateProblem(draft, selected.variables, selected.limits);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await api(endpoint, {
        kind: selected.kind,
        id: selected.id,
        ...draft,
        ...(selected.kind === "system"
          ? { expectedVersion: selected.version || 0 }
          : {
              audience: selected.audience,
              expectedUpdatedAt: selected.expectedUpdatedAt,
            }),
      });
      await load(selected.key);
      setMessage(response.message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const visible = entries.filter((entry) =>
    `${entry.title} ${entry.group} ${entry.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const examples = {
    ...Object.fromEntries(
      (selected?.variables || []).map((variable) => [
        variable,
        `Sample ${variable}`,
      ]),
    ),
    ...templateExampleValues,
  };
  const previewSubject = personalizeTemplate(draft.subject, examples),
    previewBody = personalizeTemplate(draft.body, examples);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-blue-600">
            Communications
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">Email Templates</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Change the subject and message for admissions emails in English or
            Tamil. Name, reference and workshop details fill in automatically.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/email"
            className="text-sm font-semibold text-blue-700"
          >
            Email Center
          </Link>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Reload templates
          </button>
        </div>
      </div>
      <Notice error>{error}</Notice>
      <Notice>{message}</Notice>
      <div className="flex gap-2" aria-label="Email settings view">
        <button
          type="button"
          className={buttonClass}
          aria-pressed={view === "routing"}
          onClick={() => {
            if (dirty) {
              setError("Save or discard your template changes first.");
              return;
            }
            setView("routing");
          }}
        >
          Form routing
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-pressed={view === "templates"}
          onClick={() => {
            if (routingDirty) {
              setError("Save your routing changes first.");
              return;
            }
            setView("templates");
            if (view === "routing") void reload();
          }}
        >
          Edit templates
        </button>
      </div>
      {view === "routing" && (
        <FormEmailRouting onDirtyChange={setRoutingDirty} />
      )}
      {view === "templates" && (
        <>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Form routing chooses which template each form sends. Saved changes
            apply to new messages. Existing queued emails keep the content that
            was reviewed when they were queued.
          </div>
          {loading ? (
            <p role="status" className="p-6 text-sm text-slate-500">
              Loading email templates…
            </p>
          ) : !entries.length ? (
            <button
              type="button"
              onClick={() => void reload()}
              className={buttonClass}
            >
              Try loading templates again
            </button>
          ) : (
            <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
              <aside className={panelClass} aria-label="Email template list">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <Search className="h-4 w-4" />
                  <span>Find a template</span>
                </label>
                <input
                  aria-label="Find a template"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Workshop, registration, form…"
                  className={inputClass}
                />
                <div className="max-h-[65dvh] space-y-4 overflow-y-auto pr-1">
                  {[...new Set(visible.map((entry) => entry.group))].map(
                    (group) => (
                      <section key={group}>
                        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                          {group}
                        </h2>
                        <div className="space-y-1">
                          {visible
                            .filter((entry) => entry.group === group)
                            .map((entry) => (
                              <button
                                key={entry.key}
                                type="button"
                                aria-pressed={selectedKey === entry.key}
                                disabled={busy}
                                onClick={() => choose(entry)}
                                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm disabled:opacity-50 ${selectedKey === entry.key ? "bg-blue-600 font-semibold text-white" : "text-slate-700 hover:bg-slate-50"}`}
                              >
                                {entry.title}
                                {entry.kind === "form" && !entry.active && (
                                  <span className="mt-1 block text-[11px] opacity-70">
                                    Not selected for automatic sending in Form
                                    routing
                                  </span>
                                )}
                              </button>
                            ))}
                        </div>
                      </section>
                    ),
                  )}
                  {!visible.length && (
                    <p className="text-sm text-slate-500">
                      No matching templates.
                    </p>
                  )}
                </div>
              </aside>
              {selected && (
                <section
                  className="min-w-0 space-y-5"
                  aria-label="Selected email template"
                >
                  <form onSubmit={save} className={panelClass}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold">{selected.title}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {selected.description}
                        </p>
                        {selected.updatedAt && (
                          <p className="mt-1 text-xs text-slate-400">
                            Saved{" "}
                            {new Date(selected.updatedAt).toLocaleString(
                              "en-GB",
                              {
                                timeZone: "Asia/Colombo",
                              },
                            )}{" "}
                            (Sri Lanka)
                          </p>
                        )}
                      </div>
                      {selected.builderUrl && (
                        <Link
                          href={selected.builderUrl}
                          className="text-sm font-semibold text-blue-700"
                        >
                          Form sending settings
                        </Link>
                      )}
                    </div>
                    <label className="block text-sm font-semibold">
                      Email subject
                      <input
                        required
                        maxLength={selected.limits?.subject || 250}
                        disabled={busy}
                        className={`${inputClass} mt-1`}
                        value={draft.subject}
                        onChange={(event) =>
                          setDraft({ ...draft, subject: event.target.value })
                        }
                      />
                    </label>
                    <label className="block text-sm font-semibold">
                      Email message
                      <textarea
                        required
                        maxLength={selected.limits?.body || 12000}
                        rows={12}
                        disabled={busy}
                        className={`${inputClass} mt-1 resize-y leading-relaxed`}
                        value={draft.body}
                        onChange={(event) =>
                          setDraft({ ...draft, body: event.target.value })
                        }
                      />
                    </label>
                    {draft.actionLabel !== undefined && (
                      <label className="block text-sm font-semibold">
                        Automatic link label
                        <input
                          maxLength={100}
                          disabled={busy}
                          className={`${inputClass} mt-1`}
                          value={draft.actionLabel}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              actionLabel: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        Available variables — copy a token into the subject or
                        message
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selected.variables.map((variable) => (
                          <code
                            key={variable}
                            className="select-all rounded bg-slate-100 px-2 py-1 text-xs text-blue-800"
                          >{`{{${variable}}}`}</code>
                        ))}
                      </div>
                    </div>
                    {selected.linkNotice && (
                      <p className="text-xs leading-relaxed text-slate-500">
                        {selected.linkNotice}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        disabled={busy || !dirty}
                        className={`${buttonClass} gap-2`}
                      >
                        <Save className="h-4 w-4" />
                        {busy ? "Saving…" : "Save template"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setDraft({
                            subject: selected.defaults.subject,
                            body: selected.defaults.body,
                            ...(selected.kind === "system" &&
                            selected.defaults.actionLabel !== undefined
                              ? { actionLabel: selected.defaults.actionLabel }
                              : {}),
                          });
                          setMessage(
                            "Default content loaded into the editor. Choose Save template to apply it.",
                          );
                        }}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600"
                      >
                        <Undo2 className="h-4 w-4" />
                        Load default
                      </button>
                      {dirty && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setDraft(draftFor(selected));
                            setError("");
                            setMessage("");
                          }}
                          className="text-sm font-semibold text-slate-500"
                        >
                          Discard changes
                        </button>
                      )}
                      {dirty && (
                        <span className="text-xs font-semibold text-amber-700">
                          Unsaved changes
                        </span>
                      )}
                    </div>
                  </form>
                  <section
                    className={panelClass}
                    aria-label="Email template preview"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-blue-600" />
                      <h2 className="font-bold">Preview with sample details</h2>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-5">
                      <p className="border-b border-slate-100 pb-3 font-semibold">
                        {previewSubject}
                      </p>
                      <p className="whitespace-pre-wrap break-words pt-4 text-sm leading-relaxed text-slate-700">
                        {previewBody}
                      </p>
                      {draft.actionLabel && (
                        <span className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">
                          {draft.actionLabel}
                        </span>
                      )}
                      {selected.id === "candidate_access" && (
                        <p className="mt-4 text-xs text-slate-500">
                          The link expires in 30 minutes. If you did not request
                          it, ignore this email.
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      Preview only. Saving a template does not send an email.
                    </p>
                  </section>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
import SubmissionRecovery from "./submission-recovery";
import { pendingPayload, submitRequest } from "@/lib/client/submit";
import { readJson, responseError } from "@/lib/client/api";
import type { CandidateStage, EmailCandidate } from "@/lib/email/candidates";
const endpoint = "/api/admin/email/manual";
const identity = (candidate: EmailCandidate) =>
  `${candidate.stage}:${candidate.id}`;
export default function CandidateEmailComposer({
  onQueued,
}: {
  onQueued: () => Promise<void>;
}) {
  const [stage, setStage] = useState<CandidateStage>("registration"),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [intake, setIntake] = useState(""),
    [form, setForm] = useState(""),
    [workshop, setWorkshop] = useState(""),
    [page, setPage] = useState(1),
    [initialId, setInitialId] = useState("");
  const [selected, setSelected] = useState<EmailCandidate[]>([]),
    [direct, setDirect] = useState(""),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [templateId, setTemplateId] = useState(""),
    [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [confirmed, setConfirmed] = useState(false),
    [testRecipient, setTestRecipient] = useState(""),
    [batchId, setBatchId] = useState(""),
    [attemptId, setAttemptId] = useState(""),
    [unresolved, setUnresolved] = useState(false);
  const choices = useLiveData(
    `${endpoint}${batchId ? `?batchId=${encodeURIComponent(batchId)}` : ""}`,
    15000,
  );
  const directory = useLiveData(
    `/api/admin/email/candidates?${new URLSearchParams({ stage, status, search, intake, form, workshop, page: String(page), ...(initialId ? { candidate: initialId } : {}) })}`,
    15000,
  );
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stage") === "application") setStage("application");
    setInitialId(params.get("candidate") || "");
    setAttemptId(crypto.randomUUID());
    setUnresolved(pendingPayload(endpoint) !== undefined);
  }, []);
  useEffect(() => {
    const candidate = directory.data?.candidates?.find(
      (candidate: EmailCandidate) => candidate.id === initialId,
    );
    if (candidate) {
      setSelected([candidate]);
      setInitialId("");
    }
  }, [directory.data, initialId]);
  useEffect(() => {
    setPreview(null);
    setConfirmed(false);
  }, [selected, direct, subject, body, accountId, templateId]);
  const input = () => ({
    candidates: selected.map((candidate) => ({
      stage: candidate.stage,
      recordId: candidate.id,
      expectedEmail: candidate.email,
    })),
    directRecipients: direct
      .split(/[,;\n]+/)
      .map((value) => value.trim())
      .filter(Boolean),
    subject,
    body,
    accountId,
    ...(templateId ? { templateId } : {}),
    clientAttemptId: attemptId,
  });
  const finish = async (data: any) => {
    setBatchId(data.batchId);
    setMessage(data.message);
    setUnresolved(false);
    setPreview(null);
    setConfirmed(false);
    setAttemptId(crypto.randomUUID());
    await onQueued();
    await choices.reload();
  };
  const send = async (test = false) => {
    if (busy || unresolved) return;
    setBusy(true);
    setError("");
    try {
      const response = await submitRequest(endpoint, {
        ...input(),
        ...(test
          ? { testRecipient }
          : { confirmRecipientCount: preview?.recipientCount }),
      });
      const data = await readJson(response);
      if (!response.ok || !data.success) throw responseError(response, data);
      await finish(data);
    } catch (error: any) {
      setError(error.message);
      setUnresolved(pendingPayload(endpoint) !== undefined);
    } finally {
      setBusy(false);
    }
  };
  const review = async () => {
    setBusy(true);
    setError("");
    try {
      setPreview(await api(`${endpoint}/preview`, input()));
      setConfirmed(false);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const changeFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
    setInitialId("");
  };
  return (
    <section id="manual" className={panelClass}>
      <div>
        <h2 className="text-lg font-bold">Manual Email Center</h2>
        <p className="mt-1 text-sm text-slate-500">
          Select candidates across pages or enter recipients. Each address
          receives a separate, personalized message.
        </p>
      </div>
      <Notice error>{error || directory.error || choices.error}</Notice>
      <Notice>{message}</Notice>
      <SubmissionRecovery
        url={endpoint}
        show={unresolved}
        onResolved={(data) => {
          void finish(data);
        }}
      />
      {batchId && choices.data?.progress && (
        <div
          role="status"
          className="rounded-xl bg-blue-50 p-3 text-xs text-blue-900"
        >
          <p className="font-semibold">
            Last batch: {choices.data.progress.total} messages
          </p>
          <p className="mt-1">
            {Object.entries(choices.data.progress.statuses)
              .map(([state, count]) => `${state}: ${count}`)
              .join(" · ")}
          </p>
          <p className="mt-1 break-all">Batch reference: {batchId}</p>
          <p className="mt-1">
            Sent means accepted by the provider. Inbox delivery is not
            confirmed.
          </p>
        </div>
      )}
      <fieldset
        disabled={busy || unresolved}
        className="grid gap-5 xl:grid-cols-2"
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">
              Candidate source
              <select
                className={`${inputClass} mt-1`}
                value={stage}
                onChange={(event) => {
                  setStage(event.target.value as CandidateStage);
                  setStatus("");
                  setPage(1);
                  setInitialId("");
                }}
              >
                <option value="registration">Registrations</option>
                <option value="application">Applications</option>
              </select>
            </label>
            <label className="text-xs font-semibold">
              Candidate status
              <select
                className={`${inputClass} mt-1`}
                value={status}
                onChange={(event) =>
                  changeFilter(setStatus, event.target.value)
                }
              >
                <option value="">All statuses</option>
                {directory.data?.statuses.map((value: string) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["intakes", "Intake", intake, setIntake],
                ["forms", "Form", form, setForm],
                ["workshops", "Workshop booking", workshop, setWorkshop],
              ] as const
            ).map(([key, label, value, setter]) => (
              <label key={key} className="text-xs font-semibold">
                {label}
                <select
                  className={`${inputClass} mt-1`}
                  value={value}
                  onChange={(event) => changeFilter(setter, event.target.value)}
                >
                  <option value="">All</option>
                  {directory.data?.filters?.[key].map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="text-xs font-semibold">
              Find candidates
              <input
                className={`${inputClass} mt-1`}
                placeholder="Name, email or reference"
                value={search}
                onChange={(event) =>
                  changeFilter(setSearch, event.target.value)
                }
              />
            </label>
          </div>
          <div className="flex justify-between text-xs font-semibold">
            <span>{selected.length} candidate records selected</span>
            <button
              type="button"
              className="text-blue-700"
              onClick={() => setSelected([])}
            >
              Clear selection
            </button>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-blue-700"
            onClick={() =>
              setSelected((current) =>
                [
                  ...current,
                  ...(directory.data?.candidates || []).filter(
                    (candidate: EmailCandidate) =>
                      !current.some(
                        (item) => identity(item) === identity(candidate),
                      ),
                  ),
                ].slice(0, 500),
              )
            }
          >
            Select this page
          </button>
          <div
            role="group"
            aria-label="Candidate results"
            className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y"
          >
            {directory.loading && <p className="p-4 text-sm">Loading…</p>}
            {directory.data?.candidates.map((candidate: EmailCandidate) => {
              const checked = selected.some(
                (item) => identity(item) === identity(candidate),
              );
              return (
                <label
                  key={candidate.id}
                  className={`flex items-start gap-3 p-3 text-sm ${checked ? "bg-blue-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() =>
                      setSelected((current) =>
                        checked
                          ? current.filter(
                              (item) => identity(item) !== identity(candidate),
                            )
                          : [...current, candidate].slice(0, 500),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {candidate.name}
                    </span>
                    <span className="block break-all text-xs text-slate-500">
                      {candidate.email}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {candidate.reference} · {candidate.status}
                    </span>
                  </span>
                </label>
              );
            })}
            {directory.data && !directory.data.candidates.length && (
              <p className="p-4 text-sm text-slate-500">
                No candidates match these filters.
              </p>
            )}
          </div>
          {directory.data && (
            <div className="flex justify-between text-xs">
              <span>
                {directory.data.total} candidates · Page {page}
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={
                    page * directory.data.pageSize >= directory.data.total
                  }
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
          {selected.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer">
                Review selected candidates ({selected.length})
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {selected.map((candidate) => (
                  <li key={identity(candidate)}>
                    {candidate.name} · {candidate.reference}{" "}
                    <button
                      type="button"
                      className="text-red-700 underline"
                      onClick={() =>
                        setSelected((current) =>
                          current.filter(
                            (item) => identity(item) !== identity(candidate),
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <label className="block text-xs font-semibold">
            Direct recipients (optional)
            <textarea
              className={`${inputClass} mt-1`}
              rows={3}
              value={direct}
              onChange={(event) => setDirect(event.target.value)}
              placeholder="One email per line, or separated by commas"
            />
          </label>
          <p className="text-xs text-slate-500">
            Duplicate addresses are removed before confirmation. Direct
            recipients can use name, email and institution variables; candidate
            reference variables require a candidate record.
          </p>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-semibold">
            Saved template
            <select
              className={`${inputClass} mt-1`}
              value={templateId}
              onChange={(event) => {
                setTemplateId(event.target.value);
                const template = choices.data?.templates.find(
                  (item: any) => item.id === event.target.value,
                );
                if (template) {
                  setSubject(template.subject);
                  setBody(template.body);
                }
              }}
            >
              <option value="">Custom message</option>
              {choices.data?.templates.map((template: any) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold">
            Sending account
            <select
              className={`${inputClass} mt-1`}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">
                Default ·{" "}
                {choices.data?.accounts.find(
                  (account: any) =>
                    account.id === choices.data.defaultAccountId,
                )?.name || "current sender"}
              </option>
              {choices.data?.accounts.map((account: any) => (
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
          <label className="block text-xs font-semibold">
            Email subject
            <input
              maxLength={250}
              className={`${inputClass} mt-1`}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold">
            Message
            <textarea
              maxLength={10000}
              rows={9}
              className={`${inputClass} mt-1`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write in English or Tamil…"
            />
          </label>
          <p className="text-xs text-slate-500">
            Plain text is safely converted to HTML. Variables:{" "}
            {choices.data?.variables
              .map((value: string) => `{{${value}}}`)
              .join(", ")}
          </p>
          <button
            type="button"
            className={buttonClass}
            disabled={!attemptId || !subject.trim() || !body.trim()}
            onClick={() => void review()}
          >
            Preview & review recipients
          </button>
          <div className="border-t pt-3">
            <label className="block text-xs font-semibold">
              Send preview to a test inbox
              <input
                type="email"
                className={`${inputClass} mt-1`}
                value={testRecipient}
                onChange={(event) => setTestRecipient(event.target.value)}
                placeholder="Explicit test recipient"
              />
            </label>
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-blue-700 disabled:opacity-50"
              disabled={!testRecipient || !subject.trim() || !body.trim()}
              onClick={() => void send(true)}
            >
              Queue test to this address only
            </button>
          </div>
          <p className="text-xs text-slate-500">
            All messages use the central queue and allowance. Saved batches
            continue in the background; delivery results appear below.
          </p>
        </div>
      </fieldset>
      {preview && (
        <section
          aria-label="Email preview and confirmation"
          className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4"
        >
          <h3 className="font-bold">
            Review {preview.recipientCount} unique recipient
            {preview.recipientCount === 1 ? "" : "s"}
          </h3>
          <p className="text-xs">
            {preview.duplicateCount} duplicate address entries removed. Showing
            up to 10 personalized previews.
          </p>
          {preview.previews.map((item: any) => (
            <details
              key={item.to}
              className="rounded-lg bg-white p-3"
              open={preview.recipientCount === 1}
            >
              <summary className="cursor-pointer text-sm font-semibold break-all">
                {item.to} · {item.subject}
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm">{item.text}</p>
            </details>
          ))}
          {preview.recipientCount > 1 && (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I reviewed and confirm sending to {preview.recipientCount} unique
              recipients.
            </label>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              className={buttonClass}
              disabled={
                busy || unresolved || (preview.recipientCount > 1 && !confirmed)
              }
              onClick={() => void send()}
            >
              Queue {preview.recipientCount} email
              {preview.recipientCount === 1 ? "" : "s"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="text-sm"
              onClick={() => setPreview(null)}
            >
              Close preview
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

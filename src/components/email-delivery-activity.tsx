"use client";
import { useEffect, useState } from "react";
import { useLiveData, inputClass, panelClass, Notice } from "./live-data";
import { emailJobStatus } from "@/lib/email/job-status";

export default function EmailDeliveryActivity({
  revision,
  run,
  busy,
}: {
  revision: number;
  run: (url: string, body: any) => Promise<void>;
  busy: boolean;
}) {
  const [stage, setStage] = useState("all"),
    [status, setStatus] = useState("all"),
    [type, setType] = useState("email"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const [extra, setExtra] = useState({
    from: "",
    until: "",
    form: "",
    intake: "",
    purpose: "",
    account: "",
    origin: "",
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("channel") === "sheet") setType("sheet");
    if (params.get("deliverySearch"))
      setSearch(params.get("deliverySearch")!.slice(0, 200));
  }, []);
  const queue = useLiveData(
    `/api/admin/notifications?${new URLSearchParams({ stage, status, type, search, ...extra, page: String(page), revision: String(revision) })}`,
    5000,
  );
  const filter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const colors: Record<string, string> = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-800",
    error: "bg-red-50 text-red-700",
    neutral: "bg-slate-100 text-slate-600",
  };
  return (
    <section id="delivery" className={panelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Delivery activity</h2>
          <p className="mt-1 text-xs text-slate-500">
            Updates every 5 seconds. Failed attempts show the reason and next
            action.
          </p>
        </div>
        <button
          className="text-xs font-semibold text-blue-700 underline"
          disabled={busy}
          onClick={() =>
            run("/api/admin/notifications", { action: "release_blocked" })
          }
        >
          Retry blocked jobs after repair
        </button>
      </div>
      <Notice error>{queue.error}</Notice>
      {queue.data?.worker?.stale && (
        <Notice>
          The background worker has not checked in recently. Saved emails need
          the notification worker or protected queue scheduler to dispatch
          automatically.
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold">
          Record type
          <select
            className={`${inputClass} mt-1`}
            value={stage}
            onChange={(event) => filter(setStage, event.target.value)}
          >
            <option value="all">All records</option>
            <option value="registration">Registration</option>
            <option value="application">Application</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          Delivery status
          <select
            className={`${inputClass} mt-1`}
            value={status}
            onChange={(event) => filter(setStatus, event.target.value)}
          >
            {[
              ["all", "All statuses"],
              ["failed", "Failed / retry scheduled"],
              ["waiting", "Waiting for daily limit"],
              ["queued", "Queued"],
              ["sending", "Sending"],
              ["sent", "Sent"],
              ["uncertain", "Not confirmed"],
              ["blocked", "Blocked"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Channel
          <select
            className={`${inputClass} mt-1`}
            value={type}
            onChange={(event) => filter(setType, event.target.value)}
          >
            <option value="email">Emails</option>
            <option value="sheet">Google Sheets</option>
            <option value="all">All channels</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          Find delivery
          <input
            className={`${inputClass} mt-1`}
            placeholder="Name, reference, subject, provider ID or batch"
            value={search}
            onChange={(event) => filter(setSearch, event.target.value)}
          />
        </label>
      </div>
      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          More delivery filters
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["from", "From date"],
              ["until", "Until date"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs font-semibold">
              {label}
              <input
                type="date"
                className={`${inputClass} mt-1`}
                value={extra[key]}
                onChange={(event) => {
                  setExtra({ ...extra, [key]: event.target.value });
                  setPage(1);
                }}
              />
            </label>
          ))}
          {(
            [
              ["form", "Form", "forms"],
              ["intake", "Intake", "intakes"],
              ["account", "Sending account", "accounts"],
              ["purpose", "Email purpose", "purposes"],
            ] as const
          ).map(([key, label, source]) => (
            <label key={key} className="text-xs font-semibold">
              {label}
              <select
                className={`${inputClass} mt-1`}
                value={extra[key]}
                onChange={(event) => {
                  setExtra({ ...extra, [key]: event.target.value });
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {queue.data?.filters?.[source].map((item: any) => (
                  <option
                    key={typeof item === "string" ? item : item.id}
                    value={typeof item === "string" ? item : item.id}
                  >
                    {typeof item === "string"
                      ? item.replaceAll("_", " ")
                      : item.title || item.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="text-xs font-semibold">
            Message origin
            <select
              className={`${inputClass} mt-1`}
              value={extra.origin}
              onChange={(event) => {
                setExtra({ ...extra, origin: event.target.value });
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="manual">Manual / admin test</option>
              <option value="automatic">Automatic</option>
            </select>
          </label>
        </div>
      </details>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50">
            <tr>
              {[
                "Recipient / candidate",
                "Subject / sheet",
                "Status",
                "Result / next action",
                "Time",
                "Action",
              ].map((heading) => (
                <th className="p-3" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queue.data?.jobs.map((job: any) => {
              const state = emailJobStatus(job);
              return (
                <tr className="border-t align-top" key={job.id}>
                  <td className="p-3">
                    <span className="block font-semibold">
                      {job.payload.toName || job.candidate?.name || job.type}
                    </span>
                    <span className="break-all text-slate-500">
                      {job.payload.to}
                    </span>
                    {job.candidate && (
                      <span className="mt-1 block text-slate-400">
                        {job.candidate.stage} · {job.candidate.reference}
                      </span>
                    )}
                    {job.candidate &&
                      job.payload.to?.toLowerCase() !==
                        job.candidate.email.toLowerCase() && (
                        <span className="block text-slate-400">
                          Admin / alternate recipient
                        </span>
                      )}
                  </td>
                  <td className="p-3 max-w-64 break-words">
                    {job.payload.subject || job.payload.sheetName}
                    {(job.formTitle || job.workshopTitle) && (
                      <span className="mt-1 block font-semibold text-slate-600">
                        {job.workshopTitle || job.formTitle}
                      </span>
                    )}
                    {job.type === "email" && (
                      <span className="mt-1 block text-slate-400">
                        {job.emailKind}
                        <span className="block">{job.accountName}</span>
                        <span className="block">
                          {job.manual ? "Manual" : "Automatic"}
                          {job.initiated_by ? ` · ${job.initiated_by}` : ""}
                        </span>
                        {job.payload.templateId && (
                          <span className="block break-all">
                            Template: {job.payload.templateId} ·{" "}
                            {job.payload.templateVersion ?? "legacy"}
                          </span>
                        )}
                      </span>
                    )}
                    {job.type === "sheet" && (
                      <a
                        className="block text-blue-700 underline"
                        href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(job.payload.sheetId)}/edit`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View destination
                      </a>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-block rounded-lg px-2 py-1 font-semibold ${colors[state.tone]}`}
                    >
                      {state.label}
                    </span>
                    <span className="mt-1 block text-slate-400">
                      {job.attempts} attempt{job.attempts === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="p-3 max-w-xs break-words">
                    <p
                      className={job.error ? "text-red-700" : "text-slate-500"}
                    >
                      {job.error ||
                        (job.status === "sent"
                          ? "Accepted by provider"
                          : "Awaiting dispatch")}
                    </p>
                    {job.deferred_until &&
                      Date.parse(job.deferred_until) > Date.now() && (
                        <p className="mt-1 text-amber-800">
                          Allowance available:{" "}
                          {new Date(job.deferred_until).toLocaleString()}
                        </p>
                      )}
                    {job.status === "queued" && job.next_attempt_at && (
                      <p className="mt-1 text-slate-500">
                        Retry: {new Date(job.next_attempt_at).toLocaleString()}
                      </p>
                    )}
                    {job.status === "uncertain" && (
                      <p className="mt-1 text-amber-800">
                        Check Gmail Sent / SMTP logs before retrying.
                      </p>
                    )}
                    {job.provider_id && (
                      <p className="mt-1 break-all text-[10px] text-slate-400">
                        Provider: {job.provider_id}
                      </p>
                    )}
                    {job.error_code && (
                      <p className="mt-1 text-[10px] text-slate-400">
                        {job.error_code}
                      </p>
                    )}
                    {job.delivery_attempts?.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-slate-600">
                          Attempt history
                        </summary>
                        {job.delivery_attempts.map(
                          (attempt: any, index: number) => (
                            <p
                              key={index}
                              className="mt-1 text-[10px] text-slate-500"
                            >
                              {attempt.account_id} · {attempt.outcome} ·{" "}
                              {attempt.code || attempt.provider_id || ""} ·{" "}
                              {new Date(attempt.at).toLocaleString()}
                            </p>
                          ),
                        )}
                      </details>
                    )}
                    <p className="mt-1 break-all text-[10px] text-slate-400">
                      Job: {job.id}
                    </p>
                  </td>
                  <td className="p-3 whitespace-nowrap text-slate-500">
                    {new Date(
                      job.completed_at || job.created_at,
                    ).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {job.status === "uncertain" && (
                      <button
                        type="button"
                        className="mb-3 block text-xs font-semibold text-emerald-700"
                        disabled={busy}
                        onClick={() => {
                          const providerId = prompt(
                            "Only if Sent / SMTP logs confirm acceptance: enter the matching provider message ID. This records acceptance without resending.",
                          );
                          if (providerId?.trim())
                            void run("/api/admin/notifications", {
                              action: "reconcile_accepted",
                              jobId: job.id,
                              providerId: providerId.trim(),
                              confirmProviderChecked: true,
                            });
                        }}
                      >
                        Record verified acceptance
                      </button>
                    )}
                    {["failed", "uncertain", "blocked"].includes(job.status) &&
                      ![
                        "DECISION_SUPERSEDED",
                        "REMINDER_SUPERSEDED",
                        "CANDIDATE_CONTACT_CHANGED",
                        "CANDIDATE_EXPORT_CHANGED",
                      ].includes(job.error_code) && (
                        <button
                          className="font-semibold text-blue-600"
                          disabled={busy}
                          onClick={() => {
                            if (
                              job.status !== "uncertain" ||
                              confirm(
                                "Check Gmail Sent or SMTP logs first. Retry only if the original email was not sent. Continue?",
                              )
                            )
                              void run("/api/admin/notifications", {
                                action: "retry",
                                jobId: job.id,
                                confirmProviderChecked: true,
                              });
                          }}
                        >
                          Retry{job.status === "blocked" ? " after repair" : ""}
                        </button>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {queue.loading && (
          <p className="py-6 text-center text-sm text-slate-400">
            Loading activity…
          </p>
        )}
        {queue.data && !queue.data.jobs.length && (
          <p className="py-6 text-center text-sm text-slate-500">
            No deliveries match these filters.
          </p>
        )}
      </div>
      {queue.data && (
        <div className="flex justify-between text-xs text-slate-500">
          <span>
            {queue.data.total} deliveries · Page {page}
          </span>
          <div className="flex gap-3">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="text-blue-700 disabled:text-slate-300"
            >
              Previous
            </button>
            <button
              disabled={page * queue.data.pageSize >= queue.data.total}
              onClick={() => setPage(page + 1)}
              className="text-blue-700 disabled:text-slate-300"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

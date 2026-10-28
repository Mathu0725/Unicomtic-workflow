"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { Notice } from "@/components/live-data";
import type { Application } from "@/lib/data/store";
import {
  canChangeApplicationStatus,
  type ApplicationAnswer,
  type ApplicationDetails,
  type ApplicationStatus,
} from "@/lib/admissions/application-review";

const reviewActions: {
  status: ApplicationStatus;
  label: string;
  className: string;
}[] = [
  {
    status: "under_review",
    label: "Mark Under Review",
    className: "bg-amber-500 hover:bg-amber-600",
  },
  {
    status: "approved",
    label: "Approve Application",
    className: "bg-emerald-600 hover:bg-emerald-700",
  },
  {
    status: "rejected",
    label: "Reject",
    className: "bg-red-600 hover:bg-red-700",
  },
];

function legacyAnswers(application: Application): ApplicationAnswer[] {
  return Object.entries({
    "O/L year": application.ol_results.year,
    "O/L index number": application.ol_results.index_no,
    "O/L Mathematics": application.ol_results.maths,
    "O/L English": application.ol_results.english,
    "O/L Science": application.ol_results.science,
    "A/L stream": application.al_results.stream,
    "A/L year": application.al_results.year,
    "A/L index number": application.al_results.index_no,
    "A/L Z-Score": application.al_results.z_score,
    "A/L results": application.al_results.summary,
    "Higher education": application.higher_education,
    "Statement of Purpose": application.statement_of_purpose,
    "Emergency contact name": application.emergency_contact.name,
    "Emergency contact relation": application.emergency_contact.relation,
    "Emergency contact phone": application.emergency_contact.phone,
  })
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .map(([label, value]) => ({ id: label, label, value }));
}

function AnswerValue({ value }: { value: unknown }) {
  if (
    typeof value === "string" &&
    /^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view$/.test(value)
  ) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-700 underline"
      >
        Open document ↗
      </a>
    );
  }
  if (value === true) return <>Yes</>;
  if (value === false) return <>No</>;
  if (Array.isArray(value))
    return (
      <>
        {value
          .map((item) =>
            typeof item === "object" ? JSON.stringify(item) : String(item),
          )
          .join(", ") || "—"}
      </>
    );
  if (typeof value === "object" && value !== null)
    return <>{JSON.stringify(value)}</>;
  return <>{value === "" ? "—" : String(value ?? "—")}</>;
}

export default function ApplicationReviewDialog({
  applicationId,
  studentName,
  onClose,
  onUpdated,
}: {
  applicationId: string;
  studentName: string;
  onClose: () => void;
  onUpdated: (application: Application) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [details, setDetails] = useState<ApplicationDetails | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api(
      `/api/admin/applications/${encodeURIComponent(applicationId)}`,
      undefined,
      "GET",
      controller.signal,
    )
      .then((data: ApplicationDetails) => {
        if (controller.signal.aborted) return;
        setDetails(data);
        setStale(false);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load this application.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applicationId, reload]);

  async function changeStatus(status: ApplicationStatus) {
    if (
      !details ||
      stale ||
      loading ||
      saving.current ||
      !canChangeApplicationStatus(details.application.status, status)
    )
      return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const data: { application: Application } = await api(
        "/api/admin/applications",
        {
          id: applicationId,
          status,
          expectedStatus: details.application.status,
        },
        "PATCH",
      );
      setDetails(
        (current) => current && { ...current, application: data.application },
      );
      onUpdated(data.application);
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 409) setStale(true);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update this application.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const application = details?.application;
  const actions = application
    ? reviewActions.filter((action) =>
        canChangeApplicationStatus(application.status, action.status),
      )
    : [];
  const responses = details?.submissions.length
    ? details.submissions
    : application
      ? [
          {
            id: application.id,
            formTitle: "Application details",
            createdAt: application.submitted_at,
            answers: legacyAnswers(application),
          },
        ]
      : [];

  return (
    <dialog
      ref={dialog}
      aria-labelledby="application-review-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving.current) onClose();
      }}
      onClose={onClose}
      className="m-auto max-h-[90dvh] w-[94vw] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-xl backdrop:bg-slate-950/60"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5">
        <div>
          <h2
            id="application-review-title"
            className="text-xl font-extrabold text-slate-900"
          >
            {studentName}
          </h2>
          {application && (
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-mono font-bold text-indigo-700">
                {application.application_no}
              </span>{" "}
              · Status:{" "}
              <span className="font-semibold">
                {application.status.replaceAll("_", " ")}
              </span>
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close application details"
          disabled={busy}
          onClick={onClose}
          className="rounded-lg border border-slate-200 p-2 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-5 p-5">
        <Notice error>{error}</Notice>
        {loading ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-slate-500"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading application details…
          </p>
        ) : (
          <>
            {(stale || !details) && (
              <button
                type="button"
                className="text-sm font-semibold text-blue-700 underline"
                onClick={() => setReload((value) => value + 1)}
              >
                Reload application
              </button>
            )}
            {responses.map((response) => (
              <section
                key={response.id}
                aria-labelledby={`application-response-${response.id}`}
                className="rounded-xl border border-slate-200"
              >
                <div className="border-b border-slate-200 bg-slate-50 p-4">
                  <h3
                    id={`application-response-${response.id}`}
                    className="font-bold text-slate-900"
                  >
                    {response.formTitle}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Submitted: {new Date(response.createdAt).toLocaleString()}
                  </p>
                </div>
                <dl className="divide-y divide-slate-100 px-4">
                  {response.answers.map((answer) => (
                    <div key={answer.id} className="py-3">
                      <dt className="text-xs font-semibold text-slate-500">
                        {answer.label}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">
                        <AnswerValue value={answer.value} />
                      </dd>
                    </div>
                  ))}
                </dl>
                {!response.answers.length && (
                  <p className="p-4 text-sm text-slate-500">
                    No additional answers were recorded.
                  </p>
                )}
              </section>
            ))}
            {application?.review_notes && (
              <section>
                <h3 className="text-sm font-bold text-slate-900">
                  Review notes
                </h3>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                  {application.review_notes}
                </p>
              </section>
            )}
            {application && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                {actions.length ? (
                  actions.map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      disabled={busy || stale}
                      onClick={() => void changeStatus(action.status)}
                      className={`rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${action.className}`}
                    >
                      {busy ? "Saving…" : action.label}
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    This application must be submitted before it can be
                    reviewed.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

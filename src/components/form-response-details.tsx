"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { FormField, FormSubmission } from "@/lib/data/store";
export default function FormResponseDetails({
  submission,
  fields,
  onClose,
}: {
  submission: FormSubmission;
  fields: FormField[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="response-detail-title"
      onCancel={onClose}
      onClose={onClose}
      className="m-auto max-h-[90dvh] w-[94vw] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-xl backdrop:bg-slate-950/60"
    >
      <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5">
        <div>
          <h2
            id="response-detail-title"
            className="font-mono text-lg font-bold text-slate-900"
          >
            {submission.reference_no}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(submission.created_at).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close response"
          onClick={onClose}
          className="rounded-lg border border-slate-200 p-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="divide-y divide-slate-100 px-5">
        {Object.entries(submission.data).map(([key, value]) => (
          <div key={key} className="py-4">
            <dt className="text-xs font-semibold text-slate-500">
              {submission.field_labels?.[key] ||
                fields.find((field) => field.id === key)?.label ||
                key}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">
              {typeof value === "string" &&
              /^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view$/.test(
                value,
              ) ? (
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 underline"
                >
                  Open document ↗
                </a>
              ) : Array.isArray(value) ? (
                value.join(", ")
              ) : value === true ? (
                "Yes"
              ) : value === false ? (
                "No"
              ) : (
                String(value ?? "—")
              )}
            </dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}

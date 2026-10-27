"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, FileText, X } from "lucide-react";
import { resolveFormMessages, type FormMessages } from "@/lib/forms/messages";

export default function FormInstructions({ messages, autoOpen = true, triggerLabel }: { messages?: Partial<FormMessages>; autoOpen?: boolean; triggerLabel?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(autoOpen);
  const id = useId(), copy = resolveFormMessages(messages);
  const notes = copy.popupNotes.split(/\n\s*\n/).filter(note => note.trim());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return (
    <div className="mb-4 flex justify-end">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        {triggerLabel || copy.viewInstructionsLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-content`}
        onClose={() => setOpen(false)}
        className="m-auto max-h-[90dvh] w-[92vw] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-amber-100 p-2.5 text-amber-700">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id={`${id}-title`} className="break-words text-lg font-bold">{copy.popupTitle}</h2>
              {copy.popupSubtitle && <p lang="ta" className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">{copy.popupSubtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close instructions"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div id={`${id}-content`} className="space-y-5 p-5 text-sm leading-relaxed sm:p-6">
          {(copy.submitEnglish || copy.submitTamil) && <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            {copy.submitEnglish && <p className="whitespace-pre-wrap break-words font-bold">{copy.submitEnglish}</p>}
            {copy.submitTamil && <p lang="ta" className="whitespace-pre-wrap break-words text-xs font-semibold leading-relaxed">{copy.submitTamil}</p>}
          </div>}
          {notes.length > 0 && <ul className="list-disc space-y-3 pl-5 text-slate-700 marker:text-neutral-600">
            {notes.map((note, index) => <li key={index} className="whitespace-pre-wrap break-words font-semibold">{note}</li>)}
          </ul>}
        </div>

        <div className="border-t border-slate-100 p-5 sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-xl bg-[#4d4d4d] px-4 py-3 text-sm font-bold text-white hover:bg-[#333333] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600"
          >
            {copy.continueButtonLabel}
          </button>
        </div>
      </dialog>
    </div>
  );
}

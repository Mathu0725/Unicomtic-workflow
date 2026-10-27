"use client";

import { useEffect, useRef } from "react";
import { Eye, Mail, X } from "lucide-react";

type Props = {
    open: boolean;
    onClose: () => void;
    recipient: { name: string; email: string };
    subject: string;
    body: string;
    actionLabel: string;
    actionUrl: string;
    description?: string;
};

export default function ReminderEmailPreview({ open, onClose, recipient, subject, body, actionLabel, actionUrl, description = "Personalized reminder" }: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const messageRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (!open) {
            if (dialog.open) dialog.close();
            return;
        }
        if (!dialog.open) dialog.showModal();
        if (messageRef.current) messageRef.current.scrollTop = 0;
        const content = document.getElementById("admin-page-content");
        const previousBodyOverflow = document.body.style.overflow;
        const previousContentOverflow = content?.style.overflow || "";
        document.body.style.overflow = "hidden";
        if (content) content.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousBodyOverflow;
            if (content) content.style.overflow = previousContentOverflow;
            if (dialog.open) dialog.close();
        };
    }, [open]);

    return (
        <dialog
            ref={dialogRef}
            id="reminder-email-preview-modal"
            aria-labelledby="reminder-email-preview-title"
            onClose={() => { if (!dialogRef.current?.open) onClose(); }}
            onClick={event => { if (event.target === event.currentTarget) onClose(); }}
            className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60"
        >
            <div className="flex max-h-[90dvh] flex-col">
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Mail className="h-5 w-5" aria-hidden="true" /></span>
                        <div><h2 id="reminder-email-preview-title" className="text-base font-bold">Email preview</h2><p className="mt-0.5 text-xs text-slate-500">{description}</p></div>
                    </div>
                    <button type="button" aria-label="Close email preview" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" aria-hidden="true" /></button>
                </div>
                <div ref={messageRef} role="region" aria-label="Email preview message" tabIndex={0} className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-100 sm:p-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">To</p><p className="mt-1 text-sm font-semibold">{recipient.name}</p><p className="mt-0.5 break-all text-xs text-slate-500">{recipient.email}</p></div>
                    <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subject</p>
                        <h3 className="mt-1 break-words border-b border-slate-100 pb-4 text-sm font-bold leading-relaxed">{subject}</h3>
                        <p className="whitespace-pre-wrap break-words pt-4 text-sm leading-relaxed text-slate-600">{body}</p>
                        {actionUrl && <div className="mt-5 border-t border-slate-100 pt-4"><p className="inline-block rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white">{actionLabel}</p><p className="mt-2 break-all text-[11px] text-slate-400">{actionUrl}</p></div>}
                    </div>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><Eye className="h-3.5 w-3.5" aria-hidden="true" />Preview only</span>
                    <button type="button" onClick={onClose} className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800">Close preview</button>
                </div>
            </div>
        </dialog>
    );
}

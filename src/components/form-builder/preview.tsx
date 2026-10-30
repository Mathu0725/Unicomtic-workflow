"use client";
import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone, X } from "lucide-react";
import type { FormEditorValues } from "@/lib/forms/editor";
import { defaultFormAnswers, visibleFormFields } from "@/lib/forms/field-rules";
import {
  resolveFormMessageDisplay,
  resolveFormMessages,
} from "@/lib/forms/messages";
import FormRichText from "@/components/form-rich-text";
import FormQuestion from "@/components/form-question";
import FormInstructions from "@/components/form-instructions";
import FormSubmitMessages from "@/components/form-submit-messages";
import { buttonClass } from "./controls";
import WorkshopSelection from "@/components/workshop-selection";
import { workshopOptions } from "@/lib/workshops/policy";
import type { Workshop } from "@/lib/data/store";

export default function FormPreview({
  values,
  workshops = [],
  campaignId,
  onClose,
}: {
  values: FormEditorValues;
  workshops?: (Workshop & { bookedCount?: number })[];
  campaignId?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [mobile, setMobile] = useState(false),
    [answers, setAnswers] = useState(defaultFormAnswers(values.fields));
  const visible = visibleFormFields(values.fields, answers),
    messages = resolveFormMessages(values.messages),
    display = resolveFormMessageDisplay(values.message_display);
  const sessions = workshopOptions(
    workshops,
    campaignId,
    values.workshop_config,
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="form-preview-title"
      className="m-auto h-[94dvh] w-[96vw] max-w-5xl overflow-hidden rounded-2xl border-0 bg-slate-100 p-0 shadow-2xl backdrop:bg-slate-950/60"
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4">
          <div>
            <h2 id="form-preview-title" className="text-sm font-bold">
              Applicant preview
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Includes your latest edits. Responses and uploads are disabled in
              preview.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Desktop preview"
              aria-pressed={!mobile}
              className={buttonClass}
              onClick={() => setMobile(false)}
            >
              <Monitor className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Mobile preview"
              aria-pressed={mobile}
              className={buttonClass}
              onClick={() => setMobile(true)}
            >
              <Smartphone className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Close preview"
              className={buttonClass}
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className={`mx-auto ${mobile ? "max-w-sm" : "max-w-2xl"}`}>
            <FormInstructions
              enabled={display.popup_enabled}
              messages={messages}
              autoOpen={false}
            />
            <div className="rounded-t-2xl bg-[#4d4d4d] p-6 text-white">
              <p className="mb-2 text-xs text-neutral-200">
                Unicom TIC Portal · Scholarship
              </p>
              <h1 className="text-2xl font-bold">
                {values.title || "Untitled form"}
              </h1>
              {values.description_rich ? (
                <FormRichText
                  content={values.description_rich}
                  className="mt-3 text-neutral-100"
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-100">
                  {values.description}
                </p>
              )}
            </div>
            <div className="space-y-6 rounded-b-2xl border border-slate-200 bg-white p-6">
              <div
                className={`grid grid-cols-1 gap-5 ${mobile ? "" : "sm:grid-cols-2"}`}
              >
                {values.fields
                  .filter((field) => visible.has(field.id))
                  .map((field) => (
                    <div
                      key={field.id}
                      className={
                        field.width === "half" &&
                        field.type !== "section" &&
                        !mobile
                          ? "min-w-0"
                          : mobile
                            ? "min-w-0"
                            : "min-w-0 sm:col-span-2"
                      }
                    >
                      <FormQuestion
                        field={field}
                        value={answers[field.id]}
                        onChange={(value) =>
                          setAnswers((current) => ({
                            ...current,
                            [field.id]: value,
                          }))
                        }
                      />
                    </div>
                  ))}
              </div>
              {values.workshop_config?.enabled && (
                <WorkshopSelection
                  config={values.workshop_config}
                  workshops={sessions}
                  value={String(answers.workshopId || "")}
                  onChange={(value) =>
                    setAnswers((current) => ({ ...current, workshopId: value }))
                  }
                />
              )}
              <button
                type="button"
                disabled
                className="w-full rounded-xl bg-[#4d4d4d] p-3.5 text-sm font-bold text-white opacity-60"
              >
                {messages.submitButtonLabel}
              </button>
              <FormSubmitMessages
                enabled={display.bottom_messages_enabled}
                messages={messages}
              />
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

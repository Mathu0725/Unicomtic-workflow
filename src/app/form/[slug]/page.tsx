"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import WorkshopSelection from "@/components/workshop-selection";
import FormInstructions from "@/components/form-instructions";
import FormSubmitMessages from "@/components/form-submit-messages";
import {
  resolveFormMessageDisplay,
  resolveFormMessages,
} from "@/lib/forms/messages";
import FormThankYou from "@/components/form-thank-you";
import DocumentUploadField from "@/components/document-upload-field";
import { submitRequest } from "@/lib/client/submit";
import { apiResponse, readJson, responseError } from "@/lib/client/api";
import SubmissionRecovery from "@/components/submission-recovery";
import {
  defaultFormAnswers,
  extraAnswerProblem,
  visibleFormFields,
} from "@/lib/forms/field-rules";
import FormQuestion from "@/components/form-question";
import FormRichText from "@/components/form-rich-text";
import type { FormField } from "@/lib/data/store";
import { emailValidationMessage } from "@/lib/validations/email";
import CandidateAccessGate from "@/components/candidate-access-gate";
import { formRequiresCandidateAccess } from "@/lib/forms/access";
import { CheckCircle2, AlertCircle, Loader2, Check } from "lucide-react";

export default function PublicCustomFormPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [form, setForm] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRequest = useRef<AbortController | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [documentReset, setDocumentReset] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    referenceNo?: string;
    confirmationMessage?: string;
    redirectUrl?: string;
  } | null>(null);
  const submissionInFlight = useRef(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [draftError, setDraftError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");

  useEffect(() => {
    if (!form?.workshopEnabled || submitted) return;
    let active = true,
      inFlight = false;
    const controller = new AbortController();
    const refreshChoices = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const response = await apiResponse(`/api/forms/${slug}`, {
          signal: controller.signal,
        });
        const result = await readJson(response);
        if (!active) return;
        if (result.form.version !== form.version) {
          setAvailabilityError(
            "This form changed. Use Refresh form & workshop availability to review the current questions.",
          );
          return;
        }
        setForm((current: any) =>
          current?.version === result.form.version
            ? { ...current, workshops: result.form.workshops }
            : current,
        );
        setAvailabilityError("");
      } catch {
        if (active)
          setAvailabilityError(
            "Workshop availability could not refresh. Your answers are preserved; seats are checked when you submit.",
          );
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => void refreshChoices(), 30000);
    window.addEventListener("focus", refreshChoices);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refreshChoices);
    };
  }, [slug, form?.version, form?.workshopEnabled, submitted]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setForm(null);
    setServerError(null);
    setFormData({});
    setErrors({});
    setSubmitted(null);
    setSubmitting(false);
    setUploading({});
    setRefreshing(false);
    setDraftRestored(false);
    setLastSaved(null);
    setDraftError("");
    apiResponse(`/api/forms/${slug}`, { signal: controller.signal })
      .then(readJson)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.success && data.form && Array.isArray(data.form.fields)) {
          // Initialize default values
          const defaults = defaultFormAnswers(data.form.fields);

          // Restore partially completed draft from localStorage if available
          let initialData: Record<string, any> = defaults;
          try {
            const savedDraft = localStorage.getItem(
              `unicom_form_draft_${slug}`,
            );
            if (savedDraft) {
              const saved = JSON.parse(savedDraft);
              const parsed = saved?.values
                ? saved.expires > Date.now()
                  ? saved.values
                  : null
                : saved;
              if (
                parsed &&
                typeof parsed === "object" &&
                Object.keys(parsed).length > 0
              ) {
                initialData = {
                  ...defaults,
                  ...Object.fromEntries(
                    Object.entries(parsed).filter(
                      ([id]) =>
                        (id === "workshopId" && data.form.workshopEnabled) ||
                        data.form.fields.some((f: any) => f.id === id),
                    ),
                  ),
                };
                data.form.fields
                  .filter((f: any) => f.type === "terms")
                  .forEach((f: any) => {
                    initialData[f.id] = false;
                  });
                setDraftRestored(true);
              }
            }
          } catch {
            setDraftError(
              "Draft storage is unavailable. Keep this page open until your submission is confirmed.",
            );
          }

          setFormData(initialData);
          setForm(data.form);
        } else {
          setServerError(data.message || "Form not found or has been closed.");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setServerError(e.message);
      })
      .finally(() => {
        // Strict Mode and slug changes cancel earlier loads. They must not
        // dismiss the loading screen while the current request is pending.
        if (!controller.signal.aborted) {
          setLoadedSlug(slug);
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
      refreshRequest.current?.abort();
    };
  }, [slug, loadAttempt]);

  const handleRefresh = async () => {
    refreshRequest.current?.abort();
    const controller = new AbortController();
    refreshRequest.current = controller;
    setRefreshing(true);
    try {
      const response = await apiResponse(`/api/forms/${slug}`, {
        signal: controller.signal,
      });
      const data = await readJson(response);
      if (controller.signal.aborted) return;
      if (!data.form || !Array.isArray(data.form.fields)) {
        throw new Error("The form could not be loaded. Please try again.");
      }
      const declarations = Object.fromEntries(
        data.form.fields
          .filter((f: any) => f.type === "terms")
          .map((f: any) => [f.id, false]),
      );
      const documents =
        data.form.version !== form?.version
          ? Object.fromEntries(
              data.form.fields
                .filter((field: any) => field.type === "file")
                .map((field: any) => [field.id, ""]),
            )
          : {};
      setFormData((current) => ({
        ...current,
        ...declarations,
        ...documents,
        ...(!data.form.workshopEnabled ? { workshopId: "" } : {}),
      }));
      setForm(data.form);
    } catch (e: any) {
      if (!controller.signal.aborted)
        setServerError(
          e.message || "The form could not be refreshed. Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  };

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [fieldId]: value };
      try {
        localStorage.setItem(
          `unicom_form_draft_${slug}`,
          JSON.stringify({ expires: Date.now() + 86400000, values: updated }),
        );
        setLastSaved(
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        );
      } catch {
        setLastSaved(null);
        setDraftError(
          "Draft could not be saved on this device. Your current answers remain on this page.",
        );
      }
      return updated;
    });

    if (errors[fieldId]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[fieldId];
        return copy;
      });
    }
  };

  const handleClearDraft = () => {
    if (submitting || Object.values(uploading).some(Boolean)) return;
    try {
      localStorage.removeItem(`unicom_form_draft_${slug}`);
    } catch {
      setDraftError("The saved draft could not be removed on this device.");
    }
    if (form) {
      const defaults = defaultFormAnswers(form.fields);
      setFormData(defaults);
      setDocumentReset((attempt) => attempt + 1);
      setDraftRestored(false);
      setLastSaved(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form ||
      submissionInFlight.current ||
      Object.values(uploading).some(Boolean)
    )
      return;
    const emailErrors: Record<string, string> = {};
    const visible = visibleFormFields(form.fields, formData);
    for (const field of form.fields as FormField[])
      if (visible.has(field.id)) {
        const problem = extraAnswerProblem(field, formData[field.id]);
        if (problem) emailErrors[field.id] = problem;
        if (
          (field.type === "email" ||
            field.systemKey === "email" ||
            field.id === "email") &&
          (field.required || formData[field.id])
        ) {
          const message = emailValidationMessage(formData[field.id]);
          if (message) emailErrors[field.id] = message;
        }
      }
    if (Object.keys(emailErrors).length) {
      setErrors(emailErrors);
      document
        .getElementById(`field-${Object.keys(emailErrors)[0]}`)
        ?.querySelector<HTMLElement>("input,textarea")
        ?.focus();
      return;
    }
    submissionInFlight.current = true;
    setSubmitting(true);
    setServerError(null);
    setErrors({});

    try {
      const res = await submitRequest(`/api/forms/${slug}`, {
        data: formData,
        workshopId: form.workshopEnabled
          ? formData.workshopId || undefined
          : undefined,
        expectedFormVersion: form.version,
      });

      const data = await readJson(res);
      if (!res.ok || !data.success) {
        if (data.errors) {
          setErrors(
            Object.fromEntries(
              Object.entries(data.fieldErrors || data.errors).map(
                ([key, messages]) => [
                  key,
                  Array.isArray(messages) ? messages[0] : String(messages),
                ],
              ),
            ),
          );
          const first = Object.keys(data.fieldErrors || data.errors)[0];
          if (first)
            document
              .getElementById(`field-${first}`)
              ?.querySelector<HTMLElement>("input,select,textarea,button")
              ?.focus();
        }
        setServerError(responseError(res, data).message);
        setSubmitting(false);
        return;
      }

      // Remove saved draft upon successful submission
      try {
        localStorage.removeItem(`unicom_form_draft_${slug}`);
      } catch (e) {}

      setSubmitted(data);
      setSubmitting(false);
    } catch (err: any) {
      setServerError(
        err.message ||
          "Could not confirm this submission. Resolve the original attempt before starting another.",
      );
      setSubmitting(false);
    } finally {
      submissionInFlight.current = false;
    }
  };

  if (loading || loadedSlug !== slug) {
    return (
      <div className="public-page min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">
            Loading form...
          </p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="public-page min-h-screen flex items-center justify-center p-4">
        <div className="public-card max-w-md w-full rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            Form Unavailable
          </h1>
          <p className="text-xs text-slate-500 mb-6">
            {serverError || "The form could not be loaded. Please try again."}
          </p>
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs shadow"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (submitted)
    return (
      <FormThankYou
        message={submitted.confirmationMessage || form.confirmationMessage}
        referenceNo={submitted.referenceNo}
        redirectUrl={submitted.redirectUrl}
      />
    );
  const messages = resolveFormMessages(form.messages);
  const messageDisplay = resolveFormMessageDisplay(form.message_display);

  const content = (
    <div className="public-page min-h-screen px-4 py-6 accent-blue-700 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {lastSaved && (
          <div className="mb-4 flex justify-end">
            <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full flex items-center gap-1">
              <Check className="w-3 h-3" /> Draft auto-saved at {lastSaved}
            </span>
          </div>
        )}

        <FormInstructions
          key={slug}
          messages={messages}
          enabled={messageDisplay.popup_enabled}
        />

        {/* Draft Notification Banner */}
        {draftError && (
          <p
            role="status"
            className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900"
          >
            {draftError}
          </p>
        )}
        {draftRestored && (
          <div className="mb-4 p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-neutral-600 flex-shrink-0" />
              <span className="whitespace-pre-wrap break-words">
                {messages.draftRestoredMessage}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearDraft}
              className="text-[11px] underline font-bold text-neutral-800 hover:text-neutral-950 cursor-pointer"
            >
              Reset Draft
            </button>
          </div>
        )}

        {/* Card Header */}
        <div className="overflow-hidden rounded-t-2xl border-t border-x border-slate-200 bg-[#142b49] text-white">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-neutral-200 bg-neutral-800/80 px-2.5 py-0.5 rounded-full border border-neutral-700">
                Unicom TIC Portal
              </span>
              <span className="text-xs text-neutral-300">Scholarship</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {form.title}
            </h1>
            {form.description_rich ? (
              <FormRichText
                content={form.description_rich}
                className="mt-3 text-neutral-100"
              />
            ) : (
              form.description && (
                <p className="text-neutral-100 text-xs sm:text-sm mt-2 leading-relaxed">
                  {form.description}
                </p>
              )
            )}
          </div>
        </div>

        {/* Form Fields */}
        <div className="rounded-b-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {serverError && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 text-xs">
            <button
              type="button"
              className="text-neutral-700 underline text-xs disabled:opacity-60"
              disabled={refreshing || submitting}
              onClick={handleRefresh}
            >
              {refreshing
                ? "Refreshing form..."
                : "Refresh form & workshop availability"}
            </button>
            <SubmissionRecovery
              url={`/api/forms/${slug}`}
              show={Boolean(serverError)}
              actionClassName="text-neutral-800"
              onResolved={(data) => {
                try {
                  localStorage.removeItem(`unicom_form_draft_${slug}`);
                } catch {}
                setSubmitted(data);
              }}
            />
            <div className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2">
              {(form.fields as FormField[])
                .filter((field) =>
                  visibleFormFields(form.fields, formData).has(field.id),
                )
                .map((field) => (
                  <div
                    id={`field-${field.id}`}
                    key={field.id}
                    className={
                      field.width === "half" && field.type !== "section"
                        ? "min-w-0"
                        : "min-w-0 sm:col-span-2"
                    }
                  >
                    <FormQuestion
                      field={field}
                      value={formData[field.id]}
                      onChange={(value) => handleInputChange(field.id, value)}
                      error={errors[field.id]}
                      disabled={submitting || refreshing}
                      upload={
                        field.type === "file" ? (
                          <DocumentUploadField
                            key={`${slug}:${field.id}:${form.version}:${documentReset}`}
                            slug={slug}
                            fieldId={field.id}
                            version={form.version}
                            label={field.label}
                            required={field.required}
                            ready={form.documentUploadsReady}
                            disabled={submitting || refreshing}
                            value={formData[field.id] || ""}
                            onChange={(receipt) =>
                              handleInputChange(field.id, receipt)
                            }
                            onBusyChange={(busy) =>
                              setUploading((current) => ({
                                ...current,
                                [field.id]: busy,
                              }))
                            }
                          />
                        ) : undefined
                      }
                    />
                  </div>
                ))}
            </div>

            {availabilityError && (
              <p role="status" className="text-sm text-amber-800">
                {availabilityError}
              </p>
            )}
            {form.workshopEnabled && (
              <WorkshopSelection
                config={{
                  ...form.workshopConfig,
                  enabled: true,
                  required: Boolean(form.workshopRequired),
                }}
                workshops={form.workshops || []}
                value={formData.workshopId || ""}
                onChange={(id) => handleInputChange("workshopId", id)}
              />
            )}
            {/* Submit & Save Notice */}
            <div className="pt-6 border-t border-slate-200 space-y-3">
              <button
                type="submit"
                disabled={
                  submitting ||
                  refreshing ||
                  Object.values(uploading).some(Boolean)
                }
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting Application... / சமர்ப்பிக்கப்படுகிறது...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    {messages.submitButtonLabel}
                  </>
                )}
              </button>

              <FormSubmitMessages
                messages={messages}
                enabled={messageDisplay.bottom_messages_enabled}
              />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
  return formRequiresCandidateAccess(form) ? (
    <CandidateAccessGate purpose="apply" formSlug={slug}>
      {content}
    </CandidateAccessGate>
  ) : form.type === "workshop_rsvp" ? (
    <CandidateAccessGate purpose="apply" formSlug={slug} optional>
      {content}
    </CandidateAccessGate>
  ) : (
    content
  );
}

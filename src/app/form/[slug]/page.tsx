"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import FormInstructions from "@/components/form-instructions";
import FormThankYou from "@/components/form-thank-you";
import DocumentUploadField from "@/components/document-upload-field";
import { submitRequest } from "@/lib/client/submit";
import { apiResponse, readJson, responseError } from "@/lib/client/api";
import SubmissionRecovery from "@/components/submission-recovery";
import { SRI_LANKA_DISTRICTS } from "@/lib/constants/sri-lanka-districts";
import { emailValidationMessage } from "@/lib/validations/email";
import CandidateAccessGate from "@/components/candidate-access-gate";
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Check,
} from "lucide-react";

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
  const [submitted, setSubmitted] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [draftError, setDraftError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setForm(null);
    setServerError(null);
    setFormData({});
    setErrors({});
    setSubmitted(false);
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
          const defaults: Record<string, any> = {};
          data.form.fields.forEach((f: any) => {
            if (f.type === "district") {
              defaults[f.id] = "Colombo";
            } else if (f.type === "select" && f.options && f.options.length > 0) {
              defaults[f.id] = f.options[0];
            } else if (f.type === "terms") {
              defaults[f.id] = false;
            } else {
              defaults[f.id] = "";
            }
          });

          // Restore partially completed draft from localStorage if available
          let initialData = defaults;
          try {
            const savedDraft = localStorage.getItem(`unicom_form_draft_${slug}`);
            if (savedDraft) {
              const saved = JSON.parse(savedDraft);
              const parsed = saved?.values ? saved.expires > Date.now() ? saved.values : null : saved;
              if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
                initialData = { ...defaults, ...Object.fromEntries(Object.entries(parsed).filter(([id]) => id === "workshopId" || data.form.fields.some((f: any) => f.id === id))) };
                data.form.fields.filter((f: any) => f.type === "terms").forEach((f: any) => { initialData[f.id] = false; });
                setDraftRestored(true);
              }
            }
          } catch { setDraftError("Draft storage is unavailable. Keep this page open until your submission is confirmed."); }

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
      const response = await apiResponse(`/api/forms/${slug}`, { signal: controller.signal });
      const data = await readJson(response);
      if (controller.signal.aborted) return;
      if (!data.form || !Array.isArray(data.form.fields)) {
        throw new Error("The form could not be loaded. Please try again.");
      }
      const declarations = Object.fromEntries(data.form.fields.filter((f: any) => f.type === "terms").map((f: any) => [f.id, false]));
      const documents = data.form.version !== form?.version ? Object.fromEntries(data.form.fields.filter((field: any) => field.type === "file").map((field: any) => [field.id, ""])) : {};
      setFormData(current => ({ ...current, ...declarations, ...documents }));
      setForm(data.form);
    } catch (e: any) {
      if (!controller.signal.aborted) setServerError(e.message || "The form could not be refreshed. Please try again.");
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  };

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [fieldId]: value };
      try {
        localStorage.setItem(`unicom_form_draft_${slug}`, JSON.stringify({ expires: Date.now() + 86400000, values: updated }));
        setLastSaved(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      } catch { setLastSaved(null); setDraftError("Draft could not be saved on this device. Your current answers remain on this page."); }
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
    } catch { setDraftError("The saved draft could not be removed on this device."); }
    if (form) {
      const defaults: Record<string, any> = {};
      form.fields.forEach((f: any) => {
        if (f.type === "district") defaults[f.id] = "Colombo";
        else if (f.type === "select" && f.options?.length) defaults[f.id] = f.options[0];
        else if (f.type === "terms") defaults[f.id] = false;
        else defaults[f.id] = "";
      });
      setFormData(defaults);
      setDocumentReset(attempt => attempt + 1);
      setDraftRestored(false);
      setLastSaved(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || Object.values(uploading).some(Boolean)) return;
    const emailErrors: Record<string, string> = {};
    for (const field of form.fields) if ((field.type === "email" || field.systemKey === "email" || field.id === "email") && (field.required || formData[field.id])) {
      const message = emailValidationMessage(formData[field.id]);
      if (message) emailErrors[field.id] = message;
    }
    if (Object.keys(emailErrors).length) {
      setErrors(emailErrors);
      document.getElementById(`field-${Object.keys(emailErrors)[0]}`)?.querySelector<HTMLElement>("input,textarea")?.focus();
      return;
    }
    setSubmitting(true);
    setServerError(null);
    setErrors({});

    try {
      const res = await submitRequest(`/api/forms/${slug}`, { data: formData, workshopId: formData.workshopId || undefined, expectedFormVersion: form.version });

      const data = await readJson(res);
      if (!res.ok || !data.success) {
        if (data.errors) {
          setErrors(Object.fromEntries(Object.entries(data.fieldErrors || data.errors).map(([key, messages]) => [key, Array.isArray(messages) ? messages[0] : String(messages)])));
          const first = Object.keys(data.fieldErrors || data.errors)[0];
          if (first) document.getElementById(`field-${first}`)?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
        }
        setServerError(responseError(res, data).message);
        setSubmitting(false);
        return;
      }

      // Remove saved draft upon successful submission
      try {
        localStorage.removeItem(`unicom_form_draft_${slug}`);
      } catch (e) {}

      setSubmitted(true);
      setSubmitting(false);
    } catch (err: any) {
      setServerError(err.message || "Could not confirm this submission. Resolve the original attempt before starting another.");
      setSubmitting(false);
    }
  };

  if (loading || loadedSlug !== slug) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Form Unavailable</h1>
          <p className="text-xs text-slate-500 mb-6">{serverError || "The form could not be loaded. Please try again."}</p>
          <button
            type="button"
            onClick={() => setLoadAttempt(attempt => attempt + 1)}
            className="px-5 py-2.5 rounded-xl bg-[#4d4d4d] hover:bg-[#333333] text-white font-bold text-xs shadow"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (submitted) return <FormThankYou />;

  const content = (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8 accent-[#4d4d4d]">
      <div className="max-w-2xl mx-auto">
        {lastSaved && (
          <div className="mb-4 flex justify-end">
            <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full flex items-center gap-1">
              <Check className="w-3 h-3" /> Draft auto-saved at {lastSaved}
            </span>
          </div>
        )}

        <FormInstructions key={slug} />

        {/* Draft Notification Banner */}
        {draftError && <p role="status" className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900">{draftError}</p>}
        {draftRestored && (
          <div className="mb-4 p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-neutral-600 flex-shrink-0" />
              <span>
                Partially completed Application Form restored. (முழுமையாக பூர்த்தி செய்யப்படாத விண்ணப்பப் படிவம் மீளமைக்கப்பட்டது).
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
        <div className="overflow-hidden rounded-t-2xl border-t border-x border-slate-200 bg-[#4d4d4d] text-white">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-neutral-200 bg-neutral-800/80 px-2.5 py-0.5 rounded-full border border-neutral-700">
                Unicom TIC Portal
              </span>
              <span className="text-xs text-neutral-300">
                Scholarship Intake 2025
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{form.title}</h1>
            {form.description && (
              <p className="text-neutral-100 text-xs sm:text-sm mt-2 leading-relaxed">{form.description}</p>
            )}
          </div>
        </div>

        {/* Form Fields */}
        <div className="bg-white rounded-b-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          {serverError && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 text-xs">
            <button type="button" className="text-neutral-700 underline text-xs disabled:opacity-60" disabled={refreshing || submitting} onClick={handleRefresh}>
              {refreshing ? "Refreshing form..." : "Refresh form & workshop availability"}
            </button>
            <SubmissionRecovery url={`/api/forms/${slug}`} show={Boolean(serverError)} actionClassName="text-neutral-800" onResolved={() => { try { localStorage.removeItem(`unicom_form_draft_${slug}`); } catch { } setSubmitted(true); }} />
            {form.fields.map((field: any, index: number) => {
              const hasError = errors[field.id];

              return (
                <div id={`field-${field.id}`} key={field.id} className="space-y-1.5">
                  {/* Label */}
                  {field.type !== "terms" && (
                    <label htmlFor={field.type === "email" ? `email-input-${field.id}` : undefined} className="block font-bold text-slate-900 text-xs sm:text-sm leading-snug">
                      {field.label} {field.required && <span className="text-red-600">*</span>}
                    </label>
                  )}

                  {/* Field Renders */}
                  {field.type === "file" && <DocumentUploadField key={`${slug}:${field.id}:${form.version}:${documentReset}`} slug={slug} fieldId={field.id} version={form.version} label={field.label} required={field.required} ready={form.documentUploadsReady} disabled={submitting || refreshing} value={formData[field.id] || ""} onChange={receipt => handleInputChange(field.id, receipt)} onBusyChange={busy => setUploading(current => ({ ...current, [field.id]: busy }))} />}
                  {field.type === "text" && (
                    <input
                      type="text"
                      required={field.required}
                      placeholder={field.placeholder || ""}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-neutral-500 focus:outline-none bg-slate-50/50 hover:bg-white transition"
                    />
                  )}

                  {field.type === "number" && (
                    <input
                      type="number"
                      required={field.required}
                      placeholder={field.placeholder || ""}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-neutral-500 focus:outline-none bg-slate-50/50 hover:bg-white transition"
                    />
                  )}

                  {field.type === "textarea" && (
                    <textarea
                      rows={field.id === "whySoftwareDev" || field.id === "greatestAccomplishment" ? 5 : 3}
                      required={field.required}
                      placeholder={field.placeholder || ""}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-neutral-500 focus:outline-none leading-relaxed bg-slate-50/50 hover:bg-white transition"
                    />
                  )}

                  {field.type === "email" && (
                    <input
                      id={`email-input-${field.id}`}
                      type="email"
                      maxLength={254}
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      required={field.required}
                      placeholder={field.placeholder || "name@example.lk"}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      onBlur={(event) => { const value = event.target.value; if (value.trim()) { const message = emailValidationMessage(value); if (message) setErrors(current => ({ ...current, [field.id]: message })); } }}
                      aria-invalid={Boolean(hasError)}
                      aria-describedby={hasError ? `field-error-${field.id}` : undefined}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-neutral-500 focus:outline-none bg-slate-50/50 hover:bg-white transition"
                    />
                  )}

                  {field.type === "phone" && (
                    <input
                      type="tel"
                      required={field.required}
                      placeholder={field.placeholder || "0771234567"}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-neutral-500 focus:outline-none font-mono bg-slate-50/50 hover:bg-white transition"
                    />
                  )}

                  {field.type === "nic" && (
                    <input
                      type="text"
                      required={field.required}
                      placeholder={field.placeholder || "200112304567 or 991234567V"}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-neutral-500 focus:outline-none uppercase font-mono bg-slate-50/50 hover:bg-white transition"
                    />
                  )}

                  {field.type === "district" && (
                    <select
                      value={formData[field.id] || "Jaffna"}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-neutral-500 focus:outline-none"
                    >
                      {SRI_LANKA_DISTRICTS.map((d) => (
                        <option key={d.name} value={d.name}>
                          {d.name} ({d.province} Province)
                        </option>
                      ))}
                    </select>
                  )}

                  {field.type === "select" && (
                    <select
                      value={formData[field.id] || (field.options && field.options[0]) || ""}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-neutral-500 focus:outline-none"
                    >
                      {(field.options || []).map((opt: string, i: number) => (
                        <option key={i} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}

                  {field.type === "radio" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {(field.options || []).map((opt: string) => {
                        const isSelected = formData[field.id] === opt;
                        return (
                          <label
                            key={opt}
                            onClick={() => handleInputChange(field.id, opt)}
                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition select-none ${
                              isSelected
                                ? "bg-neutral-50 border-neutral-600 text-neutral-900 ring-1 ring-neutral-500 shadow-2xs"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name={field.id}
                              value={opt}
                              checked={isSelected}
                              onChange={() => handleInputChange(field.id, opt)}
                              className="text-neutral-600 focus:ring-neutral-500 h-4 w-4"
                            />
                            <span className="truncate">{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {field.type === "date" && (
                    <input
                      type="date"
                      required={field.required}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-neutral-500 focus:outline-none bg-slate-50/50 hover:bg-white transition"
                    />
                  )}

                  {field.type === "terms" && (
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 mt-2">
                      <label className="flex items-start gap-2.5 cursor-pointer text-slate-700 leading-relaxed font-medium">
                        <input
                          type="checkbox"
                          required={field.required}
                          checked={Boolean(formData[field.id])}
                          onChange={(e) => handleInputChange(field.id, e.target.checked)}
                          className="mt-0.5 rounded border-slate-300 text-neutral-600 focus:ring-neutral-500"
                        />
                        <span>{field.label}</span>
                      </label>
                    </div>
                  )}

                  {hasError && (
                    <p id={`field-error-${field.id}`} role="alert" className="text-red-600 text-[11px] font-semibold mt-1">{hasError}</p>
                  )}
                </div>
              );
            })}

            {form.workshopEnabled && <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-2">
              <label className="block font-bold text-sm" htmlFor="selected-workshop">Select your workshop {form.workshopRequired && "*"}</label>
              <select id="selected-workshop" required={form.workshopRequired} value={formData.workshopId || ""} onChange={e => handleInputChange("workshopId", e.target.value)} className="w-full border border-slate-300 rounded-lg p-3 bg-white text-sm">
                <option value="">Choose a workshop</option>
                {(form.workshops || []).map((w: any) => <option key={w.id} value={w.id} disabled={w.remaining === 0}>{w.title} · {new Date(w.start_time).toLocaleString()} · {w.venue} · {w.remaining === null ? "Open" : `${w.remaining} seats left`}</option>)}
              </select>
              {!form.workshops?.length && <p className="text-xs text-amber-800">No bookable workshops are available. Please contact admissions{form.workshopRequired ? " before submitting" : " or choose later"}.</p>}
              <p className="text-xs text-slate-500">Your seat is reserved when the complete application is accepted.</p>
            </div>}
            {/* Submit & Save Notice */}
            <div className="pt-6 border-t border-slate-200 space-y-3">
              <button
                type="submit"
                disabled={submitting || refreshing || Object.values(uploading).some(Boolean)}
                className="w-full py-4 px-6 rounded-xl bg-[#4d4d4d] hover:bg-[#333333] text-white font-extrabold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting Application... / சமர்ப்பிக்கப்படுகிறது...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Apply / விண்ணப்பிக்கவும்
                  </>
                )}
              </button>

              <div className="text-center space-y-1">
                <p className="text-[11px] text-slate-600 font-semibold">
                  Press apply at the bottom of the page to complete the application.
                </p>
                <p className="text-[11px] text-slate-500">
                  விண்ணப்பத்தை பூர்த்தி செய்ய இப்பக்கத்தின் கீழே உள்ள <strong>apply</strong> என்பதை அழுத்தவும்.
                </p>
                <p className="text-[10px] text-slate-400 pt-1">
                  Partially completed Application Form is saved automatically. (முழுமையாக பூர்த்தி செய்யப்படாத விண்ணப்பப் படிவத்தை சேமித்து பின்னர் தொடரலாம்).
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
  return ["application", "workshop_rsvp"].includes(form.type)
    ? <CandidateAccessGate purpose="apply" formSlug={slug}>{content}</CandidateAccessGate>
    : content;
}

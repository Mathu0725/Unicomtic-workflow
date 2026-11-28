"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Workshop } from "@/lib/data/store";
import { api, buttonClass, inputClass, Notice } from "./live-data";
import { submitRequest, pendingPayload } from "@/lib/client/submit";
import { readJson, responseError } from "@/lib/client/api";
import SubmissionRecovery from "./submission-recovery";
const local = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
type FormChoice = { id: string; title: string; slug: string; campaignId?: string; updatedAt: string; draftVersion: string | null; status: string };
export type WorkshopAttachmentResult = { id: string; title: string; slug: string; live: boolean };
export default function WorkshopEditor({
  workshop: initialWorkshop,
  duplicate = false,
  campaignId,
  campaigns = [],
  communicationsOnly = false,
  allowAttachments = false,
  onSaved,
  onCancel,
}: {
  workshop?: Workshop;
  duplicate?: boolean;
  campaignId?: string;
  campaigns?: { id: string; title: string }[];
  communicationsOnly?: boolean;
  allowAttachments?: boolean;
  onSaved: (w: Workshop, attachments?: WorkshopAttachmentResult[]) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [workshop] = useState(initialWorkshop);
  const editing = Boolean(workshop && !duplicate);
  const [draft, setDraft] = useState(() => ({
    campaignId: workshop?.campaign_id || campaignId || campaigns[0]?.id || "",
    title: workshop ? workshop.title + (duplicate ? " (Copy)" : "") : "",
    venue: workshop?.venue || "",
    address: workshop?.address || "",
    description: workshop?.description || "",
    googleMapsUrl: workshop?.google_maps_url || "",
    startTime: duplicate ? "" : local(workshop?.start_time),
    endTime: duplicate ? "" : local(workshop?.end_time),
    bookingDeadline: duplicate ? "" : local(workshop?.booking_deadline),
    capacity: String(workshop?.capacity || 50),
    days: (workshop?.reminder_schedule.days_before || [3, 1]).join(", "),
    remindersEnabled: workshop?.reminders_enabled !== false,
    confirmationEnabled: workshop?.confirmation_enabled !== false,
    reminderTemplate: workshop?.reminder_template || "workshop_reminder",
    confirmationTemplate: workshop?.confirmation_template || "workshop_booking",
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [attemptId] = useState(() => crypto.randomUUID());
  const lock = useRef(false),
    endpoint = "/api/admin/workshops";
  const [options, setOptions] = useState<{ forms: FormChoice[]; templates: { id: string; title: string }[] }>({ forms: [], templates: [] });
  const [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    api("/api/admin/workshops/options", undefined, "GET", controller.signal).then(data => {
      if (!controller.signal.aborted) { setOptions(data); setOptionsError(""); }
    }).catch((cause: Error) => { if (!controller.signal.aborted) setOptionsError(cause.message); }).finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [optionsAttempt]);
  function payload() {
    if (!draft.startTime || !draft.endTime || !Number.isFinite(Date.parse(draft.startTime)) || !Number.isFinite(Date.parse(draft.endTime)))
      throw new Error("Choose a valid start date/time and end date/time before saving or previewing.");
    const days = draft.days.trim() ? draft.days.split(",").map(s => Number(s.trim())) : [];
    if (days.some(n => !Number.isInteger(n) || n < 1 || n > 90)) throw new Error("Enter reminder days as whole numbers from 1 to 90, separated by commas.");
    return { ...draft, clientAttemptId: attemptId, capacity: Number(draft.capacity), daysBeforeReminders: days,
      startTime: editing && draft.startTime === local(workshop?.start_time) ? workshop!.start_time : new Date(draft.startTime).toISOString(),
      endTime: editing && draft.endTime === local(workshop?.end_time) ? workshop!.end_time : new Date(draft.endTime).toISOString(),
      bookingDeadline: editing && draft.bookingDeadline === local(workshop?.booking_deadline) ? workshop?.booking_deadline || "" : draft.bookingDeadline ? new Date(draft.bookingDeadline).toISOString() : "",
    };
  }
  async function emailAction(action: "preview" | "duplicate") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await api("/api/admin/workshops/options", action === "preview"
        ? { action, workshop: payload() } : { action, templateId: draft.confirmationTemplate });
      if (action === "preview") setPreview(result.message);
      else {
        update("confirmationTemplate", result.templateId);
        setOptionsAttempt(value => value + 1);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare the email."); }
    finally { setBusy(false); lock.current = false; }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const values = payload();
      const saveOnly = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "only";
      const attachments = !editing && allowAttachments && !saveOnly ? options.forms.filter(f => f.campaignId === draft.campaignId && selectedForms.includes(f.id)).map(f => ({ formId: f.id, expectedUpdatedAt: f.updatedAt, expectedDraftVersion: f.draftVersion })) : [];
      let result;
      if (editing)
        result = await api(
          endpoint,
          {
            ...values,
            id: workshop!.id,
            expectedVersion: workshop!.updated_at || workshop!.created_at,
          },
          "PATCH",
        );
      else {
        const response = await submitRequest(endpoint, { ...values, attachments });
        result = await readJson(response);
        if (!response.ok || !result.success)
          throw responseError(response, result);
      }
      await onSaved(result.workshop, result.attachedForms);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save workshop.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const update = (key: string, value: string | boolean) => {
    setPreview(null);
    if (key === "campaignId") setSelectedForms([]);
    setDraft((s) => ({ ...s, [key]: value }));
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <h2 className="text-lg font-bold">
        {communicationsOnly
          ? "Email settings for this workshop"
          : editing
            ? "Edit workshop"
            : "Create workshop"}
      </h2>
      <Notice error>{error}</Notice>
      {!editing && (
        <SubmissionRecovery
          url={endpoint}
          show={Boolean(error || pendingPayload(endpoint))}
          onResolved={(result) => void onSaved(result.workshop, result.attachedForms)}
        />
      )}
      <fieldset disabled={busy} className="space-y-4">
        {!communicationsOnly && (
          <div className="grid gap-4 sm:grid-cols-2">
            {!campaignId && campaigns.length > 0 && (
              <label className="text-sm font-semibold">
                Intake
                <select
                  className={inputClass}
                  value={draft.campaignId}
                  onChange={(e) => update("campaignId", e.target.value)}
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(
              [
                ["title", "Workshop title", "text"],
                ["venue", "Venue", "text"],
                ["address", "Full address", "text"],
                ["startTime", "Starts (your local time)", "datetime-local"],
                ["endTime", "Ends (your local time)", "datetime-local"],
                ["capacity", "Total seats", "number"],
                [
                  "bookingDeadline",
                  "Booking deadline (optional)",
                  "datetime-local",
                ],
                ["googleMapsUrl", "Google Maps link", "url"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key} className="text-sm font-semibold">
                {label}
                <input
                  className={inputClass}
                  type={type}
                  min={type === "number" ? 1 : undefined}
                  max={type === "number" ? 100000 : undefined}
                  required={key === "googleMapsUrl" ? selectedForms.length > 0 : key !== "bookingDeadline"}
                  placeholder={key === "googleMapsUrl" ? "https://maps.app.goo.gl/…" : undefined}
                  value={draft[key]}
                  onChange={(e) => update(key, e.target.value)}
                />
              </label>
            ))}
            <label className="text-sm font-semibold sm:col-span-2">
              Description
              <textarea
                className={inputClass}
                value={draft.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </label>
          </div>
        )}
        <details
          open={communicationsOnly || undefined}
          className="rounded-lg border p-3"
        >
          <summary className="cursor-pointer text-sm font-semibold">
            Confirmation & reminder settings
          </summary>
          <div className="mt-4 space-y-3 text-sm">
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={draft.confirmationEnabled}
                onChange={(e) =>
                  update("confirmationEnabled", e.target.checked)
                }
              />
              Send a confirmation for each new workshop booking
            </label>
            <label className="block">
              Confirmation template
              <select
                className={inputClass}
                value={draft.confirmationTemplate}
                onChange={(e) => update("confirmationTemplate", e.target.value)}
              >
                {(options.templates.length ? options.templates : [{ id: "workshop_booking", title: "Workshop booking confirmation" }, { id: "workshop_update", title: "Workshop details update" }]).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                {draft.confirmationTemplate.startsWith("custom:") && !options.templates.some(t => t.id === draft.confirmationTemplate) && <option value={draft.confirmationTemplate}>Selected template unavailable — choose another</option>}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="rounded-lg border px-3 py-2 font-semibold" onClick={() => void emailAction("preview")}>Preview with this workshop</button>
              <button type="button" className="rounded-lg border px-3 py-2 font-semibold" onClick={() => void emailAction("duplicate")}>Duplicate as my template</button>
              <Link target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline" href={draft.confirmationTemplate.startsWith("custom:") ? `/admin/email/reusable-templates?template=${encodeURIComponent(draft.confirmationTemplate.slice(7))}` : "/admin/email/templates"}>Edit selected template ↗</Link>
            </div>
            <p className="text-xs text-slate-500">Duplicate a shared template to change wording for this workshop. Save the edited template, then refresh templates here.</p>
            <button type="button" className="text-xs font-semibold text-blue-700 underline" onClick={() => { setOptionsAttempt(n => n + 1); setPreview(null); }}>Refresh templates & forms</button>
            {preview && <div className="space-y-2 rounded-lg border bg-white p-3"><p className="font-semibold">{preview.subject}</p><p className="text-xs text-slate-500">Sample student · No email is sent by this preview.</p><iframe title="Workshop confirmation email preview" sandbox="" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">${preview.html}`} className="h-72 w-full rounded-lg border" /></div>}
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={draft.remindersEnabled}
                onChange={(e) => update("remindersEnabled", e.target.checked)}
              />
              Automatic reminder emails
            </label>
            <label className="block">
              Days before workshop (e.g. 3, 1)
              <input
                className={inputClass}
                value={draft.days}
                onChange={(e) => update("days", e.target.value)}
              />
            </label>
            <label className="block">
              Reminder template
              <select
                className={inputClass}
                value={draft.reminderTemplate}
                onChange={(e) => update("reminderTemplate", e.target.value)}
              >
                <option value="workshop_reminder">Workshop reminder</option>
                <option value="workshop_update">Workshop details update</option>
              </select>
            </label>
            <p className="text-xs text-slate-600">
              Workshop RSVP forms send one booking confirmation by default. In Builder → Workshop settings, enable “Also send the form receipt email” to send two. Registration and application receipts use their own form settings.
            </p>
            <Link
              href="/admin/email/templates"
              className="font-semibold text-blue-700 underline"
            >
              Edit shared template wording
            </Link>
            <p className="text-xs text-slate-500">
              Editing a shared template changes future messages for every
              workshop using it.
            </p>
          </div>
        </details>
        <Notice error>{optionsError}</Notice>
        {!editing && allowAttachments && <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <h3 className="font-semibold">Show in forms</h3>
          <p className="text-sm text-slate-600">Select forms from this intake. Live forms show the workshop immediately; closed or draft forms receive a saved draft attachment.</p>
          {options.forms.filter(f => f.campaignId === draft.campaignId).map(f => <label key={f.id} className="flex items-start gap-3 rounded-lg border bg-white p-3 text-sm"><input type="checkbox" className="mt-1" checked={selectedForms.includes(f.id)} onChange={e => setSelectedForms(ids => e.target.checked ? [...ids, f.id] : ids.filter(id => id !== f.id))} /><span><strong>{f.title}</strong><span className="block text-xs text-slate-500">{f.status === "Live" ? "Will appear immediately" : `${f.status} · attach to draft`}</span></span></label>)}
          {optionsLoading ? <p role="status" className="text-sm text-slate-600">Loading forms…</p> : !options.forms.some(f => f.campaignId === draft.campaignId) && <p className="text-sm text-slate-600">No forms available for this intake. You can save the workshop and attach it later.</p>}
          <button type="button" className="text-sm font-semibold text-blue-700 underline" onClick={() => setOptionsAttempt(n => n + 1)}>Refresh form list</button>
        </section>}
        <div className="flex gap-3">
          <button className={buttonClass} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save workshop" : selectedForms.length ? "Create & show on selected forms" : "Save workshop only"}
          </button>
          {!editing && selectedForms.length > 0 && <button type="submit" value="only" formNoValidate className="rounded-lg border px-3 py-2 text-sm">Save without attaching</button>}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm underline"
            >
              Cancel
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

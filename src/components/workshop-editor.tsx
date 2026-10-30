"use client";
import { useRef, useState } from "react";
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
export default function WorkshopEditor({
  workshop: initialWorkshop,
  duplicate = false,
  campaignId,
  campaigns = [],
  communicationsOnly = false,
  onSaved,
  onCancel,
}: {
  workshop?: Workshop;
  duplicate?: boolean;
  campaignId?: string;
  campaigns?: { id: string; title: string }[];
  communicationsOnly?: boolean;
  onSaved: (w: Workshop) => void | Promise<void>;
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
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const days = draft.days.trim()
        ? draft.days.split(",").map((s) => Number(s.trim()))
        : [];
      if (days.some((n) => !Number.isInteger(n) || n < 1 || n > 90))
        throw new Error(
          "Enter reminder days as whole numbers from 1 to 90, separated by commas.",
        );
      const payload = {
        ...draft,
        clientAttemptId: attemptId,
        capacity: Number(draft.capacity),
        daysBeforeReminders: days,
        startTime:
          editing && draft.startTime === local(workshop?.start_time)
            ? workshop!.start_time
            : new Date(draft.startTime).toISOString(),
        endTime:
          editing && draft.endTime === local(workshop?.end_time)
            ? workshop!.end_time
            : new Date(draft.endTime).toISOString(),
        bookingDeadline:
          editing && draft.bookingDeadline === local(workshop?.booking_deadline)
            ? workshop?.booking_deadline || ""
            : draft.bookingDeadline
              ? new Date(draft.bookingDeadline).toISOString()
              : "",
      };
      let result;
      if (editing)
        result = await api(
          endpoint,
          {
            ...payload,
            id: workshop!.id,
            expectedVersion: workshop!.updated_at || workshop!.created_at,
          },
          "PATCH",
        );
      else {
        const response = await submitRequest(endpoint, payload);
        result = await readJson(response);
        if (!response.ok || !result.success)
          throw responseError(response, result);
      }
      await onSaved(result.workshop);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save workshop.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const update = (key: string, value: string | boolean) =>
    setDraft((s) => ({ ...s, [key]: value }));
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
          onResolved={(result) => void onSaved(result.workshop)}
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
                ["googleMapsUrl", "Location link (optional)", "url"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key} className="text-sm font-semibold">
                {label}
                <input
                  className={inputClass}
                  type={type}
                  min={type === "number" ? 1 : undefined}
                  max={type === "number" ? 100000 : undefined}
                  required={!["bookingDeadline", "googleMapsUrl"].includes(key)}
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
                <option value="workshop_booking">
                  Workshop booking confirmation
                </option>
                <option value="workshop_update">Workshop details update</option>
              </select>
            </label>
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
              Closing new bookings keeps reminders enabled for existing
              participants. Form receipt emails are a separate choice in the
              form's Email settings.
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
        <div className="flex gap-3">
          <button className={buttonClass} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save workshop" : "Create workshop"}
          </button>
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

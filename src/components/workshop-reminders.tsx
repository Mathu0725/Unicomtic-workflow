"use client";
import { useRef, useState } from "react";
import type { workshopDetail } from "@/lib/workshops/management";
import type { workshopMailPreview } from "@/lib/workshops/notifications";
import WorkshopEditor from "./workshop-editor";
import { api, buttonClass, inputClass, Notice } from "./live-data";
import { pendingPayload, submitRequest } from "@/lib/client/submit";
import { readJson, responseError } from "@/lib/client/api";
import SubmissionRecovery from "./submission-recovery";
type Preview = ReturnType<typeof workshopMailPreview>;
export default function WorkshopReminders({
  workshop,
  onChanged,
}: {
  workshop: ReturnType<typeof workshopDetail>;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [kind, setKind] = useState<"manual" | "update">("manual"),
    [preview, setPreview] = useState<Preview | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    endpoint =
      "/api/admin/workshops/" + encodeURIComponent(workshop.id) + "/reminders";
  async function load() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const p = await api(endpoint + "?kind=" + kind, undefined, "GET");
      setPreview(p);
      setSelected(p.recipients.map((r: Preview["recipients"][number]) => r.id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not preview recipients.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function send() {
    if (!preview || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await submitRequest(endpoint, {
        kind: preview.kind,
        operationId: preview.operationId,
        expiresAt: preview.expiresAt,
        recipients: preview.recipients
          .filter((r) => selected.includes(r.id))
          .map((r) => ({ id: r.id, token: r.token })),
      });
      const result = await readJson(response);
      if (!response.ok || !result.success)
        throw responseError(response, result);
      setMessage(result.message);
      setPreview(null);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not queue reminders.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <div className="space-y-5">
      <Notice error>{error}</Notice>
      <Notice>{message}</Notice>
      <SubmissionRecovery
        url={endpoint}
        show={Boolean(error || pendingPayload(endpoint))}
        onResolved={(r) => {
          setMessage(r.message);
          setPreview(null);
          void onChanged();
        }}
      />
      <div className="rounded-xl border p-4">
        <h2 className="font-bold">Automatic emails for {workshop.title}</h2>
        <p className="mt-2 text-sm">
          Booking confirmation:{" "}
          {workshop.confirmation_enabled === false ? "Off" : "On"} · Reminders:{" "}
          {workshop.reminders_enabled === false ? "Off" : "On"}
        </p>
        <p className="mt-1 text-sm">
          Days before:{" "}
          {workshop.reminder_schedule.days_before.join(", ") || "None"} ·
          Template: {workshop.reminder_template || "workshop_reminder"}
        </p>
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-blue-700 underline"
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Close settings" : "Edit email settings"}
        </button>
        {editing && (
          <div className="mt-4">
            <WorkshopEditor
              workshop={workshop}
              communicationsOnly
              onCancel={() => setEditing(false)}
              onSaved={async () => {
                setEditing(false);
                setPreview(null);
                setMessage("Email settings saved for this workshop.");
                await onChanged();
              }}
            />
          </div>
        )}
      </div>
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-bold">Send to this workshop's participants</h2>
        <p className="text-sm text-slate-600">
          Preview the exact message and confirmed recipients. Cancelled and
          moved bookings are excluded.
        </p>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            Message
            <select
              className={inputClass}
              disabled={busy}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                setPreview(null);
              }}
            >
              <option value="manual">Workshop reminder</option>
              <option value="update">Date / venue update</option>
            </select>
          </label>
          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => void load()}
          >
            Preview recipients
          </button>
        </div>
        {preview && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">
              {selected.length} of {preview.recipients.length} eligible
              participants selected · Preview expires{" "}
              {new Date(preview.expiresAt).toLocaleTimeString()}
            </p>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                disabled={busy}
                checked={
                  selected.length === preview.recipients.length &&
                  selected.length > 0
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? preview.recipients.map((r) => r.id) : [],
                  )
                }
              />
              Select all
            </label>
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {preview.recipients.map((r) => (
                <div key={r.id} className="rounded-lg border p-3 text-sm">
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={selected.includes(r.id)}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, r.id]
                            : ids.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <span>
                      {r.name} · {r.email} · {r.phone}
                    </span>
                  </label>
                  {r.recent && (
                    <p className="mt-1 text-xs text-amber-800">
                      A message was queued or sent to this booking in the last
                      24 hours. This will be a new email.
                    </p>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-blue-700">
                      Read message
                    </summary>
                    <strong>{r.subject}</strong>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-xs">
                      {r.text}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
            <button
              disabled={busy || !selected.length}
              className={buttonClass}
              onClick={() => void send()}
            >
              {busy
                ? "Queuing…"
                : "Send to " + selected.length + " selected participants"}
            </button>
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-bold">
          Delivery history · {workshop.deliveries?.length || 0} emails
        </h2>
        <p className="text-xs text-slate-500">
          Email counts are separate from participant counts. Sent means accepted
          by the provider; inbox receipt is not guaranteed.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] text-left text-xs">
            <thead>
              <tr className="border-b">
                {[
                  "Participant",
                  "Message",
                  "Status",
                  "Queued / sent",
                  "Details",
                ].map((label) => (
                  <th className="p-2" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workshop.deliveries?.map((d) => (
                <tr key={d.id} className="border-b align-top">
                  <td className="p-2">
                    {d.name}
                    <br />
                    {d.email}
                  </td>
                  <td className="p-2">
                    {d.kind}
                    <br />
                    {d.subject}
                  </td>
                  <td className="p-2">
                    {d.status === "queued" ? "Pending" : d.status}
                  </td>
                  <td className="p-2">
                    {new Date(d.createdAt).toLocaleString()}
                    <br />
                    {d.sentAt ? new Date(d.sentAt).toLocaleString() : ""}
                  </td>
                  <td className="max-w-xs p-2">
                    {d.error ||
                      (d.nextAttemptAt
                        ? "Next attempt: " +
                          new Date(d.nextAttemptAt).toLocaleString()
                        : "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

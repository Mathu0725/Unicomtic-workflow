"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  api,
  useLiveData,
  buttonClass,
  inputClass,
  panelClass,
  Notice,
} from "@/components/live-data";
import WorkshopEditor from "@/components/workshop-editor";
import WorkshopParticipants from "@/components/workshop-participants";
import WorkshopReminders from "@/components/workshop-reminders";
import WorkshopSheetConnection from "@/components/workshop-sheet-connection";
import type {
  workshopDetail,
  workshopSummary,
} from "@/lib/workshops/management";
type Data = {
  canManage: boolean;
  workshop: ReturnType<typeof workshopDetail>;
  googleConnected: boolean;
  defaultSpreadsheetId: string;
  forms: {
    id: string;
    title: string;
    updatedAt: string;
    draftVersion: string | null;
    draftAttached: boolean;
  }[];
  transferTargets: ReturnType<typeof workshopSummary>[];
};
export default function WorkshopDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <WorkshopDetails key={id} id={id} />;
}
function WorkshopDetails({ id }: { id: string }) {
  const {
      data: raw,
      error,
      reload,
      loading,
    } = useLiveData("/api/admin/workshops/" + encodeURIComponent(id), 15000),
    data = raw as Data | null;
  const [tab, setTab] = useState("Overview"),
    [edit, setEdit] = useState<"edit" | "duplicate" | null>(null),
    [formId, setFormId] = useState(""),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [message, setMessage] = useState("");
  if (loading) return <p role="status">Loading workshop…</p>;
  if (!data)
    return (
      <div className={panelClass}>
        <Notice error>{error}</Notice>
        <button className={buttonClass} onClick={() => void reload()}>
          Try again
        </button>
      </div>
    );
  const w = data.workshop;
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      const result = await api(
        "/api/admin/workshops",
        { id: w.id, is_active: !w.is_active, expectedVersion: w.version },
        "PATCH",
      );
      setMessage(result.message);
      await reload();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Could not change bookings.");
    } finally {
      setBusy(false);
    }
  }
  async function attach() {
    const f = data!.forms.find((f) => f.id === formId);
    if (!f || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const result = await api(
        "/api/admin/workshops/" + encodeURIComponent(id) + "/forms",
        {
          formId: f.id,
          expectedUpdatedAt: f.updatedAt,
          expectedDraftVersion: f.draftVersion,
        },
      );
      setMessage(result.message);
      await reload();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Could not attach workshop.");
    } finally {
      setBusy(false);
    }
  }
  const tabs = data.canManage
    ? [
        "Overview",
        "Participants",
        "Attendance",
        "Reminders & emails",
        "Google Sheet",
      ]
    : ["Overview", "Participants", "Attendance"];
  return (
    <div className="space-y-5">
      <Link
        href="/admin/workshops"
        className="text-sm font-semibold text-blue-700"
      >
        ← All workshops
      </Link>
      <header>
        <p className="text-xs text-slate-500">{w.campaignTitle}</p>
        <h1 className="text-2xl font-extrabold">{w.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {new Date(w.start_time).toLocaleString("en-GB", {
            timeZone: "Asia/Colombo",
          })}{" "}
          (Sri Lanka) · {w.venue}
        </p>
      </header>
      <Notice error>{failure || error}</Notice>
      <Notice>{message}</Notice>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Total seats", w.capacity || "Unlimited"],
          ["Confirmed", w.bookedCount],
          ["Available", w.remaining ?? "Unlimited"],
          ["Cancelled / moved", w.cancelledCount],
          ["Attended", w.totalAttended],
        ].map(([label, count]) => (
          <div className="rounded-xl border bg-white p-4" key={label}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{count}</p>
          </div>
        ))}
      </div>
      <nav
        aria-label="Workshop sections"
        className="flex flex-wrap gap-2 border-b pb-3"
      >
        {tabs.map((name) => (
          <button
            type="button"
            key={name}
            aria-current={tab === name ? "page" : undefined}
            className={
              "rounded-lg px-4 py-2 text-sm font-semibold " +
              (tab === name
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600")
            }
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <section className={panelClass}>
        {tab === "Overview" && (
          <div className="space-y-5">
            <div>
              <h2 className="font-bold">Workshop details</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {w.description}
              </p>
              <p className="mt-2 text-sm">{w.address}</p>
              <p className="mt-2 text-sm">
                New bookings: {w.is_active ? "Enabled" : "Closed"} · Deadline:{" "}
                {w.booking_deadline
                  ? new Date(w.booking_deadline).toLocaleString()
                  : "Workshop start"}
              </p>
            </div>
            {data.canManage && (
              <>
                <div className="flex flex-wrap gap-3">
                  <button
                    className={buttonClass}
                    onClick={() => setEdit(edit === "edit" ? null : "edit")}
                  >
                    Edit workshop / seats
                  </button>
                  <button
                    className="text-sm font-semibold text-blue-700 underline"
                    onClick={() =>
                      setEdit(edit === "duplicate" ? null : "duplicate")
                    }
                  >
                    Duplicate as new workshop
                  </button>
                  <button
                    className="text-sm font-semibold text-blue-700 underline"
                    disabled={busy || Boolean(error)}
                    onClick={() => void toggle()}
                  >
                    {w.is_active ? "Close new bookings" : "Reopen new bookings"}
                  </button>
                </div>
                {edit && (
                  <WorkshopEditor
                    key={edit}
                    workshop={w}
                    duplicate={edit === "duplicate"}
                    campaignId={w.campaign_id}
                    onCancel={() => setEdit(null)}
                    onSaved={async (saved) => {
                      setEdit(null);
                      setMessage(
                        saved.id === id
                          ? "Workshop saved. Use Reminders & emails to preview a date / venue update."
                          : "New workshop created. Open it from All workshops to attach forms.",
                      );
                      await reload();
                    }}
                  />
                )}
                <div className="space-y-3 rounded-xl border p-4">
                  <h2 className="font-bold">Attach to a form</h2>
                  <p className="text-sm text-slate-600">
                    Add this workshop to the form's saved draft. Existing draft
                    edits are preserved. Preview and publish in Builder.
                  </p>
                  <label className="block text-sm">
                    Choose form
                    <select
                      className={inputClass}
                      value={formId}
                      onChange={(e) => setFormId(e.target.value)}
                    >
                      <option value="">Select a form in this intake</option>
                      {data.forms.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.title}
                          {f.draftAttached ? " · attached in draft" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={busy || !formId || Boolean(error)}
                    className={buttonClass}
                    onClick={() => void attach()}
                  >
                    Attach to draft
                  </button>
                  {formId && (
                    <Link
                      className="ml-3 text-sm font-semibold text-blue-700 underline"
                      href={
                        "/admin/forms/" +
                        encodeURIComponent(formId) +
                        "/builder"
                      }
                    >
                      Open Builder →
                    </Link>
                  )}
                  <h3 className="text-sm font-semibold">
                    Published attachments
                  </h3>
                  {w.attachedForms.length ? (
                    w.attachedForms.map((f) => (
                      <p key={f.id} className="text-sm">
                        {f.title}
                        {f.hidden ? " · hidden on this form" : ""}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      No published form currently displays this workshop.
                    </p>
                  )}
                  {data.forms.some((f) => f.draftAttached) && (
                    <p className="text-xs text-amber-800">
                      Draft attachments:{" "}
                      {data.forms
                        .filter((f) => f.draftAttached)
                        .map((f) => f.title)
                        .join(", ")}
                      . Publish to apply them.
                    </p>
                  )}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-blue-700">
                    Workshop change history
                  </summary>
                  {w.history.map((h) => (
                    <p key={h.id} className="mt-3 text-xs">
                      {h.action.replaceAll("_", " ")} ·{" "}
                      {new Date(h.created_at).toLocaleString()} · {h.user_email}
                    </p>
                  ))}
                </details>
              </>
            )}
          </div>
        )}
        {tab === "Participants" && (
          <WorkshopParticipants
            workshop={w}
            canManage={data.canManage && !error}
            targets={data.transferTargets || []}
            onChanged={reload}
          />
        )}
        {tab === "Attendance" && (
          <>
            <h2 className="font-bold">Attendance for {w.title}</h2>
            <p className="text-sm">
              {w.attendanceRecords.length} marked records, including any walk-in
              students registered at the desk.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "Participant / phone",
                      "Status / exam ID",
                      "Marked by / time",
                      "History",
                    ].map((label) => (
                      <th key={label} className="p-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {w.attendanceRecords.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-2">
                        {a.studentName}
                        <br />
                        {a.phone}
                      </td>
                      <td className="p-2">
                        {a.status}
                        <br />
                        {a.student_exam_id}
                      </td>
                      <td className="p-2">
                        {a.marked_by}
                        <br />
                        {new Date(a.marked_at).toLocaleString()}
                      </td>
                      <td className="p-2">
                        <details>
                          <summary>View changes</summary>
                          {a.history.map((h) => (
                            <p key={h.id} className="text-xs">
                              {String(h.changes.status)} · {h.user_email} ·{" "}
                              {new Date(h.created_at).toLocaleString()}
                            </p>
                          ))}
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link
              className="text-sm text-blue-700 underline"
              href={"/admin/attendance?workshopId=" + encodeURIComponent(id)}
            >
              Open attendance desk for this workshop →
            </Link>
          </>
        )}
        {tab === "Reminders & emails" && data.canManage && (
          <WorkshopReminders workshop={w} onChanged={reload} />
        )}
        {tab === "Google Sheet" && data.canManage && (
          <>
            <h2 className="font-bold">Google Sheet for {w.title}</h2>
            <p className="text-sm text-slate-600">
              Use a separate tab for this workshop. Booking IDs keep updates in
              the same row, including cancellations and moves.
            </p>
            <WorkshopSheetConnection
              workshop={w}
              googleConnected={data.googleConnected}
              defaultSpreadsheetId={data.defaultSpreadsheetId}
              onChanged={reload}
            />
          </>
        )}
      </section>
    </div>
  );
}

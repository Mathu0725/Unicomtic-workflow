"use client";
import { useRef, useState } from "react";
import type {
  workshopDetail,
  workshopSummary,
} from "@/lib/workshops/management";
import { inputClass, buttonClass, Notice } from "./live-data";
import { submitRequest, pendingPayload } from "@/lib/client/submit";
import { readJson, responseError } from "@/lib/client/api";
import SubmissionRecovery from "./submission-recovery";
type Details = ReturnType<typeof workshopDetail>;
export default function WorkshopParticipants({
  workshop,
  canManage,
  targets,
  onChanged,
  attendanceOnly = false,
}: {
  workshop: Details;
  canManage: boolean;
  targets: ReturnType<typeof workshopSummary>[];
  onChanged: () => Promise<void>;
  attendanceOnly?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(attendanceOnly ? "confirmed" : "all"),
    [selected, setSelected] = useState<Details["bookings"][number] | null>(
      null,
    ),
    [action, setAction] = useState<"cancel" | "move">("cancel"),
    [target, setTarget] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    endpoint =
      "/api/admin/workshops/" + encodeURIComponent(workshop.id) + "/bookings";
  const rows = workshop.bookings.filter(
    (b) =>
      (status === "all" || b.status === status) &&
      [
        b.studentName,
        b.email,
        b.phone,
        b.referenceNo,
        b.applicationNo,
        b.utNumber,
        ...b.sourceForms,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function csv() {
    const cell = (value: unknown) =>
      '"' +
      String(value ?? "")
        .replace(/^[\s]*[=+@-]/, (match) => "'" + match)
        .replaceAll('"', '""') +
      '"';
    const content = [
      [
        "Booking ID",
        "Name",
        "Phone",
        "Email",
        "Registration",
        "Application",
        "Source forms",
        "Booked at",
        "Booking status",
        "Attendance",
      ],
      ...rows.map((b) => [
        b.id,
        b.studentName,
        b.phone,
        b.email,
        b.referenceNo,
        b.applicationNo,
        b.sourceForms.join("; "),
        b.created_at,
        b.status,
        b.attendanceStatus,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
        new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
      ),
      link = document.createElement("a");
    link.href = url;
    link.download = "workshop-" + workshop.id + "-participants.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await submitRequest(endpoint, {
        bookingId: selected.id,
        expectedVersion: selected.version,
        action,
        targetWorkshopId: action === "move" ? target : undefined,
        reason,
      });
      const result = await readJson(response);
      if (!response.ok || !result.success)
        throw responseError(response, result);
      setMessage(result.message);
      setSelected(null);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change booking.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <div className="space-y-4">
      <Notice error>{error}</Notice>
      <Notice>{message}</Notice>
      <SubmissionRecovery
        url={endpoint}
        show={Boolean(error || pendingPayload(endpoint))}
        onResolved={(r) => {
          setMessage(r.message);
          setSelected(null);
          void onChanged();
        }}
      />
      <div className="flex flex-wrap gap-3">
        <label className="min-w-48 flex-1 text-xs font-semibold">
          Search participants
          <input
            type="search"
            className={inputClass}
            placeholder="Name, phone, email or reference"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold">
          Booking status
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All bookings</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled / moved</option>
          </select>
        </label>
        <button type="button" className={buttonClass} onClick={csv}>
          Export these {rows.length} records
        </button>
      </div>
      <p className="text-sm text-slate-600">
        {rows.length} matching bookings in {workshop.title}.
      </p>
      {selected && (
        <form
          className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
          onSubmit={save}
        >
          <h3 className="font-semibold">
            {action === "move" ? "Move" : "Cancel"} booking —{" "}
            {selected.studentName}
          </h3>
          <p className="text-sm">
            {selected.referenceNo} · {selected.email}
          </p>
          {action === "move" && (
            <label className="block text-sm">
              Move to
              <select
                required
                className={inputClass}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Choose another workshop</option>
                {targets.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.remaining === 0}>
                    {w.title} · {w.remaining ?? "Unlimited"} seats
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            Reason (saved in history)
            <textarea
              required
              minLength={3}
              maxLength={500}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="text-xs">
            The original booking stays in history.{" "}
            {action === "move"
              ? "The destination workshop's confirmation setting applies to the new booking."
              : "This action releases the seat and stops its pending workshop reminders."}
          </p>
          <button disabled={busy} className={buttonClass}>
            {busy
              ? "Saving…"
              : action === "move"
                ? "Confirm move"
                : "Confirm cancellation"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="ml-4 text-sm underline"
            onClick={() => setSelected(null)}
          >
            Keep booking
          </button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              {[
                "Participant & phone",
                "References & source",
                "Booking",
                "Attendance",
                ...(attendanceOnly ? [] : ["Email / Sheet"]),
                "History / actions",
              ].map((label) => (
                <th key={label} scope="col" className="p-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-b align-top">
                <td className="p-3">
                  <strong>{b.studentName}</strong>
                  <div>{b.phone}</div>
                  <div className="break-all text-xs">{b.email}</div>
                </td>
                <td className="p-3 text-xs">
                  {b.referenceNo}
                  <br />
                  {b.applicationNo}
                  <br />
                  {b.sourceForms.join(", ") || "Legacy / staff booking"}
                </td>
                <td className="p-3 text-xs">
                  <strong>{b.moved_to ? "Moved" : b.status}</strong>
                  <br />
                  {new Date(b.created_at).toLocaleString()}
                  <br />
                  <span className="break-all text-slate-500">{b.id}</span>
                </td>
                <td className="p-3 text-xs">
                  {b.attendanceStatus}
                  {b.utNumber && <><br />UT: {b.utNumber}</>}
                  {b.attendance && (
                    <>
                      <br />
                      {b.attendance.student_exam_id}
                      <br />
                      {new Date(b.attendance.marked_at).toLocaleString()}
                      <br />
                      {b.attendance.marked_by}
                    </>
                  )}
                </td>
                {!attendanceOnly && (
                  <td className="p-3 text-xs">
                    Email: {b.emailStatus}
                    <br />
                    Sheet: {b.sheetStatus}
                  </td>
                )}
                <td className="p-3 text-xs">
                  <details>
                    <summary className="cursor-pointer text-blue-700">
                      View history
                    </summary>
                    <p className="mt-2">
                      Booked {new Date(b.created_at).toLocaleString()}
                    </p>
                    {b.cancellation_reason && <p>{b.cancellation_reason}</p>}
                    {b.moved_from && (
                      <p className="break-all">
                        Moved from booking {b.moved_from}
                      </p>
                    )}
                    {b.moved_to && (
                      <p className="break-all">Moved to booking {b.moved_to}</p>
                    )}
                    {b.history.map((h) => (
                      <p key={h.id} className="mt-2">
                        {h.action.replaceAll("_", " ")} ·{" "}
                        {new Date(h.created_at).toLocaleString()} ·{" "}
                        {h.user_email}
                      </p>
                    ))}
                  </details>
                  {canManage && b.status === "confirmed" && !attendanceOnly && (
                    <div className="mt-3 flex gap-3">
                      {(["cancel", "move"] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          disabled={busy || Boolean(b.attendance)}
                          className="font-semibold text-blue-700 underline disabled:opacity-40"
                          onClick={() => {
                            setSelected(b);
                            setAction(kind);
                            setReason("");
                            setTarget("");
                            setError("");
                          }}
                        >
                          {kind === "cancel" ? "Cancel" : "Move"}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

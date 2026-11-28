"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveData, inputClass, Notice } from "@/components/live-data";
import type { workshopDetail } from "@/lib/workshops/management";

type Workshop = ReturnType<typeof workshopDetail>;

export default function WorkshopBookingsPage() {
  const { data, error, loading, reload } = useLiveData("/api/admin/workshops", 15000);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("confirmed");
  const workshops = (data?.workshops || []) as Workshop[];
  const rows = workshops.flatMap((workshop) =>
    workshop.bookings.map((booking) => ({ workshop, booking })),
  ).filter(({ workshop, booking }) =>
    (status === "all" || booking.status === status) &&
    [workshop.title, booking.studentName, booking.email, booking.phone,
      booking.referenceNo, booking.applicationNo, ...booking.sourceForms]
      .join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase text-blue-600">Leads</p>
        <h1 className="text-2xl font-extrabold">Workshop bookings</h1>
        <p className="mt-1 text-sm text-slate-600">Find people across all workshops. Open a workshop for reminders, attendance and booking changes.</p>
      </div>
      <Link href="/admin/workshops" className="text-sm font-semibold text-blue-700">Manage workshops →</Link>
    </header>
    <Notice error>{error}</Notice>
    {error && <button type="button" className="text-sm font-semibold text-blue-700" onClick={() => void reload()}>Try again</button>}
    <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
      <label className="min-w-56 flex-1 text-sm font-semibold">Search bookings
        <input className={inputClass + " mt-1"} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Workshop, name, email, phone or reference" />
      </label>
      <label className="text-sm font-semibold">Status
        <select className={inputClass + " mt-1"} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="confirmed">Confirmed</option><option value="cancelled">Cancelled / moved</option><option value="all">All bookings</option>
        </select>
      </label>
    </div>
    {loading && <p role="status">Loading workshop bookings…</p>}
    {!loading && data && <p className="text-sm text-slate-600">{rows.length} matching bookings across {workshops.length} workshops</p>}
    {!loading && data && <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>
          <th className="p-3">Person</th><th className="p-3">Workshop</th><th className="p-3">Contact</th><th className="p-3">Reference</th><th className="p-3">Status</th><th className="p-3">Booked</th>
        </tr></thead>
        <tbody>{rows.map(({ workshop, booking }) => <tr key={booking.id} className="border-t align-top">
          <td className="p-3 font-semibold">{booking.studentName || "—"}</td>
          <td className="p-3"><Link className="font-semibold text-blue-700 hover:underline" href={`/admin/workshops/${encodeURIComponent(workshop.id)}`}>{workshop.title}</Link><span className="block text-xs text-slate-500">{workshop.campaignTitle}</span></td>
          <td className="p-3">{booking.email || "—"}<span className="block text-slate-500">{booking.phone}</span></td>
          <td className="p-3">{booking.referenceNo || booking.applicationNo || "—"}</td>
          <td className="p-3">{booking.status}<span className="block text-xs text-slate-500">Attendance: {booking.attendanceStatus}</span></td>
          <td className="p-3">{new Date(booking.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" })}</td>
        </tr>)}</tbody>
      </table>
      {rows.length === 0 && <p className="p-5 text-sm text-slate-500">No matching workshop bookings.</p>}
    </div>}
  </div>;
}

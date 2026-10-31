"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  useLiveData,
  inputClass,
  buttonClass,
  panelClass,
  Notice,
} from "@/components/live-data";
import WorkshopEditor, { type WorkshopAttachmentResult } from "@/components/workshop-editor";
import type { workshopSummary } from "@/lib/workshops/management";
type Summary = ReturnType<typeof workshopSummary>;
export default function WorkshopsPage() {
  const { data, error, reload, loading } = useLiveData(
    "/api/admin/workshops?summary=1",
    15000,
  );
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>(
      [],
    ),
    [show, setShow] = useState(false),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState("");
  const [attachments, setAttachments] = useState<WorkshopAttachmentResult[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    api("/api/campaigns", undefined, "GET", controller.signal)
      .then((d) => setCampaigns(d.campaigns))
      .catch((e) => {
        if (!controller.signal.aborted) setFailure(e.message);
      });
    return () => controller.abort();
  }, []);
  const workshops: Summary[] = data?.workshops || [];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-blue-600">
            Workshop planning
          </p>
          <h1 className="text-2xl font-extrabold">Workshops</h1>
          <p className="mt-2 text-sm text-slate-600">
            Open a workshop to manage its participants, reminders and Google
            Sheet.
          </p>
        </div>
        {data?.canManage && (
          <button className={buttonClass} onClick={() => setShow(!show)}>
            {show ? "Close creator" : "Create workshop"}
          </button>
        )}
      </header>
      <Notice error>{failure || error}</Notice>
      <Notice>{message}</Notice>
      {attachments.length > 0 && <ul className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">{attachments.map(f => <li key={f.id}><strong>{f.title}</strong> — {f.live ? "Visible now" : "Attached to draft"} · <Link className="font-semibold text-blue-700 underline" href={f.live ? `/form/${f.slug}` : `/admin/forms/${f.id}/builder`}>{f.live ? "Open form" : "Review and publish"}</Link></li>)}</ul>}
      {show && data?.canManage && campaigns.length > 0 && (
        <section className={panelClass}>
          <WorkshopEditor
            allowAttachments
            campaigns={campaigns}
            onCancel={() => setShow(false)}
            onSaved={async (w, forms = []) => {
              setShow(false);
              setAttachments(forms);
              setMessage(w.title + (forms.length ? " created and attached to selected forms." : " saved. Open it to attach a form."));
              await reload();
            }}
          />
        </section>
      )}
      {loading && <p role="status">Loading workshops…</p>}
      <label className="block text-sm font-semibold">
        Find a workshop
        <input
          type="search"
          className={inputClass + " mt-2"}
          placeholder="Name, intake or venue"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <p className="text-sm text-slate-500">
        {workshops.length} workshops · Each workshop has its own participant
        list and emails.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {workshops
          .filter((w) =>
            [w.title, w.venue, w.campaignTitle]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((w) => (
            <article key={w.id} className={panelClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">{w.campaignTitle}</p>
                  <h2 className="text-lg font-bold">{w.title}</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                  {Date.parse(w.start_time) <= Date.now()
                    ? "Started / completed"
                    : !w.is_active ||
                        (w.booking_deadline &&
                          Date.parse(w.booking_deadline) <= Date.now())
                      ? "Bookings closed"
                      : w.remaining === 0
                        ? "Full"
                        : "Bookings open"}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                {new Date(w.start_time).toLocaleString("en-GB", {
                  timeZone: "Asia/Colombo",
                })}{" "}
                (Sri Lanka)
                <br />
                {w.venue}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  ["Total seats", w.capacity || "Unlimited"],
                  ["Booked", w.bookedCount],
                  ["Available", w.remaining ?? "Unlimited"],
                  ["Attended", w.totalAttended],
                ].map(([label, count]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-2">
                    <p className="text-[11px] text-slate-500">{label}</p>
                    <p className="text-lg font-bold">{count}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Attached forms: {w.attachedForms.length} · Automatic reminders{" "}
                {w.reminders_enabled === false ? "Off" : "On"}
              </p>
              <Link
                className={buttonClass}
                href={"/admin/workshops/" + encodeURIComponent(w.id)}
              >
                Open workshop →
              </Link>
            </article>
          ))}
      </div>
      {data && !workshops.length && (
        <p>No workshops planned yet. Create one to get started.</p>
      )}
    </div>
  );
}

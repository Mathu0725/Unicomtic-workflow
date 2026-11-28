"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarDays, FileText, RefreshCw, Users } from "lucide-react";
import { useLiveData, Notice } from "@/components/live-data";

type DayActivity = { date: string; registrations: number; applications: number };
type RecentApplication = { id: string; name: string; reference: string; createdAt: string; status: string };
type Workshop = { id: string; title: string; start_time: string; venue: string; bookings: number; capacity?: number; is_active: boolean };

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  const time = Date.parse(date);
  return Number.isFinite(time) ? new Date(time).toLocaleString("en-GB", { ...options, timeZone: "Asia/Colombo" }) : "Date unavailable";
}

export default function Dashboard() {
  const { data, error, loading, reload, stale } = useLiveData("/api/admin/stats", 30000);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  };
  const days = (data?.activity?.days || []) as DayActivity[];
  const recent = (data?.activity?.recentApplications || []) as RecentApplication[];
  const workshops = ((data?.workshops || []) as Workshop[]).slice().sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  const today = days.at(-1), yesterday = days.at(-2);
  const weekly = days.reduce((total, day) => ({ registrations: total.registrations + day.registrations, applications: total.applications + day.applications }), { registrations: 0, applications: 0 });
  const maxDayCount = Math.max(1, ...days.flatMap(day => [day.registrations, day.applications]));
  const metrics = [
    { label: "Total registrations", value: data?.stats?.registrations, href: "/admin/registrations", icon: Users, tone: "bg-blue-50 text-blue-700" },
    { label: "Total applications", value: data?.stats?.applications, href: "/admin/applications", icon: FileText, tone: "bg-indigo-50 text-indigo-700" },
    { label: "Registrations today", value: today?.registrations, href: "/admin/registrations", icon: Users, tone: "bg-cyan-50 text-cyan-700" },
    { label: "Applications today", value: today?.applications, href: "/admin/applications", icon: FileText, tone: "bg-violet-50 text-violet-700" },
  ];

  return <div className="space-y-7">
    <header className="dashboard-heading flex flex-wrap items-end justify-between gap-5 rounded-2xl border border-blue-100 px-5 py-6 sm:px-7 sm:py-7">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-[.17em] text-blue-700">Admissions overview</p><h1 className="text-3xl font-bold text-slate-950 sm:text-[2.15rem]">Admissions at a glance</h1><p className="mt-2 text-sm leading-6 text-slate-600">Registrations, applications and workshop seats in one place.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-800 shadow-sm hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh data"}</button>
    </header>
    <Notice error>{error}</Notice>
    {stale && <p className="text-xs text-amber-800">Showing the last available figures while the connection recovers.</p>}
    <section aria-label="Admissions statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, href, icon: Icon, tone }) => <Link key={label} href={href} className="group flex min-h-36 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-slate-600">{label}</span><span className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-4 w-4" aria-hidden="true" /></span></div><div className="flex items-end justify-between gap-2"><strong className="text-3xl font-bold tracking-tight text-slate-950" aria-label={`${label}: ${value ?? (loading ? "loading" : "unavailable")}`}>{value ?? (loading ? "…" : "—")}</strong><span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">View <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span></div></Link>)}
    </section>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="activity-title">
        <h2 id="activity-title" className="text-base font-bold text-slate-900">Registration & application activity</h2><p className="mt-1 text-xs text-slate-500">Last 7 calendar days including today · Sri Lanka time</p>
        {data && days.length > 0 ? <><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">Yesterday</p><p className="mt-1 text-sm font-bold text-slate-900">{yesterday?.registrations ?? 0} registrations · {yesterday?.applications ?? 0} applications</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">Last 7 days</p><p className="mt-1 text-sm font-bold text-slate-900">{weekly.registrations} registrations · {weekly.applications} applications</p></div></div>
        <div className="mt-5 space-y-3" aria-label="Daily registration and application counts">{days.map(day => <div key={day.date} className="grid grid-cols-[3.8rem_1fr_auto] items-center gap-3 text-xs"><span className="font-medium text-slate-600">{formatDate(`${day.date}T12:00:00Z`, { day: "numeric", month: "short" })}</span><div className="space-y-1" aria-hidden="true"><div className="h-2 rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${day.registrations / maxDayCount * 100}%` }} /></div><div className="h-2 rounded-full bg-indigo-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${day.applications / maxDayCount * 100}%` }} /></div></div><span className="whitespace-nowrap text-slate-600"><span className="font-semibold text-blue-700">{day.registrations} reg</span> · <span className="font-semibold text-indigo-700">{day.applications} app</span></span></div>)}</div></> : <p className="py-8 text-sm text-slate-500" role="status">{loading ? "Loading activity…" : "Activity is unavailable."}</p>}
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="workshops-title">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 id="workshops-title" className="text-base font-bold text-slate-900">Workshop schedule & seats</h2><p className="mt-0.5 text-xs text-slate-500">Confirmed bookings and available seats</p></div><Link className="text-xs font-semibold text-blue-700 hover:underline" href="/admin/workshops">All workshops</Link></div>
        <div className="divide-y divide-slate-100 px-5 sm:px-6">{workshops.map(workshop => { const limited = typeof workshop.capacity === "number" && workshop.capacity > 0; const capacity = limited ? workshop.capacity! : 0; const remaining = Math.max(0, capacity - workshop.bookings); return <Link key={workshop.id} href={`/admin/workshops/${encodeURIComponent(workshop.id)}`} className="block py-4 hover:text-blue-700"><div className="flex items-start justify-between gap-3"><span className="text-sm font-semibold">{workshop.title}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${workshop.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{workshop.is_active ? "Active" : "Inactive"}</span></div><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{formatDate(workshop.start_time, { dateStyle: "medium", timeStyle: "short" })}{workshop.venue ? ` · ${workshop.venue}` : ""}</p><p className="mt-3 text-xs font-semibold text-slate-700">{workshop.bookings} booked · {limited ? `${capacity} total · ${remaining} available` : "No seat limit"}</p>{limited && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${workshop.title} seats booked`} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={Math.min(workshop.bookings, capacity)}><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, workshop.bookings / capacity * 100)}%` }} /></div>}</Link>; })}{data && !workshops.length && <div className="py-8"><p className="text-sm text-slate-500">No workshops planned yet.</p><Link href="/admin/workshops" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700">Plan a workshop <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>}{loading && <p className="py-8 text-sm text-slate-500" role="status">Loading workshops…</p>}</div>
      </section>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="recent-title"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 id="recent-title" className="text-base font-bold text-slate-900">Recent applications</h2><p className="mt-0.5 text-xs text-slate-500">A preview of the latest five submissions</p></div><Link href="/admin/applications" className="text-xs font-semibold text-blue-700 hover:underline">View applications</Link></div><div className="divide-y divide-slate-100 px-5 sm:px-6">{recent.map(application => <div key={application.id} className="flex flex-wrap items-center justify-between gap-2 py-4"><div><p className="text-sm font-semibold text-slate-900">{application.name}</p><p className="mt-1 text-xs text-slate-500">{application.reference} · {formatDate(application.createdAt, { dateStyle: "medium", timeStyle: "short" })}</p></div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold capitalize text-indigo-700">{application.status.replaceAll("_", " ")}</span></div>)}{data && !recent.length && <p className="py-8 text-sm text-slate-500">No applications received yet.</p>}{loading && <p className="py-8 text-sm text-slate-500" role="status">Loading applications…</p>}</div></section>
  </div>;
}

"use client";
import { useLiveData, inputClass, Notice } from "./live-data";
export default function WorkshopChoice({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data, error } = useLiveData("/api/workshops", 15000);
  if (!data?.workshops.length && !error) return null;
  return <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2"><label htmlFor="workshop-choice" className="font-bold text-sm">Choose a workshop (optional)</label><Notice error>{error}</Notice><select id="workshop-choice" className={inputClass} value={value} onChange={e => onChange(e.target.value)}><option value="">Choose later</option>{data?.workshops.map((w: any) => <option key={w.id} value={w.id} disabled={w.remaining === 0}>{w.title} · {new Date(w.start_time).toLocaleString()} · {w.venue} · {w.remaining === null ? "Open" : `${w.remaining} seats`}</option>)}</select><p className="text-xs text-slate-500">Your seat is confirmed when the complete form is accepted.</p></div>;
}

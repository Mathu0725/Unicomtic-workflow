"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
export { api } from "@/lib/client/api";
export function useLiveData(url: string, interval = 10000) {
  const [data, setData] = useState<any>(null), [error, setError] = useState("");
  const run = useRef<() => Promise<void>>(async () => {});
  const reload = useCallback(() => run.current(), []);
  useEffect(() => {
    let active = true, failures = 0, inFlight: Promise<void> | null = null, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setData(null); setError("");
    const load = () => {
      if (inFlight) return inFlight;
      clearTimeout(timer);
      inFlight = (async () => {
        try { const result = await api(url, undefined, "GET", controller.signal); if (active) { setData(result); setError(""); failures = 0; } }
        catch (e: any) { if (active) { setError(e.message); failures++; } }
        finally { inFlight = null; if (active && interval > 0) timer = setTimeout(load, Math.min(120000, interval * 2 ** Math.min(failures, 4))); }
      })();
      return inFlight;
    };
    run.current = load;
    void load();
    return () => { active = false; clearTimeout(timer); controller.abort(); run.current = async () => {}; };
  }, [url, interval]);
  return { data, error, reload, loading: !data && !error, stale: Boolean(data && error) };
}
export const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
export const buttonClass = "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";
export const panelClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4";
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return children ? <p role={error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-900"}`}>{children}</p> : null; }

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
        finally { inFlight = null; if (active && interval > 0 && document.visibilityState !== "hidden") timer = setTimeout(load, Math.min(120000, interval * 2 ** Math.min(failures, 4))); }
      })();
      return inFlight;
    };
    run.current = load;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") clearTimeout(timer);
      else if (interval > 0) void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void load();
    return () => { active = false; clearTimeout(timer); controller.abort(); document.removeEventListener("visibilitychange", onVisibilityChange); run.current = async () => {}; };
  }, [url, interval]);
  return { data, error, reload, loading: !data && !error, stale: Boolean(data && error) };
}
export const inputClass = "w-full min-h-10 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500";
export const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50";
export const panelClass = "space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return children ? <p role={error ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${error ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-900"}`}>{children}</p> : null; }

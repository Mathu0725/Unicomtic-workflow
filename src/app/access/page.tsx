"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
export default function CandidateAccessPage() {
  const [error, setError] = useState(""), started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    // Remove the capability from the address bar/history before any request.
    window.history.replaceState(null, "", "/access");
    if (!token) { setError("Open the complete secure link from your email, or request a fresh link."); return; }
    api("/api/candidate-access/exchange", { token }).then(data => { window.location.replace(data.redirectTo); }).catch((e: Error) => setError(e.message));
  }, []);
  return <main className="min-h-screen bg-slate-50 p-6 flex items-center justify-center"><section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center space-y-4"><h1 className="text-xl font-bold">Secure admissions access</h1>{error ? <><p role="alert" className="text-sm text-red-700">{error}</p><Link className="inline-block text-blue-700 underline" href="/status">Request a fresh access link</Link></> : <p role="status" className="text-sm text-slate-600">Verifying your email link…</p>}</section></main>;
}

"use client";
import { useState } from "react";
import { pendingPayload, submitRequest } from "@/lib/client/submit";
import { readJson, responseError } from "@/lib/client/api";
export default function SubmissionRecovery({ url, show, onResolved, actionClassName = "text-blue-800" }: { url: string; show: boolean; onResolved: (data: any) => void; actionClassName?: string }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState("");
    if (!show || pendingPayload(url) === undefined) return null;
    const resolve = async () => {
        setBusy(true); setError("");
        try { const response = await submitRequest(url, pendingPayload(url)), data = await readJson(response); if (!response.ok || data.success === false) throw responseError(response, data); onResolved(data); }
        catch (e: any) { setError(e.message); }
        finally { setBusy(false); }
    };
    return <div className="my-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm space-y-2" role="status"><p>The earlier submission has an unknown outcome. Resolve it using the original answers and retry key before making another submission.</p><button type="button" disabled={busy} className={`font-semibold underline ${actionClassName}`} onClick={resolve}>{busy ? "Checking original submission…" : "Resolve pending submission"}</button>{error && <p role="alert">{error}</p>}</div>;
}

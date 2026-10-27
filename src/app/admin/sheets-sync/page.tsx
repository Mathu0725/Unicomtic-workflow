"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect } from "react";
import { 
  FileSpreadsheet, 
  RotateCw, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Clock, 
  FileText 
} from "lucide-react";

export default function SheetsSyncPage() {
  const [pageError, setPageError] = useState("");
  const [syncJobs, setSyncJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingType, setSyncingType] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchSyncStatus = async () => {
    setLoading(true);
    try {
      setPageError("");
      const res = await apiResponse("/api/admin/sheets-sync");
      const data = await res.json();
      if (data.syncJobs) setSyncJobs(data.syncJobs);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSyncStatus();
  }, []);

  const triggerSync = async (type: "registrations" | "applications") => {
    setSyncingType(type);
    setBanner(null);

    try {
      setPageError("");
      const res = await apiResponse("/api/admin/sheets-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncType: type }),
      });
      const data = await res.json();
      if (data.success) {
        setBanner({ type: "success", message: data.message });
        fetchSyncStatus();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to communicate with sync service." });
    } finally {
      setSyncingType(null);
    }
  };

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 15</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Google Sheets Synchronization Engine</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Export saved registrations and applications to Google Sheets. Existing references are updated without duplicate rows.
          </p>
        </div>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            banner.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {banner.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600" />
          )}
          {banner.message}
        </div>
      )}

      {/* Sync Control Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">Registrations Spreadsheet</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Syncs verified student registrations, districts, reference numbers, and contact records.
          </p>
          <button
            onClick={() => triggerSync("registrations")}
            disabled={syncingType !== null}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow transition flex items-center justify-center gap-2 cursor-pointer disabled:bg-emerald-400"
          >
            {syncingType === "registrations" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCw className="w-4 h-4" />
            )}
            Trigger Registrations Sheet Sync
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">Applications Spreadsheet</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Syncs completed academic profiles, G.C.E. A/L Z-scores, program tracks, and review statuses.
          </p>
          <button
            onClick={() => triggerSync("applications")}
            disabled={syncingType !== null}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow transition flex items-center justify-center gap-2 cursor-pointer disabled:bg-indigo-400"
          >
            {syncingType === "applications" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCw className="w-4 h-4" />
            )}
            Trigger Applications Sheet Sync
          </button>
        </div>
      </div>

      {/* Sync Log Stream */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Synchronization History & Reconciliation Logs</h2>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
              <tr>
                <th className="p-3">Spreadsheet Target</th>
                <th className="p-3">Records Synced</th>
                <th className="p-3">Trigger Method</th>
                <th className="p-3">Status</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {syncJobs.map((job) => (
                <tr key={job.id} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-900 uppercase">{job.sync_type}</td>
                  <td className="p-3 font-semibold text-slate-700">{job.total_synced} rows</td>
                  <td className="p-3 text-slate-500">{job.triggered_by}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      {job.status.toUpperCase()}
                    </span>
                    {job.error_message && <p className="mt-1 text-red-700">{job.error_message}</p>}
                  </td>
                  <td className="p-3 text-slate-400">{new Date(job.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

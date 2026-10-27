"use client";

import { useState, useEffect } from "react";
import { History, Shield, Search, FileCode } from "lucide-react";
import { useLiveData, Notice } from "@/components/live-data";

export default function AuditLogsPage() {
  const { data, error, reload, stale } = useLiveData("/api/admin/audit-logs", 10000);
  const logs = data?.logs || [];
  const [search, setSearch] = useState("");

  const filtered = logs.filter(
    (l: any) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.user_email.toLowerCase().includes(search.toLowerCase()) ||
      l.entity_name.toLowerCase().includes(search.toLowerCase())
  );
  if (!data) return <div className="space-y-4"><Notice error>{error}</Notice>{error ? <button className="text-blue-700 underline" onClick={() => reload()}>Retry audit history</button> : <p role="status">Loading audit history…</p>}</div>;

  return (
    <div className="space-y-6">
      {stale && <Notice>Showing the last successful audit snapshot. Refresh failed.</Notice>}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 17</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Security & Operations Audit Trail</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Saved audit entries for registrations, applications, workshops, form changes and other administrative operations.
          </p>
        </div>
      </div>

      <Notice error>{error}</Notice>
      {/* Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit trail by action, staff email, or entity..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
              <tr>
                <th className="p-3.5">Action Code</th>
                <th className="p-3.5">Staff Email</th>
                <th className="p-3.5">Entity</th>
                <th className="p-3.5">Change Payload</th>
                <th className="p-3.5">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filtered.map((log: any) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-blue-800">{log.action}</td>
                  <td className="p-3.5 text-slate-700 font-sans">{log.user_email}</td>
                  <td className="p-3.5 text-slate-600">{log.entity_name}</td>
                  <td className="p-3.5 text-[11px] text-slate-500">
                    {JSON.stringify(log.changes)}
                  </td>
                  <td className="p-3.5 text-slate-400 font-sans text-[11px]">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

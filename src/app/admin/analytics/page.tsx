"use client";

import { useState } from "react";
import { useLiveData, Notice } from "@/components/live-data";
import { SRI_LANKA_DISTRICTS, SRI_LANKA_PROVINCES } from "@/lib/constants/sri-lanka-districts";
import { BarChart3, MapPin, Download, Filter } from "lucide-react";

export default function DistrictAnalyticsPage() {
  const [selectedProvince, setSelectedProvince] = useState("All");

  const { data, error, reload, stale } = useLiveData("/api/admin/stats", 10000);
  const districtData = (data?.districts || []).map((d: any) => ({ ...d, conversionRate: d.registrations ? Math.round(d.applications / d.registrations * 100) : 0 }));
  const filteredData = districtData.filter(
    (d: any) => selectedProvince === "All" || d.province === selectedProvince
  );

  const totalReg = filteredData.reduce((acc: number, d: any) => acc + d.registrations, 0);
  const totalApps = filteredData.reduce((acc: number, d: any) => acc + d.applications, 0);
  const totalAtt = filteredData.reduce((acc: number, d: any) => acc + d.attendance, 0);
  if (!data) return <div className="space-y-4"><Notice error>{error}</Notice>{error ? <button className="text-blue-700 underline" onClick={() => reload()}>Retry analytics</button> : <p role="status">Loading analytics…</p>}</div>;

  return (
    <div className="space-y-6">
      {stale && <Notice>Showing the last successful analytics snapshot. Refresh failed.</Notice>}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 5</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Sri Lanka District Analytics</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Geographic intake analytics across all 25 administrative districts and 9 provinces of Sri Lanka.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedProvince}
            onChange={(e) => setSelectedProvince(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white font-medium focus:outline-none"
          >
            <option value="All">All 9 Provinces</option>
            {SRI_LANKA_PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p} Province
              </option>
            ))}
          </select>
        </div>
      </div>

      <Notice error>{error}</Notice>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">Provincial Registrations</span>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">{totalReg}</p>
          <span className="text-xs text-blue-600 font-semibold mt-1 block">In Selected Area</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">Applications Submitted</span>
          <p className="text-3xl font-extrabold text-indigo-900 mt-1">{totalApps}</p>
          <span className="text-xs text-indigo-600 font-semibold mt-1 block">
            {totalReg > 0 ? Math.round((totalApps / totalReg) * 100) : 0}% Conversion
          </span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">Workshop Participants</span>
          <p className="text-3xl font-extrabold text-emerald-900 mt-1">{totalAtt}</p>
          <span className="text-xs text-emerald-600 font-semibold mt-1 block">IDs Issued</span>
        </div>
      </div>

      {/* District Analytics Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3.5">District</th>
                <th className="p-3.5">Province</th>
                <th className="p-3.5">Registrations</th>
                <th className="p-3.5">Applications</th>
                <th className="p-3.5">Conversion</th>
                <th className="p-3.5">Workshop Attended</th>
                <th className="p-3.5">Exam Passed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.map((d: any) => (
                <tr key={d.district} className="hover:bg-slate-50/80 transition">
                  <td className="p-3.5 font-bold text-slate-900 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    {d.district}
                  </td>
                  <td className="p-3.5 text-slate-500">{d.province}</td>
                  <td className="p-3.5 font-semibold text-slate-800">{d.registrations}</td>
                  <td className="p-3.5 font-semibold text-indigo-700">{d.applications}</td>
                  <td className="p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700 w-8">{d.conversionRate}%</span>
                      <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full"
                          style={{ width: `${Math.min(d.conversionRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 font-semibold text-emerald-700">{d.attendance}</td>
                  <td className="p-3.5 font-semibold text-purple-700">{d.passed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

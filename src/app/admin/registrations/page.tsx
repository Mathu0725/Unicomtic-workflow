"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect } from "react";
import Link from "next/link";
import CandidateEmailEditor, { type EmailEditTarget } from "@/components/candidate-email-editor";
import { SRI_LANKA_DISTRICTS } from "@/lib/constants/sri-lanka-districts";
import { 
  Users, 
  Search, 
  Mail, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Loader2, 
  Send 
} from "lucide-react";

export default function AdminRegistrationsPage() {
  const [pageError, setPageError] = useState("");
  const [emailTarget, setEmailTarget] = useState<EmailEditTarget | null>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [districtFilter, setDistrictFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchRegistrations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (districtFilter !== "All") params.append("district", districtFilter);
      if (statusFilter !== "All") params.append("status", statusFilter);
      if (search) params.append("search", search);

      setPageError("");
      const res = await apiResponse(`/api/admin/registrations?${params.toString()}`);
      const data = await res.json();
      if (data.registrations) {
        setRegistrations(data.registrations);
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, [districtFilter, statusFilter]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(registrations.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkInvite = async () => {
    if (selectedIds.length === 0) return;
    setInviting(true);
    setBanner(null);

    try {
      setPageError("");
      const res = await apiResponse("/api/admin/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationIds: selectedIds }),
      });
      const data = await res.json();
      if (data.success) {
        setBanner({ type: "success", message: data.message });
        setSelectedIds([]);
        fetchRegistrations();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to dispatch invitations." });
    } finally {
      setInviting(false);
    }
  };

  const exportCSV = () => {
    if (registrations.length === 0) return;
    const headers = ["Reference", "Full Name", "Email", "Phone", "NIC", "District", "Status", "Registered At"];
    const rows = registrations.map((r) => [
      r.reference_no,
      `"${r.studentName}"`,
      r.email,
      r.phone,
      r.nic,
      r.district,
      r.status,
      r.created_at,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `unicom_tic_registrations_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 3</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Student Registrations & Stage 2 Invitations</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Browse registration records, filter district allocations, and dispatch manual application invitations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Export CSV
          </button>
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

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 w-full md:w-auto gap-3 items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchRegistrations()}
              placeholder="Search by name, email, NIC, or reference..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          </div>
          <button
            onClick={fetchRegistrations}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
          >
            Search
          </button>
        </div>

        <div className="flex flex-wrap w-full md:w-auto gap-3 items-center">
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none"
          >
            <option value="All">All Districts (25)</option>
            {SRI_LANKA_DISTRICTS.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="registered">Registered</option>
            <option value="invited">Invited</option>
            <option value="applied">Applied</option>
          </select>

          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkInvite}
              disabled={inviting}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
            >
              {inviting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Invite Selected ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Registrations Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3.5 w-10">
                  <input
                    type="checkbox"
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    checked={registrations.length > 0 && selectedIds.length === registrations.length}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="p-3.5">Reference No</th>
                <th className="p-3.5">Student Name</th>
                <th className="p-3.5">NIC</th>
                <th className="p-3.5">Contact Details</th>
                <th className="p-3.5">District</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading registrations...
                  </td>
                </tr>
              ) : registrations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    {pageError ? "Data could not be loaded. Use refresh to try again." : "No registrations found matching criteria."}
                  </td>
                </tr>
              ) : (
                registrations.map((r) => {
                  const isSelected = selectedIds.includes(r.id);
                  return (
                    <tr key={r.id} className={`hover:bg-slate-50/80 transition ${isSelected ? "bg-blue-50/50" : ""}`}>
                      <td className="p-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(r.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="p-3.5 font-mono font-bold text-blue-700">
                        {r.reference_no}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">
                        {r.studentName}
                      </td>
                      <td className="p-3.5 font-mono text-slate-700">
                        {r.nic}
                      </td>
                      <td className="p-3.5">
                        <div className="text-slate-900">{r.email}</div>
                        <button type="button" className="mt-1 text-[11px] font-semibold text-blue-700 underline" onClick={() => setEmailTarget({ studentId: r.student_id, name: r.studentName, email: r.email })}>Edit email</button>
                        <div className="text-[11px] text-slate-400">{r.phone}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold text-[11px]">
                          {r.district}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                            r.status === "applied"
                              ? "bg-emerald-100 text-emerald-800"
                              : r.status === "invited"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-400 text-[11px]">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3.5"><Link href={`/admin/email?stage=registration&candidate=${encodeURIComponent(r.id)}`} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"><Mail className="h-3.5 w-3.5" />Email</Link></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <CandidateEmailEditor target={emailTarget} onClose={() => setEmailTarget(null)} onSaved={result => { setRegistrations(current => current.map(record => record.student_id === result.studentId ? { ...record, email: result.email } : record)); setBanner({ type: "success", message: result.message }); }} />
    </div>
  );
}

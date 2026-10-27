"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect } from "react";
import Link from "next/link";
import CandidateEmailEditor, { type EmailEditTarget } from "@/components/candidate-email-editor";
import { 
  FileText, 
  Search, 
  Eye, 
  CheckCircle2, 
  X, 
  Loader2, 
  BookOpen, 
  GraduationCap, 
  Phone, 
  Download 
} from "lucide-react";

export default function AdminApplicationsPage() {
  const [pageError, setPageError] = useState("");
  const [emailTarget, setEmailTarget] = useState<EmailEditTarget | null>(null), [emailMessage, setEmailMessage] = useState("");
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "All") params.append("status", statusFilter);
      if (search) params.append("search", search);

      setPageError("");
      const res = await apiResponse(`/api/admin/applications?${params.toString()}`);
      const data = await res.json();
      if (data.applications) setApplications(data.applications);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [statusFilter]);

  const updateApplicationStatus = async (appId: string, newStatus: string, notes?: string) => {
    setUpdatingStatus(true);
    try {
      setPageError("");
      const res = await apiResponse("/api/admin/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: appId, status: newStatus, review_notes: notes, expectedStatus: applications.find(a => a.id === appId)?.status }),
      });
      const data = await res.json();
      if (data.success) {
        if (selectedApp && selectedApp.id === appId) {
          setSelectedApp({ ...selectedApp, status: newStatus, review_notes: notes });
        }
        fetchApplications();
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      <RequestNotice>{emailMessage}</RequestNotice>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 4</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Formal Application Submissions</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review detailed G.C.E. O/L, A/L qualifications, statements of purpose, and admissions status.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full md:w-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchApplications()}
            placeholder="Search by student name, application number, or email..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={fetchApplications}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3.5">App Number</th>
                <th className="p-3.5">Student Name</th>
                <th className="p-3.5">Registration Ref</th>
                <th className="p-3.5">Program Track</th>
                <th className="p-3.5">A/L Stream & Z-Score</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                    Loading applications...
                  </td>
                </tr>
              ) : applications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {pageError ? "Data could not be loaded. Use refresh to try again." : "No applications submitted yet."}
                  </td>
                </tr>
              ) : (
                applications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3.5 font-mono font-bold text-indigo-700">
                      {app.application_no}
                    </td>
                    <td className="p-3.5 font-bold text-slate-900">
                      {app.studentName}
                      <span className="block text-[11px] font-normal text-slate-400">{app.email}</span>
                      <button type="button" className="mt-1 text-[11px] font-semibold text-blue-700 underline" onClick={() => setEmailTarget({ studentId: app.student_id, name: app.studentName, email: app.email })}>Edit email</button>
                    </td>
                    <td className="p-3.5 font-mono text-slate-700">
                      {app.registrationRef}
                    </td>
                    <td className="p-3.5 font-medium text-slate-800">
                      {app.courseName}
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-800">{app.al_results?.stream}</div>
                      <div className="text-[11px] text-slate-500">Z-Score: {app.al_results?.z_score || "N/A"}</div>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                          app.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : app.status === "under_review"
                            ? "bg-amber-100 text-amber-800"
                            : app.status === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setSelectedApp(app)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect Details
                      </button>
                      <Link href={`/admin/email?stage=application&candidate=${encodeURIComponent(app.id)}`} className="ml-2 inline-flex rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">Email</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CandidateEmailEditor target={emailTarget} onClose={() => setEmailTarget(null)} onSaved={result => { setApplications(current => current.map(record => record.student_id === result.studentId ? { ...record, email: result.email } : record)); setSelectedApp((current: any) => current?.student_id === result.studentId ? { ...current, email: result.email } : current); setEmailMessage(result.message); }} />
      {/* Detail Viewer Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedApp(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 absolute top-4 right-4"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                {selectedApp.application_no}
              </span>
              <span className="text-xs text-slate-400">&bull; Submitted: {new Date(selectedApp.submitted_at).toLocaleDateString()}</span>
            </div>

            <h2 className="text-xl font-extrabold text-slate-900 mb-4">
              {selectedApp.studentName}
            </h2>

            <div className="space-y-4 text-xs">
              {/* Educational Qualifications */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-indigo-600" />
                  G.C.E. O/L Results (Index: {selectedApp.ol_results?.index_no})
                </h3>
                <div className="grid grid-cols-3 gap-2 text-slate-600">
                  <div>Mathematics: <strong className="text-slate-900">{selectedApp.ol_results?.maths}</strong></div>
                  <div>English: <strong className="text-slate-900">{selectedApp.ol_results?.english}</strong></div>
                  <div>Science: <strong className="text-slate-900">{selectedApp.ol_results?.science}</strong></div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  G.C.E. A/L Results ({selectedApp.al_results?.stream} - {selectedApp.al_results?.year})
                </h3>
                <p className="text-slate-700 font-medium mb-1">{selectedApp.al_results?.summary}</p>
                <p className="text-slate-500">Z-Score: <strong>{selectedApp.al_results?.z_score || "N/A"}</strong> &bull; Index: {selectedApp.al_results?.index_no}</p>
              </div>

              {/* Statement of Purpose */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-1">Statement of Purpose</h3>
                <p className="text-slate-700 leading-relaxed italic">"{selectedApp.statement_of_purpose}"</p>
              </div>

              {/* Emergency Contact */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  Emergency Contact
                </h3>
                <p className="text-slate-700">
                  {selectedApp.emergency_contact?.name} ({selectedApp.emergency_contact?.relation}) &bull; {selectedApp.emergency_contact?.phone}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => updateApplicationStatus(selectedApp.id, "under_review")}
                  disabled={updatingStatus}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
                >
                  Mark Under Review
                </button>
                <button
                  onClick={() => updateApplicationStatus(selectedApp.id, "approved")}
                  disabled={updatingStatus}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                >
                  Approve Application
                </button>
                <button
                  onClick={() => updateApplicationStatus(selectedApp.id, "rejected")}
                  disabled={updatingStatus}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

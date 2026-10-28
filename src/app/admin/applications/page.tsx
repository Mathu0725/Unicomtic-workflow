"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect, useRef } from "react";
import ApplicationReviewDialog from "@/components/application-review-dialog";
import type { Application } from "@/lib/data/store";
import type { ApplicationListItem } from "@/lib/admissions/application-review";
import Link from "next/link";
import CandidateEmailEditor, {
  type EmailEditTarget,
} from "@/components/candidate-email-editor";
import { Search, Eye, Loader2 } from "lucide-react";

export default function AdminApplicationsPage() {
  const [pageError, setPageError] = useState("");
  const [emailTarget, setEmailTarget] = useState<EmailEditTarget | null>(null),
    [emailMessage, setEmailMessage] = useState("");
  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<ApplicationListItem | null>(
    null,
  );
  const listRequest = useRef<AbortController | null>(null);

  const fetchApplications = async () => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "All") params.append("status", statusFilter);
      if (search) params.append("search", search);

      setPageError("");
      const res = await apiResponse(
        `/api/admin/applications?${params.toString()}`,
        { signal: controller.signal },
      );
      const data = await res.json();
      if (!controller.signal.aborted && data.applications)
        setApplications(data.applications);
    } catch (e) {
      if (controller.signal.aborted) return;
      setPageError(
        e instanceof Error
          ? e.message
          : "Could not load or save this data. Please try again.",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchApplications();
    return () => listRequest.current?.abort();
  }, [statusFilter]);

  const applicationUpdated = (application: Application) => {
    listRequest.current?.abort();
    setLoading(false);
    setApplications((current) =>
      current
        .map((item) =>
          item.id === application.id ? { ...item, ...application } : item,
        )
        .filter(
          (item) => statusFilter === "All" || item.status === statusFilter,
        ),
    );
    setSelectedApp((current) =>
      current?.id === application.id ? { ...current, ...application } : current,
    );
  };

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      <RequestNotice>{emailMessage}</RequestNotice>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
            Module 4
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Formal Application Submissions
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review submitted form answers, documents, qualifications, and
            admissions status.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full md:w-auto">
          <input
            type="text"
            aria-label="Search applications"
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
            aria-label="Application status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="invited">Invited</option>
            <option value="started">Started</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
          <button
            onClick={() => void fetchApplications()}
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
                    {pageError
                      ? "Data could not be loaded. Use refresh to try again."
                      : "No applications submitted yet."}
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
                      <span className="block text-[11px] font-normal text-slate-400">
                        {app.email}
                      </span>
                      <button
                        type="button"
                        className="mt-1 text-[11px] font-semibold text-blue-700 underline"
                        onClick={() =>
                          setEmailTarget({
                            studentId: app.student_id,
                            name: app.studentName,
                            email: app.email,
                          })
                        }
                      >
                        Edit email
                      </button>
                    </td>
                    <td className="p-3.5 font-mono text-slate-700">
                      {app.registrationRef}
                    </td>
                    <td className="p-3.5 font-medium text-slate-800">
                      {app.courseName}
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-800">
                        {app.al_results?.stream}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Z-Score: {app.al_results?.z_score ?? "N/A"}
                      </div>
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
                      <Link
                        href={`/admin/email?stage=application&candidate=${encodeURIComponent(app.id)}`}
                        className="ml-2 inline-flex rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"
                      >
                        Email
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CandidateEmailEditor
        target={emailTarget}
        onClose={() => setEmailTarget(null)}
        onSaved={(result) => {
          setApplications((current) =>
            current.map((record) =>
              record.student_id === result.studentId
                ? { ...record, email: result.email }
                : record,
            ),
          );
          setSelectedApp((current) =>
            current && current.student_id === result.studentId
              ? { ...current, email: result.email }
              : current,
          );
          setEmailMessage(result.message);
        }}
      />
      {selectedApp && (
        <ApplicationReviewDialog
          key={selectedApp.id}
          applicationId={selectedApp.id}
          studentName={selectedApp.studentName}
          onClose={() => setSelectedApp(null)}
          onUpdated={applicationUpdated}
        />
      )}
    </div>
  );
}

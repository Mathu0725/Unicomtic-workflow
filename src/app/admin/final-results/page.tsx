"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect } from "react";
import { 
  CheckSquare, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Award, 
  Clock, 
  XCircle, 
  Loader2, 
  Mail 
} from "lucide-react";

export default function AdminFinalResultsPage() {
  const [pageError, setPageError] = useState("");
  const [decisions, setDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchDecisions = async () => {
    setLoading(true);
    try {
      setPageError("");
      const res = await apiResponse("/api/admin/final-results");
      const data = await res.json();
      if (data.decisions) setDecisions(data.decisions);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecisions();
  }, []);

  const handleUpdateStatus = async (studentId: string, newStatus: string) => {
    try {
      setPageError("");
      const res = await apiResponse("/api/admin/final-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_decision",
          studentId,
          finalStatus: newStatus,
          campaignId: decisions.find(d => d.student_id === studentId)?.campaign_id,
          expectedStatus: decisions.find(d => d.student_id === studentId)?.final_status,
          approvedBy: "Admissions Board Director",
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchDecisions();
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    }
  };

  const handleDispatchNotifications = async (statusFilter?: string) => {
    setDispatching(true);
    setBanner(null);

    try {
      setPageError("");
      const res = await apiResponse("/api/admin/final-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_notifications",
          statusFilter,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBanner({ type: "success", message: data.message });
        fetchDecisions();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to dispatch result notifications." });
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 13 (Stage 12)</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Final Selection Decisions & Result Dispatches</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Publish official admission offers, waiting list placements, and empathetic outcome notifications.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleDispatchNotifications("selected")}
            disabled={dispatching}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow flex items-center gap-1.5 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Send Selected Offer Emails
          </button>
          <button
            onClick={() => handleDispatchNotifications("unsuccessful")}
            disabled={dispatching}
            className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs shadow flex items-center gap-1.5 transition cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5" />
            Send Outcome Update Emails
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

      {/* Decisions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
              <tr>
                <th className="p-3.5">Candidate</th>
                <th className="p-3.5">Student / Exam ID</th>
                <th className="p-3.5">District</th>
                <th className="p-3.5">Composite Score</th>
                <th className="p-3.5">Decision Status</th>
                <th className="p-3.5">Approved By</th>
                <th className="p-3.5">Notification</th>
                <th className="p-3.5 text-right">Modify Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading selection decisions...
                  </td>
                </tr>
              ) : decisions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    {pageError ? "Data could not be loaded. Use refresh to try again." : "No decisions recorded yet."}
                  </td>
                </tr>
              ) : (
                decisions.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="p-3.5 font-bold text-slate-900">
                      {d.studentName}
                      <span className="block text-[11px] text-slate-400 font-normal">{d.email}</span>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-blue-700">{d.studentExamId}</td>
                    <td className="p-3.5">{d.district}</td>
                    <td className="p-3.5 font-extrabold text-slate-900">{d.composite_score || "-"}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                          d.final_status === "selected"
                            ? "bg-emerald-100 text-emerald-800"
                            : d.final_status === "waiting_list"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {d.final_status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-500">{d.approved_by}</td>
                    <td className="p-3.5">
                      {d.notification_status === "sent" ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Dispatched
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Pending Dispatch</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <select
                        value={d.final_status}
                        onChange={(e) => handleUpdateStatus(d.student_id, e.target.value)}
                        className="px-2 py-1 rounded-lg border border-slate-300 text-xs bg-white font-semibold"
                      >
                        <option value="selected">Selected</option>
                        <option value="waiting_list">Waiting List</option>
                        <option value="unsuccessful">Unsuccessful</option>
                        <option value="withdrawn">Withdrawn</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

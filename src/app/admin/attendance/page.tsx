"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect } from "react";
import { 
  UserCheck, 
  Search, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Printer, 
  Loader2, 
  User, 
  MapPin, 
  CreditCard 
} from "lucide-react";

export default function AdminAttendancePage() {
  const [pageError, setPageError] = useState("");
  const [workshops, setWorkshops] = useState<any[]>([]);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [marking, setMarking] = useState<string | null>(null);
  const [utInputs, setUtInputs] = useState<Record<string, string>>({});
  const [reconcileMarks, setReconcileMarks] = useState<Record<string, boolean>>({});
  const [canReconcileMarks, setCanReconcileMarks] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    apiResponse("/api/admin/workshops")
      .then((res) => res.json())
      .then((data) => {
        if (data.workshops && data.workshops.length > 0) {
          setWorkshops(data.workshops);
          const requested = new URLSearchParams(window.location.search).get("workshopId");
          setSelectedWorkshopId(data.workshops.some((w: any) => w.id === requested) ? requested! : data.workshops[0].id);
        }
      }).catch(e => setPageError(e.message));

  }, []);

  useEffect(() => {
    setCandidates([]);
    setNotification(null);
    if (!selectedWorkshopId) return;
    const controller = new AbortController();
    void loadRecentAttendance(controller.signal);
    return () => controller.abort();
  }, [selectedWorkshopId]);

  const loadRecentAttendance = (signal?: AbortSignal) => {
    if (!selectedWorkshopId) return;
    return apiResponse("/api/admin/attendance?workshopId=" + encodeURIComponent(selectedWorkshopId), {signal})
      .then((res) => res.json())
      .then((data) => {
        if (!signal?.aborted && data.attendance) {
          setRecentAttendance(data.attendance);
        }
      }).catch(e => { if (!signal?.aborted) setPageError(e.message); });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setNotification(null);

    try {
      setPageError("");
      const res = await apiResponse(
        `/api/admin/attendance?query=${encodeURIComponent(searchQuery.trim())}&workshopId=${selectedWorkshopId}`
      );
      const data = await res.json();
      if (data.candidates) {
        setCandidates(data.candidates);
        setCanReconcileMarks(Boolean(data.canReconcileMarks));
        if (data.candidates.length === 0) {
          setNotification({ type: "error", message: "No matching student record found." });
        }
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const handleMarkAttendance = async (studentId: string, status: "attended" | "late" | "absent") => {
    setMarking(studentId);
    setNotification(null);

    try {
      setPageError("");
      const res = await apiResponse("/api/admin/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workshopId: selectedWorkshopId,
          studentId,
          status,
          markedBy: "Entrance Desk Officer A",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNotification({
          type: "success",
          message: `Attendance confirmed for ${data.studentName}! Assigned Student / Exam ID: ${data.assignedExamId}`,
        });
        // Update local candidates view
        setCandidates((prev) =>
          prev.map((c) =>
            c.studentId === studentId
              ? { ...c, hasAttended: true, attendanceStatus: status, studentExamId: data.assignedExamId }
              : c
          )
        );
        loadRecentAttendance();
      } else {
        setNotification({ type: "error", message: data.message });
      }
    } catch (e: any) {
      setNotification({ type: "error", message: e.message || "Failed to mark attendance." });
    } finally {
      setMarking(null);
    }
  };

  const handleSaveUtNumber = async (studentId: string) => {
    if (reconcileMarks[studentId] && !window.confirm("Update this student's existing exam result IDs to the new UT number? Scores will stay unchanged and the correction will be audited.")) return;
    setMarking(studentId);
    setNotification(null);
    try {
      const res = await apiResponse("/api/admin/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshopId: selectedWorkshopId, studentId, utNumber: utInputs[studentId] || "", reconcileMarks: Boolean(reconcileMarks[studentId]) }),
      });
      const data = await res.json();
      setCandidates((current) => current.map((item) => item.studentId === studentId ? { ...item, utNumber: data.utNumber, studentExamId: data.utNumber } : item));
      setNotification({ type: "success", message: data.message });
      void loadRecentAttendance();
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Could not save UT number." });
    } finally {
      setMarking(null);
    }
  };

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 8 (Stage 6)</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Entrance Attendance & Student ID Desk</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Find a student by NIC last four, UT last three or four, reference, phone or name. Assign their UT number before the exam.
          </p>
        </div>

        {/* Workshop Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-700">Active Workshop:</label>
          <select
            value={selectedWorkshopId}
            disabled={Boolean(marking) || searching}
            onChange={(e) => setSelectedWorkshopId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white font-semibold focus:outline-none"
          >
            {workshops.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} ({w.venue})
              </option>
            ))}
          </select>
        </div>
      </div>

      {notification && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            notification.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600" />
          )}
          {notification.message}
        </div>
      )}

      {/* Fast Entrance Search Bar */}
      <div className="bg-white rounded-2xl border-2 border-blue-500/30 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-600" />
          Entrance Desk Quick Lookup (NIC / UT suffix / Mobile / Name)
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Type the last four NIC digits, last three or four UT digits, full phone number, or registration reference. Verify every match before assigning an ID.
        </p>

        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. 4567 (NIC suffix) or 0771234567 or Kavindu..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none uppercase font-mono"
            />
            <CreditCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition flex items-center gap-2 disabled:bg-blue-400 cursor-pointer"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Verify Student
          </button>
        </form>
      </div>

      {/* Search Matches & Verification Cards */}
      {candidates.length > 0 && (
        <div className="space-y-4">
          {candidates.length > 1 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                Multiple students match this search ({candidates.length} records found). Verify full name and contact number before assigning a UT number or marking attendance.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {candidates.map((cand) => (
              <div
                key={cand.studentId}
                className={`bg-white rounded-2xl border p-5 shadow-sm transition ${
                  cand.hasAttended ? "border-emerald-300 bg-emerald-50/20" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{cand.fullName}</h3>
                    <p className="text-xs text-slate-500 font-mono">Ref: {cand.registrationRef}</p>
                  </div>
                  {cand.hasAttended ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase">
                      Attended ({cand.attendanceStatus})
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] uppercase">
                      Unmarked
                    </span>
                  )}
                </div>

                {/* Candidate Verification Data (Masked) */}
                <div className="grid grid-cols-2 gap-3 my-4 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">NIC (Masked)</span>
                    <span className="font-mono font-bold text-slate-800">{cand.maskedNic}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Phone (Masked)</span>
                    <span className="font-mono font-bold text-slate-800">{cand.maskedPhone}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">District</span>
                    <span className="font-semibold text-slate-800">{cand.district}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Unique Student ID</span>
                    <span className="font-mono font-bold text-blue-700">
                      {cand.studentExamId || "Will generate on check-in"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">UT Number</span>
                    <span className="font-mono font-bold text-blue-700">{cand.utNumber || "Not assigned"}</span>
                  </div>
                </div>

                {!cand.utNumber && <div className="mb-3 flex gap-2">
                  <label className="flex-1 text-xs font-semibold">Assign UT number
                    <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase" value={utInputs[cand.studentId] || ""} onChange={(event) => setUtInputs((current) => ({ ...current, [cand.studentId]: event.target.value.toUpperCase() }))} placeholder="UT011000" maxLength={8} />
                  </label>
                  <button type="button" className="self-end rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={Boolean(marking) || !utInputs[cand.studentId]} onClick={() => void handleSaveUtNumber(cand.studentId)}>Save UT</button>
                </div>}
                {!cand.utNumber && canReconcileMarks && cand.existingMarksCount > 0 && <label className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <input type="checkbox" checked={Boolean(reconcileMarks[cand.studentId])} onChange={(event) => setReconcileMarks((current) => ({ ...current, [cand.studentId]: event.target.checked }))} />
                  Update {cand.existingMarksCount} existing exam result ID(s) to this UT number. Scores remain unchanged. Admin only.
                </label>}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleMarkAttendance(cand.studentId, "attended")}
                    disabled={marking === cand.studentId}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Attended
                  </button>
                  <button
                    onClick={() => handleMarkAttendance(cand.studentId, "late")}
                    disabled={marking === cand.studentId}
                    className="py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition flex items-center justify-center gap-1"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Late
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verified Attendees Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900">Recent Entrance Desk Check-ins</h2>
          <span className="text-xs text-slate-400">Total Check-ins: {recentAttendance.length}</span>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
              <tr>
                <th className="p-3">Student / Exam ID</th>
                <th className="p-3">Student Name</th>
                <th className="p-3">Masked NIC</th>
                <th className="p-3">Status</th>
                <th className="p-3">Marked By</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentAttendance.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold text-blue-700">{att.utNumber || att.student_exam_id}</td>
                  <td className="p-3 font-bold text-slate-900">{att.studentName}</td>
                  <td className="p-3 font-mono">{att.maskedNic}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase">
                      {att.status}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500">{att.marked_by}</td>
                  <td className="p-3 text-slate-400">{new Date(att.marked_at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

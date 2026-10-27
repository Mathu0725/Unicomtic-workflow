"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect } from "react";
import { Award, Plus, CheckCircle2, Clock, Users, Loader2, X } from "lucide-react";

export default function AdminExamsPage() {
  const [pageError, setPageError] = useState("");
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [maxMarks, setMaxMarks] = useState(100);
  const [passMark, setPassMark] = useState(50);
  const [weightage, setWeightage] = useState(100);
  const [requiresAttendance, setRequiresAttendance] = useState(true);

  const fetchExams = async () => {
    setLoading(true);
    try {
      setPageError("");
      const res = await apiResponse("/api/admin/exams");
      const data = await res.json();
      if (data.exams) setExams(data.exams);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      setPageError("");
      const res = await apiResponse("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: "camp-2025",
          name,
          examDate: new Date(examDate).toISOString(),
          maxMarks,
          passMark,
          weightage,
          requiresWorkshopAttendance: requiresAttendance,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        setName("");
        fetchExams();
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Could not load or save this data. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 9</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Examination & Aptitude Management</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Configure examination papers, maximum marks, pass criteria thresholds, and participation conditions.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create New Examination
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-2 p-12 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            Loading examinations...
          </div>
        ) : (
          exams.map((exam) => (
            <div key={exam.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
                    {exam.campaignTitle}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800">
                    {exam.status}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mb-2">{exam.name}</h2>
                <div className="text-xs text-slate-500 mb-4 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Scheduled: {new Date(exam.exam_date).toLocaleString()}
                </div>

                <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Max Marks</span>
                    <span className="font-extrabold text-slate-900">{exam.max_marks}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Pass Mark</span>
                    <span className="font-extrabold text-emerald-700">{exam.pass_mark}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Weightage</span>
                    <span className="font-extrabold text-blue-700">{exam.weightage}%</span>
                  </div>
                </div>
              </div>

              {/* Stats Footer */}
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>{exam.totalCandidates} Evaluated Candidates</span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700">
                  {exam.passedCandidates} Passed ({exam.failedCandidates} Failed)
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative text-xs">
            <button
              onClick={() => setShowModal(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 absolute top-4 right-4"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-slate-900 mb-4">Create New Examination</h2>

            <form onSubmit={handleCreateExam} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Exam Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. National Logic & Aptitude Assessment"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Exam Date & Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Max Marks *</label>
                  <input
                    type="number"
                    required
                    value={maxMarks}
                    onChange={(e) => setMaxMarks(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pass Mark Threshold *</label>
                  <input
                    type="number"
                    required
                    value={passMark}
                    onChange={(e) => setPassMark(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="reqAtt"
                    checked={requiresAttendance}
                    onChange={(e) => setRequiresAttendance(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <label htmlFor="reqAtt" className="font-semibold text-slate-800 cursor-pointer">
                    Requires Workshop Attendance
                  </label>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow"
                >
                  {creating ? "Saving..." : "Create Exam"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

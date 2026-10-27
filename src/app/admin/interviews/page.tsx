"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect } from "react";
import { 
  Users2, 
  Calendar, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  Award, 
  Plus, 
  Loader2, 
  X, 
  FileEdit 
} from "lucide-react";

export default function AdminInterviewsPage() {
  const [pageError, setPageError] = useState("");
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);

  // Rubric Evaluation Form
  const [commScore, setCommScore] = useState(20);
  const [techScore, setTechScore] = useState(30);
  const [anaScore, setAnaScore] = useState(20);
  const [overallScore, setOverallScore] = useState(12);
  const [recommendation, setRecommendation] = useState<any>("recommend");
  const [notes, setNotes] = useState("");
  const [submittingEval, setSubmittingEval] = useState(false);

  const fetchInterviews = async () => {
    setLoading(true);
    try {
      setPageError("");
      const res = await apiResponse("/api/admin/interviews");
      const data = await res.json();
      if (data.interviews) setInterviews(data.interviews);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInterviews();
  }, []);

  const handleOpenEvaluation = (cand: any) => {
    setSelectedCandidate(cand);
    if (cand.evaluation) {
      setCommScore(cand.evaluation.communication_score);
      setTechScore(cand.evaluation.technical_score);
      setAnaScore(cand.evaluation.analytical_score);
      setOverallScore(cand.evaluation.overall_score);
      setRecommendation(cand.evaluation.recommendation);
      setNotes(cand.evaluation.notes || "");
    }
  };

  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    setSubmittingEval(true);

    try {
      setPageError("");
      const res = await apiResponse("/api/admin/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_evaluation",
          candidateId: selectedCandidate.id,
          expectedSubmittedAt: selectedCandidate.evaluation?.submitted_at || null,
          interviewerName: "Prof. Panel Chair",
          communicationScore: commScore,
          technicalScore: techScore,
          analyticalScore: anaScore,
          overallScore: overallScore,
          recommendation,
          notes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSelectedCandidate(null);
        fetchInterviews();
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Could not load or save this data. Please try again.");
    } finally {
      setSubmittingEval(false);
    }
  };

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 12 (Stage 11)</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Interview Boards & Candidate Scoring</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Conduct panel admissions interviews, manage candidate slots, and record confidential evaluation rubrics.
          </p>
        </div>
      </div>

      {/* Sessions View */}
      <div className="space-y-6">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            Loading interview sessions...
          </div>
        ) : (
          interviews.map((intv) => (
            <div key={intv.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{intv.title}</h2>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(intv.date).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      {intv.venue}
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 self-start sm:self-auto">
                  {intv.totalCandidates} Assigned Candidates
                </span>
              </div>

              {/* Panel members */}
              <div className="mt-3 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Interview Panel:</span>{" "}
                {Array.isArray(intv.panel_members) ? intv.panel_members.join(", ") : intv.panel_members}
              </div>

              {/* Candidates Table */}
              <div className="mt-4 overflow-x-auto text-xs">
                <table className="w-full text-left text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Candidate</th>
                      <th className="p-3">Time Slot</th>
                      <th className="p-3">District</th>
                      <th className="p-3">Evaluation Status</th>
                      <th className="p-3">Recommendation</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {intv.candidates.map((cand: any) => (
                      <tr key={cand.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{cand.studentName}</td>
                        <td className="p-3 font-mono text-slate-500">
                          {new Date(cand.time_slot).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="p-3">{cand.district}</td>
                        <td className="p-3">
                          {cand.evaluation ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              Scored ({cand.evaluation.overall_score + cand.evaluation.technical_score + cand.evaluation.communication_score + cand.evaluation.analytical_score} / 100)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px]">
                              Pending Scoring
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-semibold text-blue-700">
                          {cand.evaluation?.recommendation?.replace("_", " ").toUpperCase() || "-"}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleOpenEvaluation(cand)}
                            className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition inline-flex items-center gap-1"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                            {cand.evaluation ? "Edit Rubric" : "Score Rubric"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Evaluation Rubric Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative text-xs">
            <button
              onClick={() => setSelectedCandidate(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 absolute top-4 right-4"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-base font-bold text-slate-900 mb-1">
              Confidential Evaluation Rubric: {selectedCandidate.studentName}
            </h2>
            <p className="text-slate-500 mb-4">Admissions Committee Panel Assessment</p>

            <form onSubmit={handleSubmitEvaluation} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Communication & Articulation (Max 25)
                  </label>
                  <input
                    type="number"
                    max={25}
                    min={0}
                    value={commScore}
                    onChange={(e) => setCommScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Technical Aptitude (Max 35)
                  </label>
                  <input
                    type="number"
                    max={35}
                    min={0}
                    value={techScore}
                    onChange={(e) => setTechScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Analytical Reasoning (Max 25)
                  </label>
                  <input
                    type="number"
                    max={25}
                    min={0}
                    value={anaScore}
                    onChange={(e) => setAnaScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Attitude & Culture Fit (Max 15)
                  </label>
                  <input
                    type="number"
                    max={15}
                    min={0}
                    value={overallScore}
                    onChange={(e) => setOverallScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Panel Recommendation</label>
                <select
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold"
                >
                  <option value="strongly_recommend">Strongly Recommend for Direct Admission</option>
                  <option value="recommend">Recommend for Admission</option>
                  <option value="neutral">Neutral / Consider for Waiting List</option>
                  <option value="not_recommended">Not Recommended</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Confidential Interviewer Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Key observations on coding maturity, English fluency, commitment..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCandidate(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEval}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow"
                >
                  {submittingEval ? "Saving Rubric..." : "Submit Confidential Score"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice, buttonClass } from "@/components/live-data";
import { AssignInterviewForm, CreateInterviewForm, IntakeSelect, type CandidateOption, type IntakeOption } from "@/components/admissions-workflow-controls";
import type { Interview, InterviewCandidate, InterviewEvaluation } from "@/lib/data/store";

import { useState, useEffect, useRef } from "react";
import { 
  MapPin, 
  Clock, 
  Plus, 
  Loader2, 
  X, 
  FileEdit 
} from "lucide-react";

type CandidateView = InterviewCandidate & { studentName: string; district: string; evaluation: InterviewEvaluation | null };
type InterviewView = Interview & { totalCandidates: number; candidates: CandidateView[] };
export default function AdminInterviewsPage() {
  const [pageError, setPageError] = useState("");
  const [interviews, setInterviews] = useState<InterviewView[]>([]);
  const [intakes, setIntakes] = useState<IntakeOption[]>([]), [campaignId, setCampaignId] = useState("");
  const [candidates, setCandidates] = useState<CandidateOption[]>([]), [interviewer, setInterviewer] = useState("");
  const [creating, setCreating] = useState(false), [assigning, setAssigning] = useState<string | null>(null), [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateView | null>(null);

  // Rubric Evaluation Form
  const [commScore, setCommScore] = useState(0);
  const [techScore, setTechScore] = useState(0);
  const [anaScore, setAnaScore] = useState(0);
  const [overallScore, setOverallScore] = useState(0);
  const [recommendation, setRecommendation] = useState<InterviewEvaluation["recommendation"]>("neutral");
  const [notes, setNotes] = useState("");
  const [submittingEval, setSubmittingEval] = useState(false);

  const fetchInterviews = async () => {
    setLoading(true);
    try {
      setPageError("");
      const res = await apiResponse("/api/admin/interviews");
      const data = await res.json();
      if (data.interviews) setInterviews(data.interviews);
      setIntakes(data.campaigns || []); setCandidates(data.candidates || []); setInterviewer(data.interviewerName || "");
      setCampaignId(current => current || data.campaigns?.find((item: IntakeOption) => item.id === new URLSearchParams(window.location.search).get("campaignId"))?.id || data.campaigns?.find((item: IntakeOption) => item.is_active)?.id || data.campaigns?.[0]?.id || "");
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInterviews();
  }, []);

  useEffect(() => { if (selectedCandidate) dialog.current?.showModal(); }, [selectedCandidate]);

  const saveWorkflow = async (action: Record<string, unknown>) => {
    const response = await apiResponse("/api/admin/interviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
    const data = await response.json();
    setMessage(data.message); setCreating(false); setAssigning(null);
    await fetchInterviews();
  };

  const handleOpenEvaluation = (cand: CandidateView) => {
    setPageError("");
    setSelectedCandidate(cand);
    setCommScore(cand.evaluation?.communication_score ?? 0);
    setTechScore(cand.evaluation?.technical_score ?? 0);
    setAnaScore(cand.evaluation?.analytical_score ?? 0);
    setOverallScore(cand.evaluation?.overall_score ?? 0);
    setRecommendation(cand.evaluation?.recommendation ?? "neutral");
    setNotes(cand.evaluation?.notes || "");
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
          interviewerName: interviewer,
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
      <RequestNotice>{message}</RequestNotice>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Admissions · Interviews</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Interview Boards & Candidate Scoring</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Conduct panel admissions interviews, manage candidate slots, and record confidential evaluation rubrics.
          </p>
        </div>
        <button className={buttonClass} disabled={loading || !campaignId} onClick={() => { setCreating(true); setAssigning(null); }}><Plus className="h-4 w-4" />Create interview session</button>
      </div>

      <IntakeSelect intakes={intakes} value={campaignId} onChange={id => { setCampaignId(id); setCreating(false); setAssigning(null); setMessage(""); }} />
      {creating && <CreateInterviewForm key={campaignId} campaignId={campaignId} onSave={saveWorkflow} onCancel={() => setCreating(false)} />}

      {/* Sessions View */}
      <div className="space-y-6">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            Loading interview sessions...
          </div>
        ) : (
          interviews.filter(intv => !campaignId || intv.campaign_id === campaignId).map((intv) => (
            <div key={intv.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{intv.title}</h2>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(intv.date).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}
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

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">{intv.status.replaceAll("_", " ")} · Times shown in Sri Lanka time</p>
                <button className={buttonClass} disabled={intv.status === "completed"} onClick={() => { setAssigning(intv.id); setCreating(false); }}>Assign candidates</button>
              </div>
              {assigning === intv.id && <div className="mt-4"><AssignInterviewForm key={intv.id} interviewId={intv.id} start={new Date(Math.max(Date.parse(intv.date), ...intv.candidates.filter(c => c.status !== "cancelled").map(c => Date.parse(c.time_slot) + 30 * 60000))).toISOString()} candidates={candidates.filter(c => c.campaignId === intv.campaign_id && !intv.candidates.some(assigned => assigned.student_id === c.studentId))} onSave={saveWorkflow} onCancel={() => setAssigning(null)} /></div>}

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
                    {!intv.candidates.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No candidates assigned. Choose candidates to schedule their interviews.</td></tr>}
                    {intv.candidates.map((cand) => (
                      <tr key={cand.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{cand.studentName}</td>
                        <td className="p-3 font-mono text-slate-500">
                          {new Date(cand.time_slot).toLocaleString("en-GB", { timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short" })}
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
                            disabled={cand.status === "cancelled"}
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
        {!loading && !interviews.some(intv => !campaignId || intv.campaign_id === campaignId) && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="font-bold text-slate-900">No interview sessions yet</h2><p className="mt-2 text-sm text-slate-500">Create a session for this intake, then assign candidates and record their evaluations.</p></div>}
      </div>

      {/* Evaluation Rubric Modal */}
      {selectedCandidate && (
        <dialog ref={dialog} aria-labelledby="evaluation-title" onCancel={event => { event.preventDefault(); if (!submittingEval) setSelectedCandidate(null); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl p-0 backdrop:bg-slate-900/60">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative text-xs">
            <button
              onClick={() => setSelectedCandidate(null)}
              aria-label="Close evaluation" disabled={submittingEval}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 absolute top-4 right-4"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 id="evaluation-title" className="text-base font-bold text-slate-900 mb-1 pr-6">
              Confidential Evaluation Rubric: {selectedCandidate.studentName}
            </h2>
            <p className="text-slate-500 mb-4">Admissions Committee Panel Assessment</p>
            <RequestNotice error>{pageError}</RequestNotice>

            <form onSubmit={handleSubmitEvaluation} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="communication-score" className="block font-semibold text-slate-700 mb-1">
                    Communication & Articulation (Max 25)
                  </label>
                  <input
                    id="communication-score" required
                    type="number"
                    max={25}
                    min={0}
                    value={commScore}
                    onChange={(e) => setCommScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="technical-score" className="block font-semibold text-slate-700 mb-1">
                    Technical Aptitude (Max 35)
                  </label>
                  <input
                    id="technical-score" required
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
                  <label htmlFor="analytical-score" className="block font-semibold text-slate-700 mb-1">
                    Analytical Reasoning (Max 25)
                  </label>
                  <input
                    id="analytical-score" required
                    type="number"
                    max={25}
                    min={0}
                    value={anaScore}
                    onChange={(e) => setAnaScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="overall-score" className="block font-semibold text-slate-700 mb-1">
                    Attitude & Culture Fit (Max 15)
                  </label>
                  <input
                    id="overall-score" required
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
                <label htmlFor="recommendation" className="block font-semibold text-slate-700 mb-1">Panel Recommendation</label>
                <select
                  id="recommendation"
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value as InterviewEvaluation["recommendation"])}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold"
                >
                  <option value="strongly_recommend">Strongly Recommend for Direct Admission</option>
                  <option value="recommend">Recommend for Admission</option>
                  <option value="neutral">Neutral / Consider for Waiting List</option>
                  <option value="not_recommended">Not Recommended</option>
                </select>
              </div>

              <div>
                <label htmlFor="evaluation-notes" className="block font-semibold text-slate-700 mb-1">Confidential Interviewer Notes</label>
                <textarea
                  id="evaluation-notes"
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
                  disabled={submittingEval}
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
        </dialog>
      )}
    </div>
  );
}

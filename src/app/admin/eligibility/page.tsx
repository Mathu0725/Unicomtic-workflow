"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";
import { IntakeSelect, type IntakeOption } from "@/components/admissions-workflow-controls";

import { useState, useEffect } from "react";
import { 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Award, 
  Loader2, 
  RefreshCw, 
  Send 
} from "lucide-react";

export default function AdminEligibilityPage() {
  const [pageError, setPageError] = useState("");
  const [intakes, setIntakes] = useState<IntakeOption[]>([]), [campaignId, setCampaignId] = useState("");
  const [minScore, setMinScore] = useState(50);
  const [requireAttendance, setRequireAttendance] = useState(true);
  const [requireApplication, setRequireApplication] = useState(true);
  const [maxShortlist, setMaxShortlist] = useState<number | "">("");
  const [tieBreaker, setTieBreaker] = useState("higher_al_results");

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any | null>(null);

  const calculateEligibility = async () => {
    setLoading(true);
    try {
      setPageError("");
      const res = await apiResponse("/api/admin/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaignId || undefined,
          minExamScore: minScore,
          requireWorkshopAttendance: requireAttendance,
          requireApplicationSubmission: requireApplication,
          maxShortlistCount: maxShortlist ? Number(maxShortlist) : undefined,
          tieBreakRule: tieBreaker,
        }),
      });
      const data = await res.json();
      setIntakes(data.campaigns || []); setCampaignId(data.campaignId || "");
      if (data.report) {
        setReport(data.report);
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateEligibility();
  }, []);

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 11 (Stage 10)</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Eligibility Rules Engine & Shortlists</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Dynamically calculate admission qualification criteria, workshop prerequisites, and disqualification reasons.
          </p>
        </div>
      </div>

      <IntakeSelect intakes={intakes} value={campaignId} onChange={id => { if (loading) return; setCampaignId(id); setReport(null); }} />
      {campaignId && <p className="text-sm text-slate-600">After reviewing the shortlist, <a className="font-semibold text-blue-700 underline" href={`/admin/interviews?campaignId=${encodeURIComponent(campaignId)}`}>create an interview session and choose candidates</a>.</p>}

      {/* Rules Config Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Filter className="w-4 h-4 text-blue-600" />
          Configurable Eligibility Criteria
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Minimum Exam Score</label>
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Max Shortlist Size (Optional)</label>
            <input
              type="number"
              value={maxShortlist}
              onChange={(e) => setMaxShortlist(e.target.value ? Number(e.target.value) : "")}
              placeholder="e.g. 50"
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tie-Breaker Rule</label>
            <select
              value={tieBreaker}
              onChange={(e) => setTieBreaker(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
            >
              <option value="higher_al_results">Higher G.C.E. A/L Z-Score</option>
              <option value="higher_exam_score">Higher Exam Score</option>
              <option value="earlier_registration">Earlier Registration Timestamp</option>
            </select>
          </div>

          <div className="flex flex-col justify-end space-y-2">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={requireAttendance}
                onChange={(e) => setRequireAttendance(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Require Workshop Attendance
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={requireApplication}
                onChange={(e) => setRequireApplication(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Require Application Submitted
            </label>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={calculateEligibility}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition flex items-center gap-1.5 cursor-pointer disabled:bg-blue-300"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Recalculate Shortlist & Reasons
          </button>
        </div>
      </div>

      {/* Results View */}
      {report && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-400 font-semibold block">Total Evaluated</span>
              <span className="text-2xl font-black text-slate-900">{report.totalEvaluated}</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 text-xs">
              <span className="text-emerald-700 font-semibold block">Eligible for Interview</span>
              <span className="text-2xl font-black text-emerald-800">{report.totalEligible}</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/20 text-xs">
              <span className="text-red-700 font-semibold block">Ineligible Candidates</span>
              <span className="text-2xl font-black text-red-800">{report.totalIneligible}</span>
            </div>
          </div>

          {/* Eligible Candidates Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Qualified Shortlisted Candidates ({report.eligibleCandidates.length})
              </h2>
            </div>
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-3 w-16">Rank</th>
                    <th className="p-3">Student Exam ID</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">District</th>
                    <th className="p-3">Exam Score</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.eligibleCandidates.map((c: any) => (
                    <tr key={c.studentId} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">#{c.rank}</td>
                      <td className="p-3 font-mono font-bold text-blue-700">{c.studentExamId}</td>
                      <td className="p-3 font-bold text-slate-900">{c.studentName}</td>
                      <td className="p-3">{c.district}</td>
                      <td className="p-3 font-bold text-emerald-700">{c.examScore} / 100</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          QUALIFIED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ineligible Candidates Table with Explanations */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-red-600" />
                Disqualified Candidates with Explicit Rejection Reasons ({report.ineligibleCandidates.length})
              </h2>
            </div>
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Candidate</th>
                    <th className="p-3">District</th>
                    <th className="p-3">Exam Score</th>
                    <th className="p-3">Disqualification Justification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.ineligibleCandidates.map((c: any) => (
                    <tr key={c.studentId} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">
                        {c.studentName}
                        <span className="block font-mono text-[10px] text-slate-400">{c.studentExamId}</span>
                      </td>
                      <td className="p-3">{c.district}</td>
                      <td className="p-3 font-bold text-slate-700">{c.examScore !== null ? c.examScore : "Not Taken"}</td>
                      <td className="p-3">
                        <div className="space-y-0.5 text-red-700 font-semibold">
                          {c.reasons.map((r: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-1">
                              &bull; {r}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

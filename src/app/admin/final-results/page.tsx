"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice, buttonClass } from "@/components/live-data";
import { CreateDecisionForm, IntakeSelect, type CandidateOption, type IntakeOption } from "@/components/admissions-workflow-controls";
import type { SelectionDecision } from "@/lib/data/store";

import { useState, useEffect } from "react";
import { 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Mail 
} from "lucide-react";

type DecisionView = SelectionDecision & { studentName: string; email: string; studentExamId: string; district: string; campaignTitle: string; examScore: number | null };
export default function AdminFinalResultsPage() {
  const [pageError, setPageError] = useState("");
  const [decisions, setDecisions] = useState<DecisionView[]>([]);
  const [intakes, setIntakes] = useState<IntakeOption[]>([]), [campaignId, setCampaignId] = useState("");
  const [candidates, setCandidates] = useState<CandidateOption[]>([]), [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState<string | null>(null), [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
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
      setIntakes(data.campaigns || []); setCandidates(data.candidates || []);
      setCampaignId(current => current || data.campaigns?.find((item: IntakeOption) => item.id === new URLSearchParams(window.location.search).get("campaignId"))?.id || data.campaigns?.find((item: IntakeOption) => item.is_active)?.id || data.campaigns?.[0]?.id || "");
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecisions();
  }, []);

  const handleUpdateStatus = async (decision: DecisionView, newStatus: string) => {
    setSaving(decision.id);
    try {
      setPageError("");
      const res = await apiResponse("/api/admin/final-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_decision",
          studentId: decision.student_id,
          finalStatus: newStatus,
          campaignId: decision.campaign_id,
          expectedStatus: decision.final_status,
          expectedDecisionId: decision.id,
          expectedRevision: decision.revision || 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchDecisions();
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setSaving(null);
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
          campaignId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBanner({ type: "success", message: data.message });
        setDispatchStatus(null);
        await fetchDecisions();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to dispatch result notifications." });
    } finally {
      setDispatching(false);
    }
  };

  const visibleDecisions = decisions.filter(decision => !campaignId || decision.campaign_id === campaignId);
  const draftCandidates = candidates.filter(candidate => candidate.campaignId === campaignId && !decisions.some(decision => decision.campaign_id === campaignId && decision.student_id === candidate.studentId));
  const saveDraft = async (action: Record<string, unknown>) => {
    const response = await apiResponse("/api/admin/final-results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
    const data = await response.json(); setCreating(false); setBanner({ type: "success", message: data.message }); await fetchDecisions();
  };

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Admissions · Final results</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Final Selection Decisions & Result Dispatches</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Publish official admission offers, waiting list placements, and empathetic outcome notifications.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className={buttonClass} disabled={loading || !campaignId || dispatching || Boolean(saving)} onClick={() => setCreating(true)}>Create draft decision</button>
          <button
            onClick={() => setDispatchStatus("selected")}
            disabled={dispatching || loading || !campaignId || Boolean(saving) || !visibleDecisions.some(d => d.final_status === "selected" && d.notification_status !== "sent")}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            Send Selected Offer Emails
          </button>
          <button
            onClick={() => setDispatchStatus("unsuccessful")}
            disabled={dispatching || loading || !campaignId || Boolean(saving) || !visibleDecisions.some(d => d.final_status === "unsuccessful" && d.notification_status !== "sent")}
            className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs shadow flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <Mail className="w-3.5 h-3.5" />
            Send Outcome Update Emails
          </button>
          <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={dispatching || loading || !campaignId || Boolean(saving) || !visibleDecisions.some(d => d.final_status === "waiting_list" && d.notification_status !== "sent")} onClick={() => setDispatchStatus("waiting_list")}>Send Waiting List Emails</button>
        </div>
      </div>

      <IntakeSelect intakes={intakes} value={campaignId} onChange={id => { if (dispatching || saving) return; setCampaignId(id); setCreating(false); setDispatchStatus(null); setBanner(null); }} />
      {creating && <CreateDecisionForm key={campaignId} campaignId={campaignId} candidates={draftCandidates} onSave={saveDraft} onCancel={() => setCreating(false)} />}
      {dispatchStatus && <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-5" aria-label="Review result emails"><h2 className="font-bold">Review result emails</h2><p className="text-sm">Intake: <strong>{intakes.find(intake => intake.id === campaignId)?.title}</strong>. Outcome: <strong>{dispatchStatus.replaceAll("_", " ")}</strong>. {visibleDecisions.filter(d => d.final_status === dispatchStatus && d.notification_status !== "sent").length} decisions awaiting delivery. Already queued or delivered versions are skipped.</p><p className="text-sm text-slate-600">Review the decisions below before queuing. Provider limits may delay delivery. Failed jobs can be reviewed in Email Center.</p><div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={dispatching || loading || Boolean(saving)} onClick={() => handleDispatchNotifications(dispatchStatus)}>{dispatching ? "Queuing…" : "Queue reviewed result emails"}</button><button className="rounded-xl bg-white px-4 py-2 text-sm font-semibold" disabled={dispatching} onClick={() => setDispatchStatus(null)}>Cancel</button></div></section>}

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
              ) : visibleDecisions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    {pageError ? "Data could not be loaded. Refresh to try again." : "No decisions recorded yet. Create a draft decision to start reviewing this intake."}
                  </td>
                </tr>
              ) : (
                visibleDecisions.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="p-3.5 font-bold text-slate-900">
                      {d.studentName}
                      <span className="block text-[11px] text-slate-400 font-normal">{d.email}</span>
                      <span className="block text-[11px] text-slate-500 font-normal">{d.campaignTitle}</span>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-blue-700">{d.studentExamId}</td>
                    <td className="p-3.5">{d.district}</td>
                    <td className="p-3.5 font-extrabold text-slate-900">{d.composite_score ?? "-"}<span className="block text-[11px] font-normal text-slate-500">Exam: {d.examScore ?? "—"}{d.rank ? ` · Rank ${d.rank}` : ""}</span></td>
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
                        <span className="text-slate-500 text-[11px]">{d.notification_status === "failed" ? "Needs attention — Email Center" : "Pending Dispatch"}</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <select
                        value={d.final_status}
                        aria-label={`Decision for ${d.studentName} (${d.campaignTitle || d.campaign_id})`}
                        disabled={Boolean(saving) || dispatching}
                        onChange={(e) => handleUpdateStatus(d, e.target.value)}
                        className="px-2 py-1 rounded-lg border border-slate-300 text-xs bg-white font-semibold"
                      >
                        <option value="pending_decision">Pending decision</option>
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

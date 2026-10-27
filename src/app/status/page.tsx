"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import CandidateAccessGate from "@/components/candidate-access-gate";
import { apiResponse } from "@/lib/client/api";
import { 
  Search, 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertCircle, 
  User, 
  Award, 
  ArrowLeft, 
  Building2, 
  GraduationCap 
} from "lucide-react";

function StatusContent() {
  const searchParams = useSearchParams();
  const initialRef = searchParams.get("ref") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<any | null>(null);

  const fetchStatus = async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setStatusData(null);

    try {
      const url = `/api/status?ref=${encodeURIComponent(query.trim())}`;

      const res = await apiResponse(url);
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Record not found. Please verify your reference or NIC.");
        setStatusData(null);
      } else {
        setStatusData(data.data);
      }
    } catch (err: any) {
      setError(err.message || "Could not refresh your status. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <CandidateAccessGate reference={initialRef} onVerified={reference => { void fetchStatus(reference); }}>
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Portal Home
        </Link>

        {/* Search Box Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm mb-6">
          <BrandLogo className="h-16 w-16 mb-3" priority />
          <span className="text-xs font-semibold tracking-wider uppercase text-blue-600">
            Lifecycle Progress Tracker
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1 mb-4">
            Track Your Student Admission Status
          </h1>
          <p className="text-sm text-slate-600 mb-6">
            Your registered email has been verified for this admission record.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => void fetchStatus(statusData?.referenceNo || initialRef)}
              disabled={loading}
              className="py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow transition disabled:bg-blue-400 cursor-pointer"
            >
              {loading ? "Refreshing..." : "Refresh status"}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Results View */}
        {statusData && (
          <div className="space-y-6">
            {/* Student Profile Overview Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Candidate</span>
                  <h2 className="text-xl font-bold text-slate-900">{statusData.studentName}</h2>
                </div>
                <div className="text-sm sm:text-right">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    Ref: {statusData.referenceNo}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">District</span>
                  <span className="font-semibold text-slate-800">{statusData.district}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Masked NIC</span>
                  <span className="font-semibold text-slate-800">{statusData.maskedNic}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Student Exam ID</span>
                  <span className="font-semibold text-blue-700">{statusData.studentExamId || "Pending Workshop"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Campaign</span>
                  <span className="font-semibold text-slate-800">{statusData.campaignTitle}</span>
                </div>
              </div>
            </div>

            {/* Lifecycle Stages Stepper */}
            {statusData.workshops?.length > 0 && <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3"><h3 className="font-bold">Your workshop bookings</h3>{statusData.workshops.map((w: any, i: number) => <div key={i} className="border-t pt-3 text-sm"><strong>{w.title}</strong><p>{new Date(w.startsAt).toLocaleString()} · {w.venue}</p><p>{w.address}</p><span className="text-emerald-700 font-semibold">Seat {w.bookingStatus}</span>{w.mapsUrl && <a className="ml-3 text-blue-600" target="_blank" rel="noreferrer" href={w.mapsUrl}>View location</a>}</div>)}</div>}
            {statusData.notifications?.length > 0 && <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3"><h3 className="font-bold">Notification status</h3>{statusData.notifications.map((j: any, i: number) => <p key={i} className="text-xs">{j.subject} — <strong>{j.status}</strong></p>)}</div>}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-6">Student Lifecycle Stages</h3>

              <div className="space-y-6">
                {/* Stage 1: Registration */}
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Stage 1: Registration Completed</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Registration reference {statusData.referenceNo} generated. Recorded at {new Date(statusData.registeredAt).toLocaleDateString()}.
                    </p>
                  </div>
                </div>

                {/* Stage 2: Application */}
                <div className="flex items-start gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    statusData.applicationNo ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                  }`}>
                    {statusData.applicationNo ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Stage 2: Formal Educational Application {statusData.applicationNo ? `(${statusData.applicationNo})` : "(In Progress)"}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {statusData.applicationNo
                        ? `Application submitted with educational qualifications. Status: ${statusData.applicationStatus.toUpperCase()}`
                        : "Application pending submission. Please complete your educational profile."}
                    </p>
                    {!statusData.applicationNo && (
                      <Link
                        href={`/apply?ref=${encodeURIComponent(statusData.referenceNo)}`}
                        className="inline-block mt-2 text-xs font-bold text-blue-600 hover:text-blue-800 underline"
                      >
                        Complete Application Now &rarr;
                      </Link>
                    )}
                  </div>
                </div>

                {/* Stage 3: Workshop & Entrance ID */}
                <div className="flex items-start gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    statusData.workshopAttended ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                  }`}>
                    {statusData.workshopAttended ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Stage 3: Orientation Workshop & Student ID Assignment
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {statusData.workshopAttended
                        ? `Workshop attendance verified. Permanent Student / Exam ID: ${statusData.studentExamId}`
                        : "Workshop scheduling in progress. Present your NIC at the entrance desk to receive your Student ID."}
                    </p>
                  </div>
                </div>

                {/* Stage 4: Examination */}
                <div className="flex items-start gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    statusData.examPassed !== null ? (statusData.examPassed ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600") : "bg-slate-100 text-slate-400"
                  }`}>
                    {statusData.examPassed !== null ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Stage 4: Entrance Aptitude Examination</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {statusData.examPassed === true && "Examination evaluated: Passed minimum qualification criteria."}
                      {statusData.examPassed === false && "Examination marks recorded: Under review by admissions committee."}
                      {statusData.examPassed === null && "Awaiting examination conduct / OMR optical evaluation."}
                    </p>
                  </div>
                </div>

                {/* Stage 5: Final Selection */}
                <div className="flex items-start gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    statusData.finalStatus === "selected"
                      ? "bg-emerald-100 text-emerald-600"
                      : statusData.finalStatus === "waiting_list"
                      ? "bg-amber-100 text-amber-600"
                      : statusData.finalStatus === "unsuccessful"
                      ? "bg-red-100 text-red-600"
                      : "bg-slate-100 text-slate-400"
                  }`}>
                    {statusData.finalStatus === "selected" ? (
                      <Award className="w-5 h-5" />
                    ) : statusData.finalStatus === "unsuccessful" ? (
                      <XCircle className="w-5 h-5" />
                    ) : (
                      <Clock className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Stage 5: Final Admission Decision (
                      {statusData.finalStatus.replace("_", " ").toUpperCase()})
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {statusData.finalStatus === "selected" && (
                        <span className="text-emerald-700 font-semibold">
                          Congratulations! You have been officially selected for intake admission. Check your email for enrollment documents.
                        </span>
                      )}
                      {statusData.finalStatus === "waiting_list" && (
                        <span className="text-amber-700 font-semibold">
                          You are currently placed on the Waiting List. You will be notified if a seat becomes vacant.
                        </span>
                      )}
                      {statusData.finalStatus === "unsuccessful" && (
                        <span className="text-slate-600">
                          Cohort capacity reached. We encourage you to apply for our upcoming intake cohorts.
                        </span>
                      )}
                      {statusData.finalStatus === "in_evaluation" && (
                        <span className="text-slate-500">
                          Comprehensive evaluation of all candidates is currently in progress. Decisions will be published soon.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </CandidateAccessGate>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading Status Tracker...</div>}>
      <StatusContent />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, Suspense } from "react";
import WorkshopChoice from "@/components/workshop-choice";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import CandidateAccessGate from "@/components/candidate-access-gate";
import { submitRequest } from "@/lib/client/submit";
import { apiResponse, readJson, responseError } from "@/lib/client/api";
import { useFormDraft } from "@/lib/client/use-form-draft";
import SubmissionRecovery from "@/components/submission-recovery";
import { Notice } from "@/components/live-data";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { applicationSchema, ApplicationFormData } from "@/lib/validations/application";
import { 
  FileText, 
  GraduationCap, 
  BookOpen, 
  ShieldCheck, 
  PhoneCall, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  ArrowLeft 
} from "lucide-react";

function ApplyForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const refFromQuery = searchParams.get("ref") || "";

  const [courses, setCourses] = useState<any[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workshopId, setWorkshopId] = useState("");
  const [submittedAppNo, setSubmittedAppNo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError, setFocus, watch, reset, getValues,
    formState: { errors },
  } = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      registrationRef: refFromQuery,
      olMathsGrade: "A",
      olEnglishGrade: "A",
      olScienceGrade: "A",
      alStream: "Physical Science",
      declarationAccepted: false,
    },
  });
  const draft = useFormDraft("admissions_application_draft", watch, reset, getValues);
  const accepted = (result: any) => { draft.clear(); setSubmittedAppNo(result.applicationNo); };

  useEffect(() => {
    if (refFromQuery) {
      setValue("registrationRef", refFromQuery);
    }
    // Fetch courses
    apiResponse("/api/campaigns")
      .then((res) => res.json())
      .then((data) => {
        if (data.courses) {
          setCourses(data.courses);
          if (data.courses.length > 0 && !getValues("courseId")) {
            setValue("courseId", data.courses[0].id);
          }
        }
      })
      .catch((e) => setServerError(e.message));
  }, [refFromQuery, setValue]);

  const onSubmit = async (data: ApplicationFormData) => {
    setIsSubmitting(true);
    setServerError(null);

    try {
      const res = await submitRequest("/api/applications", { ...data, workshopId: workshopId || undefined });

      const result = await readJson(res);

      if (!res.ok) {
        const fields = result.fieldErrors || result.errors || {};
        Object.entries(fields).forEach(([key, messages]) => setError(key as any, { type: "server", message: Array.isArray(messages) ? messages[0] : String(messages) }));
        if (Object.keys(fields)[0]) setFocus(Object.keys(fields)[0] as any);
        setServerError(responseError(res, result).message);
        setIsSubmitting(false);
        return;
      }

      accepted(result);
      setIsSubmitting(false);
    } catch (err: any) {
      setServerError(err.message || "Could not confirm this submission. Resolve the pending submission before starting another.");
      setIsSubmitting(false);
    }
  };

  if (submittedAppNo) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10" />
          </div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-wider">
            Stage 3 Completed
          </span>
          <h2 className="text-2xl font-extrabold text-slate-900 mt-3">
            Application Submitted Successfully!
          </h2>
          <p className="text-sm text-slate-600 mt-2">
            Your educational profile and statement of purpose have been received by the Admissions Committee.
          </p>
          <div className="my-6 p-4 rounded-xl bg-blue-50 border border-blue-200">
            <p className="text-xs text-blue-700 font-semibold uppercase">Official Application Number</p>
            <p className="text-2xl font-mono font-black text-blue-900 mt-1">{submittedAppNo}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
            <Link
              href={`/status?ref=${encodeURIComponent(refFromQuery)}`}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow transition"
            >
              Track Application Progress
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CandidateAccessGate reference={refFromQuery} purpose="apply" onVerified={reference => setValue("registrationRef", reference)}>
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Portal Home
        </Link>

        {/* Card Header */}
        <div className="bg-white rounded-t-2xl border-t border-x border-slate-200 p-6 sm:p-8 bg-gradient-to-r from-indigo-900 to-slate-900 text-white">
          <BrandLogo className="h-16 w-16 mb-3" priority />
          <span className="text-xs font-semibold tracking-wider uppercase text-indigo-300">Stage 3 of Lifecycle</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">Formal Educational Application</h1>
          <p className="text-indigo-100 text-sm mt-1">
            Complete your academic background, stream preferences, and candidate profile
          </p>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-b-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          {serverError && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="font-semibold">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Notice>{draft.notice}</Notice>
            <SubmissionRecovery url="/api/applications" show={Boolean(serverError)} onResolved={accepted} />
            {/* Section 1: Registration Linkage */}
            <div>
              <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                1. Registration Reference & Course Preference
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registration Reference Number *
                  </label>
                  <input
                    {...register("registrationRef")}
                    type="text"
                    placeholder="e.g. REG-25-KPD78"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.registrationRef && (
                    <p className="text-red-600 text-xs mt-1">{errors.registrationRef.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Preferred Program Track *
                  </label>
                  <select
                    {...register("courseId")}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {errors.courseId && (
                    <p className="text-red-600 text-xs mt-1">{errors.courseId.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: G.C.E. O/L Results */}
            <div>
              <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-indigo-600" />
                2. G.C.E. Ordinary Level (O/L) Qualifications
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mt-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">O/L Year *</label>
                  <input
                    {...register("olYear")}
                    type="text"
                    placeholder="e.g. 2018"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.olYear && <p className="text-red-600 text-xs mt-1">{errors.olYear.message}</p>}
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">O/L Index Number *</label>
                  <input
                    {...register("olIndexNo")}
                    type="text"
                    placeholder="e.g. 782109"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.olIndexNo && <p className="text-red-600 text-xs mt-1">{errors.olIndexNo.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mathematics *</label>
                  <select {...register("olMathsGrade")} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm bg-white">
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="S">S</option>
                    <option value="W">W</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">English *</label>
                  <select {...register("olEnglishGrade")} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm bg-white">
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="S">S</option>
                    <option value="W">W</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Science *</label>
                  <select {...register("olScienceGrade")} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm bg-white">
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="S">S</option>
                    <option value="W">W</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 3: G.C.E. A/L Results */}
            <div>
              <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                3. G.C.E. Advanced Level (A/L) Qualifications
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">A/L Stream *</label>
                  <select {...register("alStream")} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
                    <option value="Physical Science">Physical Science (Maths)</option>
                    <option value="Biological Science">Biological Science (Bio)</option>
                    <option value="Technology">Technology Stream</option>
                    <option value="Commerce">Commerce Stream</option>
                    <option value="Arts">Arts Stream</option>
                    <option value="Other">Other / Vocational</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">A/L Year *</label>
                  <input
                    {...register("alYear")}
                    type="text"
                    placeholder="e.g. 2021"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.alYear && <p className="text-red-600 text-xs mt-1">{errors.alYear.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">A/L Index Number *</label>
                  <input
                    {...register("alIndexNo")}
                    type="text"
                    placeholder="e.g. 339012"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.alIndexNo && <p className="text-red-600 text-xs mt-1">{errors.alIndexNo.message}</p>}
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    A/L Subjects & Grades Summary *
                  </label>
                  <input
                    {...register("alResultsSummary")}
                    type="text"
                    placeholder="e.g. Combined Maths - B, Physics - C, Chemistry - C, General English - A"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.alResultsSummary && (
                    <p className="text-red-600 text-xs mt-1">{errors.alResultsSummary.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 4: Emergency Contact & Statement */}
            <div>
              <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-indigo-600" />
                4. Emergency Contact & Statement of Purpose
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Name *</label>
                  <input
                    {...register("emergencyContactName")}
                    type="text"
                    placeholder="Parent / Guardian Name"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.emergencyContactName && (
                    <p className="text-red-600 text-xs mt-1">{errors.emergencyContactName.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Relationship *</label>
                  <input
                    {...register("emergencyContactRelation")}
                    type="text"
                    placeholder="Father / Mother / Guardian"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.emergencyContactRelation && (
                    <p className="text-red-600 text-xs mt-1">{errors.emergencyContactRelation.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone *</label>
                  <input
                    {...register("emergencyContactPhone")}
                    type="tel"
                    placeholder="07XXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.emergencyContactPhone && (
                    <p className="text-red-600 text-xs mt-1">{errors.emergencyContactPhone.message}</p>
                  )}
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Statement of Purpose / Why do you want to join this program? *
                  </label>
                  <textarea
                    {...register("statementOfPurpose")}
                    rows={3}
                    placeholder="Describe your career goals, passion for technology, and how this program will benefit your future..."
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {errors.statementOfPurpose && (
                    <p className="text-red-600 text-xs mt-1">{errors.statementOfPurpose.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Declaration */}
            <div className="pt-2">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-start gap-3">
                  <input
                    {...register("declarationAccepted")}
                    type="checkbox"
                    id="declarationAccepted"
                    className="mt-1 h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <label htmlFor="declarationAccepted" className="text-xs text-slate-700 leading-relaxed cursor-pointer">
                    I solemnly declare that all information furnished herein is true, correct, and supported by valid examination certificates. I understand that misrepresentation will result in immediate disqualification.
                  </label>
                </div>
                {errors.declarationAccepted && (
                  <p className="text-red-600 text-xs mt-2 pl-7 font-medium">
                    {errors.declarationAccepted.message}
                  </p>
                )}
              </div>
            </div>

            <WorkshopChoice flow="application" value={workshopId} onChange={setWorkshopId} />
            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting Application Record...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Submit Formal Application
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
    </CandidateAccessGate>
  );
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading Application Portal...</div>}>
      <ApplyForm />
    </Suspense>
  );
}

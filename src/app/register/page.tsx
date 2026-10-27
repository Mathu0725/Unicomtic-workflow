"use client";

import { useEffect, useState } from "react";
import { api, readJson, responseError } from "@/lib/client/api";
import { useFormDraft } from "@/lib/client/use-form-draft";
import SubmissionRecovery from "@/components/submission-recovery";
import { Notice } from "@/components/live-data";
import WorkshopChoice from "@/components/workshop-choice";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import { submitRequest } from "@/lib/client/submit";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registrationSchema, RegistrationFormData, RegistrationFormInput } from "@/lib/validations/registration";
import { SRI_LANKA_DISTRICTS } from "@/lib/constants/sri-lanka-districts";
import { 
  User, 
  Mail, 
  Phone, 
  CreditCard, 
  Calendar, 
  MapPin, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  ArrowLeft 
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workshopId, setWorkshopId] = useState("");
  const [policy, setPolicy] = useState<any>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ referenceNo: string } | null>(null);

  const {
    register,
    handleSubmit,
    setError, setFocus, setValue, watch, reset, getValues,
    formState: { errors },
  } = useForm<RegistrationFormInput, unknown, RegistrationFormData>({
    mode: "onBlur",
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      termsAccepted: false,
      termsVersion: "v1.0",
      gender: "Male",
      district: "Colombo",
    },
  });
  const draft = useFormDraft("admissions_registration_draft", watch, reset, getValues);
  useEffect(() => { api("/api/settings").then(result => { setPolicy(result.settings); setValue("termsVersion", result.settings.termsVersion); }).catch(e => setServerError(e.message)); }, [setValue]);
  const accepted = (result: any) => { draft.clear(); router.push(`/register/confirmation?ref=${encodeURIComponent(result.referenceNo)}&name=${encodeURIComponent(result.studentName)}&district=${encodeURIComponent(result.district)}&autoInvited=${result.autoInvited ? "true" : "false"}`); };

  const onSubmit = async (data: RegistrationFormData) => {
    setIsSubmitting(true);
    setServerError(null);
    setDuplicateInfo(null);

    try {
      const res = await submitRequest("/api/registrations", { ...data, workshopId: workshopId || undefined });

      const result = await readJson(res);

      if (!res.ok) {
        if (result.isDuplicate && result.referenceNo) {
          setDuplicateInfo({ referenceNo: result.referenceNo });
        }
        const fields = result.fieldErrors || result.errors || {};
        Object.entries(fields).forEach(([key, messages]) => setError(key as any, { type: "server", message: Array.isArray(messages) ? messages[0] : String(messages) }));
        if (Object.keys(fields)[0]) setFocus(Object.keys(fields)[0] as any);
        setServerError(responseError(res, result).message);
        setIsSubmitting(false);
        return;
      }

      // Success -> Redirect to confirmation page with parameters
      accepted(result);
    } catch (err: any) {
      setServerError(err.message || "Could not confirm this submission. Resolve the pending submission before starting another.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Navigation link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Portal Home
        </Link>

        {/* Card Header */}
        <div className="bg-white rounded-t-2xl border-t border-x border-slate-200 p-6 sm:p-8 bg-gradient-to-r from-blue-900 to-indigo-900 text-white">
          <BrandLogo className="h-16 w-16 mb-3" priority />
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold tracking-wider uppercase text-blue-200">Stage 1 of Lifecycle</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">Student Intake Registration</h1>
              <p className="text-blue-100 text-sm mt-1">
                Official registration for the Unicom TIC 2025/2026 Academic Intake
              </p>
            </div>
            <div className="hidden sm:block text-right">
              <span className="inline-block px-3 py-1 bg-blue-800/80 rounded-full text-xs font-medium text-blue-100 border border-blue-700">
                All 25 Districts
              </span>
            </div>
          </div>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-b-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          {serverError && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{serverError}</p>
                {duplicateInfo && (
                  <p className="mt-2 text-xs">
                    Your reference number is <strong>{duplicateInfo.referenceNo}</strong>. You can{" "}
                    <Link
                      href={`/status?ref=${duplicateInfo.referenceNo}`}
                      className="underline font-bold text-red-900 hover:text-red-700"
                    >
                      check your status here
                    </Link>{" "}
                    or proceed to{" "}
                    <Link
                      href={`/apply?ref=${duplicateInfo.referenceNo}`}
                      className="underline font-bold text-red-900 hover:text-red-700"
                    >
                      complete your application
                    </Link>
                    .
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Notice>{draft.notice}</Notice>
            <SubmissionRecovery url="/api/registrations" show={Boolean(serverError)} onResolved={accepted} />
            {policy && <p className="text-xs text-slate-600">Terms & Conditions ({policy.termsVersion}): {policy.termsContent}</p>}
            <button type="button" className="text-xs text-blue-700 underline" onClick={async () => { try { const result = await api("/api/settings"); setPolicy(result.settings); setValue("termsVersion", result.settings.termsVersion); setValue("termsAccepted", false); } catch (e: any) { setServerError(e.message); } }}>Refresh current policy</button>
            {/* Section 1: Personal Identity */}
            <div>
              <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                1. Personal Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name (As in Birth Certificate / NIC) *
                  </label>
                  <input
                    {...register("fullName")}
                    type="text"
                    placeholder="e.g. Kavindu Dilshan Perera"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  {errors.fullName && (
                    <p className="text-red-600 text-xs mt-1">{errors.fullName.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Name with Initials *
                  </label>
                  <input
                    {...register("nameWithInitials")}
                    type="text"
                    placeholder="e.g. K. D. Perera"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  {errors.nameWithInitials && (
                    <p className="text-red-600 text-xs mt-1">{errors.nameWithInitials.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    National Identity Card (NIC) *
                  </label>
                  <div className="relative">
                    <input
                      {...register("nic")}
                      type="text"
                      placeholder="e.g. 200112304567 or 991234567V"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                  {errors.nic && (
                    <p className="text-red-600 text-xs mt-1">{errors.nic.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gender *
                  </label>
                  <select
                    {...register("gender")}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  {errors.gender && (
                    <p className="text-red-600 text-xs mt-1">{errors.gender.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date of Birth *
                  </label>
                  <div className="relative">
                    <input
                      {...register("dob")}
                      type="date"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                  {errors.dob && (
                    <p className="text-red-600 text-xs mt-1">{errors.dob.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Contact Information */}
            <div>
              <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                2. Contact Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <div className="relative">
                    <input
                      {...register("email")}
                      type="email"
                      placeholder="kavindu@example.lk"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                  {errors.email && (
                    <p className="text-red-600 text-xs mt-1">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile Phone (Sri Lanka) *
                  </label>
                  <div className="relative">
                    <input
                      {...register("phone")}
                      type="tel"
                      placeholder="0771234567"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                  {errors.phone && (
                    <p className="text-red-600 text-xs mt-1">{errors.phone.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp Number (Optional)
                  </label>
                  <input
                    {...register("whatsapp")}
                    type="tel"
                    placeholder="0771234567"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  {errors.whatsapp && (
                    <p className="text-red-600 text-xs mt-1">{errors.whatsapp.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    District (Sri Lanka) *
                  </label>
                  <div className="relative">
                    <select
                      {...register("district")}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                      {SRI_LANKA_DISTRICTS.map((d) => (
                        <option key={d.name} value={d.name}>
                          {d.name} ({d.province} Province)
                        </option>
                      ))}
                    </select>
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                  {errors.district && (
                    <p className="text-red-600 text-xs mt-1">{errors.district.message}</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Residential Address *
                  </label>
                  <textarea
                    {...register("address")}
                    rows={2}
                    placeholder="No. 12, Main Street, Colombo..."
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  {errors.address && (
                    <p className="text-red-600 text-xs mt-1">{errors.address.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 3: Terms and Acceptance */}
            <div className="pt-2">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-start gap-3">
                  <input
                    {...register("termsAccepted")}
                    type="checkbox"
                    id="termsAccepted"
                    className="mt-1 h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <label htmlFor="termsAccepted" className="text-xs text-slate-700 leading-relaxed cursor-pointer">
                    I confirm that my details are accurate and accept the admissions Terms & Conditions{" "}
                    <span className="font-semibold">({policy?.termsVersion || "loading…"})</span> displayed above.
                  </label>
                </div>
                {errors.termsAccepted && (
                  <p className="text-red-600 text-xs mt-2 pl-7 font-medium">
                    {errors.termsAccepted.message}
                  </p>
                )}
              </div>
            </div>

            <WorkshopChoice value={workshopId} onChange={setWorkshopId} />
            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting || !policy}
                className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting Registration & Generating Reference...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Complete Registration
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

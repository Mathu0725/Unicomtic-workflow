"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, Suspense } from "react";
import { CheckCircle2, Copy, Check, ArrowRight, Home, FileText, Search } from "lucide-react";

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") || "REG-2025-DEMO";
  const name = searchParams.get("name") || "Student";
  const district = searchParams.get("district") || "Sri Lanka";
  const autoInvited = searchParams.get("autoInvited") === "true";

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(ref);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="max-w-xl w-full">
        {/* Main Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-center p-8">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-wider">
            Registration Confirmed
          </span>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-3">
            Welcome to Unicom TIC, {name}!
          </h1>

          <p className="text-sm text-slate-600 mt-2">
            Your registration record has been securely stored in our admissions database.
          </p>

          {/* Reference Box */}
          <div className="my-6 p-5 rounded-xl bg-blue-50/80 border border-blue-200">
            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">
              Your Official Registration Reference
            </p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl sm:text-3xl font-mono font-black text-blue-900 tracking-wider">
                {ref}
              </span>
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 transition"
                title="Copy Reference"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-blue-700 mt-2">
              District: <strong>{district}</strong> &bull; Please quote this number for workshop entrance and queries.
            </p>
          </div>

          {/* Next Steps Card */}
          <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2 mb-6">
            <p className="font-bold text-slate-800 text-sm mb-1">Important Next Steps:</p>
            <p>&bull; Your registration is saved. A confirmation email is queued for your registered address.</p>
            <p>&bull; Keep your NIC and Registration Reference ready when attending the Orientation Workshop.</p>
            <p>&bull; You can complete your formal educational application right now or return later using your reference.</p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link
              href={`/apply?ref=${encodeURIComponent(ref)}`}
              className="w-full sm:w-auto flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Complete Formal Application Now
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={`/status?ref=${encodeURIComponent(ref)}`}
              className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm transition flex items-center justify-center gap-1.5"
            >
              <Search className="w-4 h-4 text-slate-500" />
              Track Status
            </Link>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              <Home className="w-3.5 h-3.5" />
              Return to Unicom TIC Homepage
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegistrationConfirmationPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading confirmation...</div>}>
      <ConfirmationContent />
    </Suspense>
  );
}

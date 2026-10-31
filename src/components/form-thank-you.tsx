import { CheckCircle2 } from "lucide-react";
import type { WorkshopConfirmation } from "@/lib/workshops/confirmation";

export default function FormThankYou({
  message,
  referenceNo,
  redirectUrl,
  workshop,
}: {
  message?: string;
  referenceNo?: string;
  redirectUrl?: string;
  workshop?: WorkshopConfirmation | null;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section
        role="status"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10"
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900">Thank you!</h1>
        <p lang="ta" className="mt-2 text-lg font-bold text-slate-700">
          நன்றி!
        </p>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
          {message || "Your form has been submitted successfully."}
        </p>
        <p lang="ta" className="mt-2 text-sm leading-relaxed text-slate-600">
          {workshop ? "உங்கள் பயிற்சிப்பட்டறை முன்பதிவு உறுதிப்படுத்தப்பட்டது." : "உங்கள் விண்ணப்பம் வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது."}
        </p>
        {referenceNo && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold text-emerald-800">
              Your reference number
            </p>
            <p className="mt-2 break-all font-mono text-lg font-bold text-slate-900">
              {referenceNo}
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Save this reference for future communication.
            </p>
          </div>
        )}
        {workshop && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-left">
            <h2 className="text-lg font-bold text-slate-900">Your workshop booking</h2>
            <p className="mt-2 font-semibold text-slate-800">{workshop.title}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="font-semibold text-slate-700">Date & time · Sri Lanka</dt><dd className="mt-1 text-slate-600">{new Date(workshop.start_time).toLocaleString("en-GB", { timeZone: "Asia/Colombo", dateStyle: "long", timeStyle: "short" })}{workshop.end_time ? ` – ${new Date(workshop.end_time).toLocaleTimeString("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit" })}` : ""}</dd></div>
              <div><dt className="font-semibold text-slate-700">Venue</dt><dd className="mt-1 break-words text-slate-600">{workshop.venue}{workshop.address && <span className="mt-1 block whitespace-pre-wrap">{workshop.address}</span>}</dd></div>
            </dl>
            {workshop.google_maps_url && /^https?:\/\//i.test(workshop.google_maps_url) && <a href={workshop.google_maps_url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Open in Google Maps ↗</a>}
          </div>
        )}
        {redirectUrl && /^https?:\/\//i.test(redirectUrl) && (
          <a
            href={redirectUrl}
            className="mt-6 inline-flex rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Continue
          </a>
        )}
        <p className="mt-6 text-xs text-slate-400">
          You can close this page now.
        </p>
      </section>
    </main>
  );
}

import { CheckCircle2 } from "lucide-react";

export default function FormThankYou() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section role="status" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900">Thank you!</h1>
        <p lang="ta" className="mt-2 text-lg font-bold text-slate-700">நன்றி!</p>
        <p className="mt-5 text-sm leading-relaxed text-slate-600">Your form has been submitted successfully.</p>
        <p lang="ta" className="mt-2 text-sm leading-relaxed text-slate-600">உங்கள் விண்ணப்பம் வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது.</p>
        <p className="mt-6 text-xs text-slate-400">You can close this page now.</p>
      </section>
    </main>
  );
}

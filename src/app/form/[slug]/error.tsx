"use client";
import { AlertCircle } from "lucide-react";
export default function FormError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <section role="alert" className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-900">
                <AlertCircle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
                <h1 className="text-xl font-bold">This form could not be displayed</h1>
                <p className="text-sm text-slate-600">Please try loading the form again.</p>
                {error.digest && <p className="text-xs text-slate-500">Support reference: {error.digest}</p>}
                <button type="button" onClick={reset} className="rounded-xl bg-[#4d4d4d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#333333]">Try again</button>
            </section>
        </main>
    );
}

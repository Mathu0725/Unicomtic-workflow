"use client";
import Link from "next/link";
import BrandLogo from "./brand-logo";
export default function ErrorRecovery({ reset, reference }: { reset: () => void; reference?: string }) {
    return <section role="alert" className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 my-10 space-y-4 text-slate-900"><BrandLogo className="h-16 w-16" /><h1 className="text-2xl font-bold">This page could not be displayed</h1><p>Please try loading it again. If you submitted a form, check its tracking status before starting a new submission.</p>{reference && <p className="text-sm">Support reference: {reference}</p>}<div className="flex flex-wrap gap-4"><button onClick={reset} className="rounded-lg bg-blue-700 px-4 py-2 text-white font-semibold">Try again</button><Link href="/status" className="py-2 text-blue-700 underline">Track application</Link><Link href="/" className="py-2 text-blue-700 underline">Portal home</Link></div></section>;
}

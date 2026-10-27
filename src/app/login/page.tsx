"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import { api, inputClass, buttonClass, panelClass, Notice } from "@/components/live-data";
import { oauthMessage } from "@/lib/client/oauth-errors";
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { setError(oauthMessage(window.location.search)); }, []);
  const login = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setError(""); try { const result = await api("/api/auth/login", { email, password, returnTo: new URLSearchParams(window.location.search).get("returnTo") }); router.push(result.redirectTo); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <BrandLogo className="mx-auto h-24 w-24" priority />
          <h1 className="font-extrabold text-2xl mt-4">Admissions staff sign in</h1>
          <p className="text-sm text-slate-500 mt-2">Unicom TIC student lifecycle platform</p>
        </div>
        <div className={panelClass}>
          <Notice error>{error}</Notice>
          <form className="space-y-4" onSubmit={login}>
            <label className="block text-sm font-semibold">
              Staff email
              <input className={`${inputClass} mt-1`} required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <label className="block text-sm font-semibold">
              Password
              <input className={`${inputClass} mt-1`} required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            <button className={`${buttonClass} w-full`} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        </div>
      </div>
    </div>
  );
}

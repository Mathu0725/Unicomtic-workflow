"use client";
import { useEffect, useState } from "react";
import { api, inputClass, buttonClass, Notice } from "./live-data";
import { emailValidationMessage } from "@/lib/validations/email";

export default function CandidateAccessGate({
  children,
  reference = "",
  purpose = "status",
  formSlug,
  onVerified,
  workshop = false,
}: {
  children: React.ReactNode;
  reference?: string;
  purpose?: "status" | "apply";
  formSlug?: string;
  onVerified?: (reference: string) => void;
  workshop?: boolean;
}) {
  const [checking, setChecking] = useState(true),
    [verified, setVerified] = useState(false),
    [ref, setRef] = useState(reference),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    setRef(reference);
    api(`/api/candidate-access/session${formSlug ? `?formSlug=${encodeURIComponent(formSlug)}` : ""}`, undefined, "GET", controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const valid =
          data.verified &&
          (!reference || reference.trim().toUpperCase() === data.reference);
        setVerified(valid);
        if (valid) onVerified?.(data.reference);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [reference, formSlug]);
  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const validation = emailValidationMessage(email);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await api(workshop ? "/api/candidate-access/verify-workshop" : "/api/candidate-access/request", {
        reference: ref,
        email,
        ...(!workshop ? { purpose } : {}),
        ...(formSlug ? { formSlug } : {}),
      });
      if (workshop && data.verified) {
        setVerified(true);
        onVerified?.(data.reference);
      } else if (data.redirectTo) window.location.assign(data.redirectTo);
      else setMessage(data.message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (checking)
    return <p role="status" className="p-6 text-center text-sm text-slate-500">Checking secure access…</p>;
  if (verified) return <>{children}</>;
  return (
    <section className="mx-auto my-8 max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-slate-900">
        {workshop ? "Verify your workshop access" : "Continue with a secure email link"}
      </h2>
      <p className="text-sm leading-relaxed text-slate-600">
        {workshop
          ? "Enter your application or registration reference and the email address used for that record. Once they match, the workshop form opens here."
          : "Enter your registration reference and the email address used to register. Open the private link in that inbox to continue. Contact admissions if your email needs correcting."}
      </p>
      <Notice error>{error}</Notice>
      <Notice>{message}</Notice>
      <form onSubmit={request} className="space-y-4">
        <label className="block text-sm font-semibold">
          {workshop ? "Application or registration reference" : "Registration reference"}
          <input
            required
            maxLength={100}
            autoComplete="off"
            className={`${inputClass} mt-1`}
            placeholder={workshop ? "APP-… or REG-…" : "REG-…"}
            value={ref}
            onChange={(event) => setRef(event.target.value)}
          />
        </label>
        <label className="block text-sm font-semibold">
          Registered email
          <input
            required
            type="email"
            maxLength={254}
            autoComplete="email"
            className={`${inputClass} mt-1`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button className={buttonClass} disabled={busy}>
          {busy ? (workshop ? "Verifying…" : "Requesting…") : (workshop ? "Continue to workshop form" : "Email my secure link")}
        </button>
      </form>
      <p className="text-xs text-slate-500">
        {workshop ? "Workshop access lasts 30 minutes. Refresh this page to verify again if it expires." : "Links expire 30 minutes after dispatch. Verified access lasts one hour."}
      </p>
    </section>
  );
}

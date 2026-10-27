"use client";
import ErrorRecovery from "@/components/error-recovery";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <ErrorRecovery reset={reset} reference={error.digest} />;
}

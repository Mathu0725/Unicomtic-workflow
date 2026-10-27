"use client";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <html lang="en"><body style={{ fontFamily: "system-ui", padding: "3rem", maxWidth: "40rem", margin: "auto" }}><main role="alert"><h1>Admissions could not load</h1><p>Please try again. If you already submitted an application, check its status before submitting again.</p>{error.digest && <p>Support reference: {error.digest}</p>}<button onClick={reset}>Try again</button><p><a href="/status">Track application</a> · <a href="/">Portal home</a></p></main></body></html>;
}

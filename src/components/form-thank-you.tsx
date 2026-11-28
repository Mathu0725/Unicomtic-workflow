import { CheckCircle2 } from "lucide-react";
import type { WorkshopConfirmation } from "@/lib/workshops/confirmation";

export default function FormThankYou({
  message,
  referenceNo,
  redirectUrl,
  workshop,
  preview = false,
  showSocialLinks = false,
}: {
  message?: string;
  referenceNo?: string;
  redirectUrl?: string;
  workshop?: WorkshopConfirmation | null;
  preview?: boolean;
  showSocialLinks?: boolean;
}) {
  const confirmationParts = confirmationMessageParts(message);
  return (
    <main
      className={`flex items-center justify-center bg-slate-50 px-4 py-12 ${preview ? "min-h-full" : "min-h-screen"}`}
    >
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
        <div className="mt-5 space-y-2 text-sm leading-relaxed text-slate-600">
          {confirmationParts.map((part, index) => (
            <p key={`${part}-${index}`} lang={containsTamil(part) ? "ta" : undefined}>
              {part}
            </p>
          ))}
        </div>
        {referenceNo && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold text-emerald-800">
              Your reference number
            </p>
            <p lang="ta" className="mt-0.5 text-xs text-emerald-700">
              உங்கள் குறிப்பு எண்
            </p>
            <p className="mt-2 break-all font-mono text-lg font-bold text-slate-900">
              {referenceNo}
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Save this reference for future communication.
            </p>
            <p lang="ta" className="mt-1 text-xs text-slate-600">
              எதிர்கால தொடர்புகளுக்காக இந்த எண்ணைச் சேமித்து வையுங்கள்.
            </p>
          </div>
        )}
        {showSocialLinks && (
          <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4">
            <h2 className="text-sm font-bold text-slate-900">
              Follow us for the latest updates
            </h2>
            <p lang="ta" className="mt-1 text-xs text-slate-600">
              புதிய தகவல்களுக்கு எங்கள் சமூக ஊடகப் பக்கங்களைப் பின்தொடருங்கள்.
            </p>
            <nav aria-label="Unicom TIC social media" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { name: "Facebook", href: "https://www.facebook.com/unicomtic/" },
                { name: "Instagram", href: "https://www.instagram.com/unicomtic/" },
                { name: "TikTok", href: "https://www.tiktok.com/@unicomtic" },
                { name: "LinkedIn", href: "https://lk.linkedin.com/company/unicomtic" },
                { name: "YouTube", href: "https://www.youtube.com/@UnicomTIC" },
              ].map(({ name, href }) => (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                >
                  <span className="flex h-7 w-7 items-center justify-center" aria-hidden="true">
                    <SocialBrandIcon name={name} />
                  </span>
                  {name}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ))}
            </nav>
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
        {redirectUrl && /^https?:\/\//i.test(redirectUrl) &&
          (preview ? (
            <button
              type="button"
              className="mt-6 inline-flex cursor-default rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Continue
            </button>
          ) : (
            <a
              href={redirectUrl}
              className="mt-6 inline-flex rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Continue
            </a>
          ))}
        <p className="mt-6 text-xs text-slate-400">
          You can close this page now.
        </p>
      </section>
    </main>
  );
}

function SocialBrandIcon({ name }: { name: string }) {
  if (name === "Facebook") return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#0866FF" aria-hidden="true">
      <path d="M13.5 21v-8.18h2.74l.41-3.2H13.5V7.58c0-.93.26-1.57 1.61-1.57h1.72V3.15c-.3-.04-1.36-.13-2.58-.13-2.56 0-4.31 1.56-4.31 4.43v2.47H7.2v3.2h2.74V21h3.56Z" />
    </svg>
  );
  if (name === "Instagram") return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <defs>
        <linearGradient id="instagram-brand-gradient" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB900" />
          <stop offset=".52" stopColor="#F02D7D" />
          <stop offset="1" stopColor="#7B3FF2" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="url(#instagram-brand-gradient)" strokeWidth="2.3" />
      <circle cx="12" cy="12" r="4.35" fill="none" stroke="url(#instagram-brand-gradient)" strokeWidth="2.3" />
      <circle cx="18" cy="6.3" r="1.35" fill="#E1306C" />
    </svg>
  );
  if (name === "TikTok") return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path d="M14.2 2.4h3.2c.2 2.1 1.5 3.9 3.6 4.6v3.2a9 9 0 0 1-3.7-1.4v6.4a6.4 6.4 0 1 1-6.4-6.4c.4 0 .8 0 1.2.1v3.4a3 3 0 1 0 1.9 2.8V2.4Z" transform="translate(-1 1)" fill="#25F4EE" />
      <path d="M14.2 2.4h3.2c.2 2.1 1.5 3.9 3.6 4.6v3.2a9 9 0 0 1-3.7-1.4v6.4a6.4 6.4 0 1 1-6.4-6.4c.4 0 .8 0 1.2.1v3.4a3 3 0 1 0 1.9 2.8V2.4Z" transform="translate(1 -0.5)" fill="#FE2C55" />
      <path d="M14.2 2.4h3.2c.2 2.1 1.5 3.9 3.6 4.6v3.2a9 9 0 0 1-3.7-1.4v6.4a6.4 6.4 0 1 1-6.4-6.4c.4 0 .8 0 1.2.1v3.4a3 3 0 1 0 1.9 2.8V2.4Z" fill="#111827" />
    </svg>
  );
  if (name === "LinkedIn") return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#0A66C2" aria-hidden="true">
      <path d="M20.45 2H3.55C2.69 2 2 2.68 2 3.53v16.94c0 .85.69 1.53 1.55 1.53h16.9c.86 0 1.55-.68 1.55-1.53V3.53c0-.85-.69-1.53-1.55-1.53Z" />
      <path fill="#fff" d="M7.35 9.05a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM5.8 10.35h3.1v8.9H5.8zM10.8 10.35h2.97v1.22h.04c.41-.78 1.42-1.6 2.92-1.6 3.12 0 3.7 2.05 3.7 4.72v4.56h-3.1v-4.04c0-.97-.02-2.23-1.36-2.23-1.37 0-1.58 1.07-1.58 2.16v4.11h-3.1v-8.9Z" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0033" />
      <path d="m10 8.5 5.5 3.5-5.5 3.5v-7Z" fill="#fff" />
    </svg>
  );
}

function containsTamil(value: string) {
  return /[\u0B80-\u0BFF]/.test(value);
}

function confirmationMessageParts(message?: string) {
  const value = message?.trim();
  if (!value) {
    return [
      "Your form has been submitted successfully.",
      "உங்கள் படிவம் வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது.",
    ];
  }

  return value
    .split(/\r?\n\s*\r?\n/)
    .flatMap((paragraph) => {
      const tamilStart = paragraph.search(/[\u0B80-\u0BFF]/);
      if (tamilStart > 0 && /[A-Za-z]/.test(paragraph.slice(0, tamilStart))) {
        return [paragraph.slice(0, tamilStart).trim(), paragraph.slice(tamilStart).trim()];
      }
      return paragraph.trim();
    })
    .filter(Boolean);
}


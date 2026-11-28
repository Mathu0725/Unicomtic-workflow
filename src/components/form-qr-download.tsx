"use client";

import { useId, useState } from "react";
import { Download, Loader2, QrCode } from "lucide-react";

type QrImage = { dataUrl: string; publicUrl: string; localOnly: boolean };

export default function FormQrDownload({ slug, title, active }: { slug: string; title: string; active: boolean }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<QrImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generateQr = async () => {
    setLoading(true);
    setError("");
    try {
      const publicUrl = `${window.location.origin}/form/${slug}`;
      const qr = await import("qrcode");
      const dataUrl = await qr.toDataURL(publicUrl, { errorCorrectionLevel: "M", margin: 4, width: 768 });
      const hostname = window.location.hostname;
      setImage({ dataUrl, publicUrl, localOnly: hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" });
    } catch {
      setError("Could not generate the QR code. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const showQr = () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!image && !loading) void generateQr();
  };

  return <div className="mb-4">
    <button type="button" onClick={showQr} aria-expanded={open} aria-controls={panelId}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 transition hover:bg-blue-100">
      <QrCode className="h-4 w-4" aria-hidden="true" /> {open ? "Hide QR code" : "QR code & download"}
    </button>
    <div id={panelId} hidden={!open} className="mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Generating QR code…</p>}
      {error && <div role="alert" className="text-sm text-red-700">{error} <button type="button" onClick={() => void generateQr()} className="font-semibold underline">Try again</button></div>}
      {image && <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* A generated data URL has no external image to optimize. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.dataUrl} width={160} height={160} alt={`QR code for ${title}`} className="h-40 w-40 rounded-lg border border-slate-200 bg-white" />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-slate-900">Scan to open this form</p>
          <p className="break-all text-xs text-slate-600">{image.publicUrl}</p>
          <p className="text-xs text-slate-600">The form's access and verification settings still apply.</p>
          {!active && <p className="text-xs text-amber-800">This form is closed. Open it before sharing the QR code.</p>}
          {image.localOnly && <p className="text-xs text-amber-800">This QR code points to localhost and will not open on another device. Generate it from your public website before sharing.</p>}
          <a href={image.dataUrl} download={`${slug}-qr-code.png`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"><Download className="h-4 w-4" aria-hidden="true" />Download PNG</a>
        </div>
      </div>}
    </div>
  </div>;
}

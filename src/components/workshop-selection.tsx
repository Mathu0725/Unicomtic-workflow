"use client";
import { useId } from "react";
import type { WorkshopOption } from "@/lib/workshops/policy";
import type { WorkshopFormConfig } from "@/lib/data/store";
import { inputClass } from "./live-data";
export default function WorkshopSelection({
  config,
  workshops,
  value,
  onChange,
}: {
  config: Pick<
    WorkshopFormConfig,
    | "enabled"
    | "required"
    | "label"
    | "help_text"
    | "empty_message"
    | "show_remaining"
  >;
  workshops: WorkshopOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  if (!config.enabled) return null;
  const unavailable =
    value && !workshops.some((w) => w.id === value && w.bookable);
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label htmlFor={id} className="block text-sm font-semibold">
        {config.label || "Select your workshop"}
        {config.required ? " *" : " (optional)"}
      </label>
      <select
        id={id}
        className={inputClass}
        value={value}
        required={config.required}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={id + "-help"}
      >
        <option value="">Choose a workshop</option>
        {value && !workshops.some((w) => w.id === value) && (
          <option value={value} disabled>
            Previous choice unavailable — choose again
          </option>
        )}
        {workshops.map((w) => (
          <option key={w.id} value={w.id} disabled={!w.bookable}>
            {w.title} ·{" "}
            {new Date(w.start_time).toLocaleString("en-GB", {
              timeZone: "Asia/Colombo",
            })}{" "}
            · {w.venue}
            {!w.bookable
              ? " · " + w.unavailableReason
              : config.show_remaining !== false
                ? " · " +
                  (w.remaining === null
                    ? "Seats available"
                    : w.remaining + " seats left")
                : ""}
          </option>
        ))}
      </select>
      {unavailable && (
        <p role="alert" className="text-sm text-amber-800">
          Your previous workshop choice is no longer available. Choose another
          session or clear the optional selection.
        </p>
      )}
      {!workshops.some((w) => w.bookable) && (
        <p className="text-sm text-amber-800">
          {config.empty_message ||
            "No bookable workshops are available. Please contact admissions."}
        </p>
      )}
      <p id={id + "-help"} className="text-xs text-slate-600">
        {config.help_text ||
          "Times are in Sri Lanka time. Your seat is confirmed when your form and booking are saved successfully."}
      </p>
    </div>
  );
}

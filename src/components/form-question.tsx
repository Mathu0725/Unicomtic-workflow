"use client";
import { useId, type ReactNode } from "react";
import type { FormField } from "@/lib/data/store";
import { SRI_LANKA_DISTRICTS } from "@/lib/constants/sri-lanka-districts";

export default function FormQuestion({
  field,
  value,
  onChange,
  error,
  disabled = false,
  upload,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: string | boolean | string[]) => void;
  error?: string;
  disabled?: boolean;
  upload?: ReactNode;
}) {
  const instance = useId(),
    id = `${instance}-answer-${field.id}`,
    helpId = `${instance}-help-${field.id}`,
    errorId = `${instance}-field-error-${field.id}`;
  const text =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const classes =
    "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";
  const common = {
    id,
    disabled,
    required: field.required,
    "aria-invalid": Boolean(error),
    "aria-describedby":
      [field.helpText && helpId, error && errorId].filter(Boolean).join(" ") ||
      undefined,
    className: classes,
  };
  if (field.type === "section")
    return (
      <div className="border-b border-slate-200 pb-3 pt-3">
        <h2 className="text-lg font-bold text-slate-900">{field.label}</h2>
        {field.helpText && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">
            {field.helpText}
          </p>
        )}
      </div>
    );
  return (
    <div className="space-y-2">
      {!["terms", "radio", "checkbox"].includes(field.type) && (
        <label
          htmlFor={id}
          className="block text-sm font-semibold text-slate-900"
        >
          {field.label}
          {field.required && (
            <span className="ml-1 text-red-600" aria-label="required">
              *
            </span>
          )}
        </label>
      )}
      {field.type === "textarea" ? (
        <textarea
          {...common}
          rows={4}
          minLength={field.minLength}
          maxLength={field.maxLength ?? 10000}
          placeholder={field.placeholder}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "select" || field.type === "district" ? (
        <select
          {...common}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose an option</option>
          {(field.type === "district"
            ? SRI_LANKA_DISTRICTS.map((d) => d.name)
            : field.options || []
          ).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === "radio" || field.type === "checkbox" ? (
        <fieldset
          disabled={disabled}
          aria-describedby={common["aria-describedby"]}
          aria-invalid={Boolean(error)}
        >
          <legend className="mb-2 text-sm font-semibold text-slate-900">
            {field.label}
            {field.required && <span className="ml-1 text-red-600">*</span>}
          </legend>
          <div className="space-y-2">
            {(field.options || []).map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
              >
                <input
                  type={field.type}
                  name={`${instance}-${field.id}`}
                  required={field.type === "radio" && field.required}
                  checked={
                    field.type === "checkbox"
                      ? Array.isArray(value) && value.includes(option)
                      : text === option
                  }
                  onChange={(event) =>
                    onChange(
                      field.type === "checkbox"
                        ? event.target.checked
                          ? [...(Array.isArray(value) ? value : []), option]
                          : (Array.isArray(value) ? value : []).filter(
                              (item) => item !== option,
                            )
                        : option,
                    )
                  }
                  className="h-4 w-4 accent-blue-600"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : field.type === "terms" ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700">
          <input
            {...common}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
          />
          <span>
            {field.label}
            {field.required && <span className="ml-1 text-red-600">*</span>}
          </span>
        </label>
      ) : field.type === "file" ? (
        upload || (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
            PDF, JPG or PNG · up to 4 MB
          </div>
        )
      ) : (
        <input
          {...common}
          type={
            field.type === "phone"
              ? "tel"
              : field.type === "nic"
                ? "text"
                : field.type === "datetime"
                  ? "datetime-local"
                  : field.type
          }
          step={field.type === "number" ? "any" : undefined}
          min={field.type === "number" ? field.min : undefined}
          max={field.type === "number" ? field.max : undefined}
          minLength={field.minLength}
          maxLength={field.maxLength ?? (field.type === "email" ? 254 : 2000)}
          placeholder={field.placeholder}
          autoComplete={field.type === "email" ? "email" : undefined}
          autoCapitalize={field.type === "email" ? "none" : undefined}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.helpText && (
        <p
          id={helpId}
          className="whitespace-pre-wrap text-xs leading-relaxed text-slate-500"
        >
          {field.helpText}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-semibold text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}

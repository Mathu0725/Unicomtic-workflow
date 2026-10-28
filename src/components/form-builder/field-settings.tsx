"use client";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { FormField } from "@/lib/data/store";
import {
  choiceTypes,
  fieldIdentityKeys,
  identityKeys,
} from "@/lib/forms/field-rules";
import { buttonClass, inputClass, SettingLabel, Toggle } from "./controls";

export default function FieldSettings({
  field,
  fields,
  onChange,
}: {
  field: FormField;
  fields: FormField[];
  onChange: (patch: Partial<FormField>, group?: string) => void;
}) {
  const previous = fields
    .slice(
      0,
      fields.findIndex((item) => item.id === field.id),
    )
    .filter((item) => item.type !== "section");
  const options = field.options || [],
    identity = fieldIdentityKeys(field).some((key) =>
      identityKeys.includes(key),
    );
  const numeric = (
    key:
      | "minLength"
      | "maxLength"
      | "min"
      | "max"
      | "minSelections"
      | "maxSelections",
    label: string,
  ) => (
    <SettingLabel label={label}>
      <input
        className={inputClass}
        type="number"
        value={field[key] ?? ""}
        onChange={(event) =>
          onChange(
            {
              [key]:
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value),
            },
            key,
          )
        }
      />
    </SettingLabel>
  );
  return (
    <div className="space-y-5">
      <SettingLabel
        label={field.type === "section" ? "Section title" : "Question"}
      >
        <textarea
          rows={2}
          maxLength={1000}
          value={field.label}
          onChange={(event) => onChange({ label: event.target.value }, "label")}
          className={inputClass}
        />
      </SettingLabel>
      <SettingLabel
        label={field.type === "section" ? "Section description" : "Help text"}
      >
        <textarea
          rows={2}
          value={field.helpText || ""}
          maxLength={4000}
          onChange={(event) =>
            onChange({ helpText: event.target.value }, "helpText")
          }
          className={inputClass}
          placeholder="Optional guidance for applicants"
        />
      </SettingLabel>
      {field.type !== "section" && (
        <Toggle
          label="Required answer"
          checked={field.required}
          hint={
            identity
              ? "Used for admissions identity and duplicate protection."
              : undefined
          }
          onChange={(required) => onChange({ required })}
        />
      )}
      {![
        "section",
        "terms",
        "file",
        "radio",
        "checkbox",
        "select",
        "district",
      ].includes(field.type) && (
        <SettingLabel label="Placeholder">
          <input
            className={inputClass}
            value={field.placeholder || ""}
            onChange={(event) =>
              onChange({ placeholder: event.target.value }, "placeholder")
            }
          />
        </SettingLabel>
      )}
      {choiceTypes.includes(field.type) && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-700">Choices</h3>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                aria-label={`Choice ${index + 1}`}
                className={`${inputClass} mt-0 min-w-0`}
                value={option}
                onChange={(event) =>
                  onChange(
                    {
                      options: options.map((value, position) =>
                        position === index ? event.target.value : value,
                      ),
                    },
                    `option-${index}`,
                  )
                }
              />
              <button
                type="button"
                aria-label={`Move choice ${index + 1} up`}
                disabled={index === 0}
                className="p-1 text-slate-400 hover:text-blue-700 disabled:opacity-20"
                onClick={() => {
                  const reordered = [...options];
                  [reordered[index - 1], reordered[index]] = [
                    reordered[index],
                    reordered[index - 1],
                  ];
                  onChange({ options: reordered });
                }}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Move choice ${index + 1} down`}
                disabled={index === options.length - 1}
                className="p-1 text-slate-400 hover:text-blue-700 disabled:opacity-20"
                onClick={() => {
                  const reordered = [...options];
                  [reordered[index + 1], reordered[index]] = [
                    reordered[index],
                    reordered[index + 1],
                  ];
                  onChange({ options: reordered });
                }}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Remove choice ${index + 1}`}
                className="p-1 text-slate-400 hover:text-red-700"
                onClick={() =>
                  onChange({
                    options: options.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              let number = options.length + 1;
              while (options.includes(`Option ${number}`)) number++;
              onChange({ options: [...options, `Option ${number}`] });
            }}
          >
            <Plus className="h-3 w-3" />
            Add choice
          </button>
          <details className="pt-2 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold">
              Enter choices in bulk
            </summary>
            <textarea
              rows={6}
              aria-label="Choices, one per line"
              value={options.join("\n")}
              onChange={(event) =>
                onChange(
                  { options: event.target.value.split("\n") },
                  "bulk-options",
                )
              }
              className={inputClass}
            />
            <p className="mt-1">
              One choice per line. Existing submitted answers keep their
              original values.
            </p>
          </details>
        </div>
      )}
      {field.type !== "section" && (
        <SettingLabel label="Question width">
          <select
            className={inputClass}
            value={field.width || "full"}
            onChange={(event) =>
              onChange({ width: event.target.value as FormField["width"] })
            }
          >
            <option value="full">Full row</option>
            <option value="half">Half row on larger screens</option>
          </select>
        </SettingLabel>
      )}
      {!["terms", "file", "section"].includes(field.type) && (
        <details className="border-t border-slate-200 pt-4">
          <summary className="cursor-pointer text-xs font-bold text-slate-700">
            Validation & default answer
          </summary>
          <div className="mt-4 space-y-4">
            {["text", "textarea", "email", "phone", "nic", "url"].includes(
              field.type,
            ) && (
              <div className="grid grid-cols-2 gap-3">
                {numeric("minLength", "Min. characters")}
                {numeric("maxLength", "Max. characters")}
              </div>
            )}
            {field.type === "number" && (
              <div className="grid grid-cols-2 gap-3">
                {numeric("min", "Minimum")}
                {numeric("max", "Maximum")}
              </div>
            )}
            {field.type === "checkbox" ? (
              <div className="grid grid-cols-2 gap-3">
                {numeric("minSelections", "Min. choices")}
                {numeric("maxSelections", "Max. choices")}
              </div>
            ) : (
              <SettingLabel
                label="Default answer"
                hint="Applicants can change this answer."
              >
                <input
                  className={inputClass}
                  value={
                    typeof field.defaultValue === "string" ||
                    typeof field.defaultValue === "number"
                      ? field.defaultValue
                      : ""
                  }
                  onChange={(event) =>
                    onChange({ defaultValue: event.target.value }, "default")
                  }
                />
              </SettingLabel>
            )}
            {!identity && (
              <Toggle
                label="Require a unique answer"
                checked={Boolean(field.unique)}
                hint="Blocks reused answers on this form after trimming spaces and ignoring letter case."
                onChange={(unique) => onChange({ unique })}
              />
            )}
          </div>
        </details>
      )}
      {!identity && previous.length > 0 && (
        <details
          className="border-t border-slate-200 pt-4"
          open={Boolean(field.visibility)}
        >
          <summary className="cursor-pointer text-xs font-bold text-slate-700">
            Show only when…
          </summary>
          <div className="mt-4 space-y-3">
            <SettingLabel label="Earlier question">
              <select
                className={inputClass}
                value={field.visibility?.field_id || ""}
                onChange={(event) =>
                  onChange({
                    visibility: event.target.value
                      ? {
                          field_id: event.target.value,
                          operator: "equals",
                          value: "",
                        }
                      : undefined,
                  })
                }
              >
                <option value="">Always show</option>
                {previous.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </SettingLabel>
            {field.visibility && (
              <>
                <SettingLabel label="Condition">
                  <select
                    className={inputClass}
                    value={field.visibility.operator}
                    onChange={(event) =>
                      onChange({
                        visibility: {
                          ...field.visibility!,
                          operator: event.target.value as NonNullable<
                            FormField["visibility"]
                          >["operator"],
                        },
                      })
                    }
                  >
                    {[
                      ["equals", "Equals"],
                      ["not_equals", "Does not equal"],
                      ["contains", "Contains / selected"],
                      ["empty", "Is empty"],
                      ["not_empty", "Is answered"],
                      ["greater", "Greater than"],
                      ["less", "Less than"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </SettingLabel>
                {!["empty", "not_empty"].includes(
                  field.visibility.operator,
                ) && (
                  <SettingLabel label="Answer to match">
                    <input
                      className={inputClass}
                      value={field.visibility.value || ""}
                      onChange={(event) =>
                        onChange(
                          {
                            visibility: {
                              ...field.visibility!,
                              value: event.target.value,
                            },
                          },
                          "condition-value",
                        )
                      }
                    />
                  </SettingLabel>
                )}
                <p className="text-xs leading-relaxed text-slate-500">
                  Hidden answers are excluded from submissions. A hidden section
                  also hides its questions until the next section heading.
                </p>
              </>
            )}
          </div>
        </details>
      )}
      <details className="border-t border-slate-200 pt-4">
        <summary className="cursor-pointer text-xs font-bold text-slate-700">
          Advanced identity mapping
        </summary>
        <div className="mt-4 space-y-3">
          <p className="break-all font-mono text-[10px] text-slate-400">
            Stable question key: {field.id}
          </p>
          {!["file", "section"].includes(field.type) && (
            <SettingLabel label="Admissions field">
              <select
                className={inputClass}
                value={field.systemKey || ""}
                onChange={(event) =>
                  onChange({ systemKey: event.target.value || undefined })
                }
              >
                <option value="">Use question key</option>
                {[
                  "fullName",
                  "nameWithInitials",
                  "email",
                  "phone",
                  "nic",
                  "district",
                  "dob",
                  "address",
                  "gender",
                  "whatsapp",
                ].map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </SettingLabel>
          )}
        </div>
      </details>
    </div>
  );
}

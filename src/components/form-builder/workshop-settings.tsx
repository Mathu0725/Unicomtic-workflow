"use client";
import { useState } from "react";
import type {
  CustomForm,
  Workshop,
  WorkshopFormConfig,
} from "@/lib/data/store";
import type { FormEditorValues } from "@/lib/forms/editor";
import {
  explicitWorkshopConfig,
  workshopOptions,
} from "@/lib/workshops/policy";
import WorkshopEditor from "@/components/workshop-editor";
import {
  Toggle,
  SettingLabel,
  SettingsCard,
  inputClass,
  buttonClass,
} from "./controls";
export default function WorkshopSettings({
  form,
  values,
  workshops,
  onChange,
  onCreated,
}: {
  form: CustomForm;
  values: FormEditorValues;
  workshops: (Workshop & { bookedCount?: number })[];
  onChange: (patch: Partial<FormEditorValues>) => void;
  onCreated?: (w: Workshop) => void;
}) {
  const [creating, setCreating] = useState(false),
    [created, setCreated] = useState("");
  const config = explicitWorkshopConfig(
    values.workshop_config,
    workshops,
    form.campaign_id,
  );
  const change = (patch: Partial<WorkshopFormConfig>) =>
    onChange({ workshop_config: { ...config, ...patch } });
  const eligible = workshops.filter((w) => w.campaign_id === form.campaign_id);
  return (
    <SettingsCard
      title="Workshop selection"
      description="Attach sessions to this form. Save draft, preview and publish when ready."
    >
      <div className="space-y-2 rounded-lg bg-blue-50 p-3">
        <p className="text-sm font-semibold">Quick flow setup</p>
        {form.type === "application" ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                onChange({
                  application_mode: "open",
                  workshop_config: { ...config, enabled: true },
                })
              }
            >
              Open application + workshop
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                onChange({
                  application_mode: "invitation",
                  workshop_config: { ...config, enabled: true },
                })
              }
            >
              Registered applicants + workshop
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={buttonClass}
            onClick={() => change({ enabled: true })}
          >
            This form + workshop selection
          </button>
        )}
        <p className="text-xs text-slate-600">
          Choose the sessions below. These shortcuts update the current draft;
          preview and publish to apply.
        </p>
      </div>
      {values.workshop_config?.selection_mode !== "explicit" &&
        values.workshop_config?.enabled && (
          <p className="text-sm text-amber-800">
            This form uses the older automatic workshop list. Review the
            attached sessions below. Changes here switch it to an explicit list
            when published; future workshops must be attached.
          </p>
        )}
      <Toggle
        label="Show workshop selection on this form"
        checked={config.enabled}
        onChange={(enabled) => change({ enabled })}
      />
      <Toggle
        label="Applicant must select a workshop"
        checked={config.required}
        onChange={(required) => change({ required })}
      />
      <div className="space-y-2">
        {eligible.map((w) => {
          const attached = config.workshop_ids.includes(w.id),
            hidden = config.hidden_ids?.includes(w.id) || false;
          return (
            <div
              key={w.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
            >
              <label className="flex gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={attached}
                  onChange={(e) =>
                    change({
                      workshop_ids: e.target.checked
                        ? [...config.workshop_ids, w.id]
                        : config.workshop_ids.filter((id) => id !== w.id),
                      hidden_ids: config.hidden_ids?.filter(
                        (id) => id !== w.id,
                      ),
                    })
                  }
                />
                <span>
                  <strong>{w.title}</strong>
                  <span className="block text-xs text-slate-500">
                    {new Date(w.start_time).toLocaleString("en-GB", {
                      timeZone: "Asia/Colombo",
                    })}{" "}
                    · {w.bookedCount || 0} / {w.capacity || "Unlimited"} booked
                    · {w.is_active ? "Open" : "Closed"}
                  </span>
                </span>
              </label>
              {attached && (
                <label className="flex gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!hidden}
                    onChange={(e) =>
                      change({
                        hidden_ids: e.target.checked
                          ? (config.hidden_ids || []).filter(
                              (id) => id !== w.id,
                            )
                          : [...(config.hidden_ids || []), w.id],
                      })
                    }
                  />
                  Show on this form
                </label>
              )}
            </div>
          );
        })}
      </div>
      {!eligible.length && (
        <p className="text-sm text-slate-500">
          Create a workshop for this intake to attach it.
        </p>
      )}
      <p className="text-xs text-slate-500">
        Only attached, visible workshops appear. An empty list shows no
        workshops. Bookings already saved keep their history.
      </p>
      {config.enabled &&
        config.required &&
        !workshopOptions(workshops, form.campaign_id, config).some(
          (w) => w.bookable,
        ) && (
          <p role="alert" className="text-sm text-amber-800">
            A required workshop block needs an open session with seats before
            publishing.
          </p>
        )}
      <SettingLabel label="Display label">
        <input
          className={inputClass}
          maxLength={100}
          value={config.label || "Select your workshop"}
          onChange={(e) => change({ label: e.target.value })}
        />
      </SettingLabel>
      <SettingLabel label="Help text (optional)">
        <textarea
          className={inputClass}
          maxLength={500}
          value={config.help_text || ""}
          onChange={(e) => change({ help_text: e.target.value })}
        />
      </SettingLabel>
      <SettingLabel label="No available workshops message (optional)">
        <textarea
          className={inputClass}
          maxLength={500}
          value={config.empty_message || ""}
          onChange={(e) => change({ empty_message: e.target.value })}
        />
      </SettingLabel>
      <Toggle
        label="Show remaining seats"
        checked={config.show_remaining !== false}
        onChange={(show_remaining) => change({ show_remaining })}
      />
      <button
        type="button"
        className={buttonClass}
        onClick={() => setCreating(!creating)}
      >
        {creating ? "Close workshop creator" : "Create workshop"}
      </button>
      {created && (
        <p role="status" className="text-sm text-blue-700">
          {created}
        </p>
      )}
      {creating && (
        <div className="rounded-xl border p-4">
          <WorkshopEditor
            campaignId={form.campaign_id}
            onCancel={() => setCreating(false)}
            onSaved={(w) => {
              onCreated?.(w);
              change({
                enabled: true,
                workshop_ids: [...new Set([...config.workshop_ids, w.id])],
              });
              setCreating(false);
              setCreated(
                "Workshop created and selected in this editor. Save draft, then preview and publish the attachment. If saving fails, select this same workshop again.",
              );
            }}
          />
        </div>
      )}
    </SettingsCard>
  );
}

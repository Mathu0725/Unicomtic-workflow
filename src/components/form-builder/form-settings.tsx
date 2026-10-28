"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { CustomForm, Workshop } from "@/lib/data/store";
import type { FormEditorValues } from "@/lib/forms/editor";
import {
  defaultFormMessages,
  formMessageFields,
  resolveFormMessageDisplay,
  resolveFormMessages,
  type FormMessageKey,
} from "@/lib/forms/messages";
import { richTextFromPlain, richTextPlainText } from "@/lib/forms/rich-text";
import { formSlugProblem } from "@/lib/forms/public-links";
import FormInstructions from "@/components/form-instructions";
import FormSubmitMessages from "@/components/form-submit-messages";
import {
  buttonClass,
  inputClass,
  SettingLabel,
  SettingsCard,
  Toggle,
} from "./controls";

const RichTextEditor = dynamic(() => import("./rich-text-editor"), {
  loading: () => (
    <p className="p-4 text-xs text-slate-500">Loading description editor…</p>
  ),
});
export function FormContentSettings({
  values,
  onChange,
}: {
  values: FormEditorValues;
  onChange: (patch: Partial<FormEditorValues>, group?: string) => void;
}) {
  return (
    <div className="space-y-5">
      <SettingLabel label="Form title">
        <input
          className={inputClass}
          maxLength={255}
          value={values.title}
          onChange={(event) => onChange({ title: event.target.value }, "title")}
        />
      </SettingLabel>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-700">
          Description & instructions
        </p>
        <RichTextEditor
          value={
            values.description_rich || richTextFromPlain(values.description)
          }
          onChange={(description_rich) =>
            onChange(
              {
                description_rich,
                description: richTextPlainText(description_rich),
              },
              "description",
            )
          }
        />
      </div>
    </div>
  );
}
export default function FormSettings({
  form,
  values,
  onChange,
  section,
  workshops,
}: {
  form: CustomForm;
  values: FormEditorValues;
  onChange: (patch: Partial<FormEditorValues>, group?: string) => void;
  section: string;
  workshops: Workshop[];
}) {
  const messages = resolveFormMessages(values.messages),
    display = resolveFormMessageDisplay(values.message_display);
  const localTime = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  if (section === "messages") {
    const groups: { title: string; keys: FormMessageKey[] }[] = [
      { title: "Submit instructions", keys: ["submitEnglish", "submitTamil"] },
      {
        title: "Popup content",
        keys: ["popupTitle", "popupSubtitle", "popupNotes"],
      },
      {
        title: "Button labels",
        keys: [
          "submitButtonLabel",
          "viewInstructionsLabel",
          "continueButtonLabel",
        ],
      },
      {
        title: "Draft saving notices",
        keys: ["autoSaveMessage", "draftRestoredMessage"],
      },
    ];
    return (
      <div className="space-y-5">
        <SettingsCard
          title="Messages & popup"
          description="Choose what applicants see on this form. Switches preserve your wording when turned off."
        >
          <Toggle
            label="Enable popup"
            hint="Show instructions on opening the form and the View instructions button."
            checked={display.popup_enabled}
            onChange={(popup_enabled) =>
              onChange({ message_display: { ...display, popup_enabled } })
            }
          />
          <Toggle
            label="Enable bottom messages"
            hint="Show submit instructions and the draft saving notice below the button."
            checked={display.bottom_messages_enabled}
            onChange={(bottom_messages_enabled) =>
              onChange({
                message_display: { ...display, bottom_messages_enabled },
              })
            }
          />
          <FormInstructions
            enabled={display.popup_enabled}
            messages={messages}
            autoOpen={false}
            triggerLabel="Preview popup"
          />
        </SettingsCard>
        {groups.map((group) => (
          <details
            key={group.title}
            className="rounded-2xl border border-slate-200 bg-white p-5"
            open={group.title === "Submit instructions"}
          >
            <summary className="cursor-pointer text-sm font-bold text-slate-800">
              {group.title}
            </summary>
            <div className="mt-5 space-y-5">
              {formMessageFields
                .filter((field) => group.keys.includes(field.key))
                .map((field) => (
                  <SettingLabel
                    key={field.key}
                    label={field.label}
                    hint={field.hint}
                  >
                    {field.rows ? (
                      <textarea
                        className={inputClass}
                        rows={field.rows}
                        maxLength={field.maxLength}
                        value={messages[field.key]}
                        onChange={(event) =>
                          onChange(
                            {
                              messages: {
                                ...messages,
                                [field.key]: event.target.value,
                              },
                            },
                            `message-${field.key}`,
                          )
                        }
                      />
                    ) : (
                      <input
                        className={inputClass}
                        maxLength={field.maxLength}
                        value={messages[field.key]}
                        onChange={(event) =>
                          onChange(
                            {
                              messages: {
                                ...messages,
                                [field.key]: event.target.value,
                              },
                            },
                            `message-${field.key}`,
                          )
                        }
                      />
                    )}
                  </SettingLabel>
                ))}
            </div>
          </details>
        ))}
        <SettingsCard title="Bottom messages preview">
          <div className="rounded-lg bg-[#4d4d4d] p-3 text-center text-sm font-bold text-white">
            {messages.submitButtonLabel}
          </div>
          <FormSubmitMessages
            enabled={display.bottom_messages_enabled}
            messages={messages}
          />
          {!display.bottom_messages_enabled && (
            <p className="text-center text-xs text-slate-500">
              Bottom messages are hidden.
            </p>
          )}
          <button
            type="button"
            className={buttonClass}
            onClick={() => onChange({ messages: { ...defaultFormMessages } })}
          >
            Load default wording
          </button>
        </SettingsCard>
      </div>
    );
  }
  if (section === "confirmation")
    return (
      <SettingsCard
        title="After submission"
        description="Shown after the database confirms the response. The unique reference number appears automatically."
      >
        <SettingLabel label="Success message">
          <textarea
            rows={5}
            maxLength={4000}
            value={values.confirmation_message}
            onChange={(event) =>
              onChange(
                { confirmation_message: event.target.value },
                "confirmation",
              )
            }
            className={inputClass}
          />
        </SettingLabel>
        <SettingLabel
          label="Continue button URL"
          hint="Optional. Applicants can follow this link after saving their reference number."
        >
          <input
            type="url"
            value={values.redirect_url || ""}
            onChange={(event) =>
              onChange({ redirect_url: event.target.value }, "redirect")
            }
            className={inputClass}
            placeholder="https://example.com"
          />
        </SettingLabel>
      </SettingsCard>
    );
  if (section === "email")
    return (
      <SettingsCard
        title="Email notifications"
        description="Messages use the connected Gmail or SMTP sender and the existing delivery queue."
      >
        <Toggle
          label="Enable form emails"
          checked={values.email_automation.enabled}
          onChange={(enabled) =>
            onChange({
              email_automation: { ...values.email_automation, enabled },
            })
          }
        />
        <Toggle
          label="Confirmation email to applicant"
          checked={values.email_automation.send_applicant_email}
          onChange={(send_applicant_email) =>
            onChange({
              email_automation: {
                ...values.email_automation,
                send_applicant_email,
              },
            })
          }
        />
        <Toggle
          label="Alert admissions staff"
          checked={values.email_automation.send_admin_notification}
          onChange={(send_admin_notification) =>
            onChange({
              email_automation: {
                ...values.email_automation,
                send_admin_notification,
              },
            })
          }
        />
        <SettingLabel
          label="Additional staff email addresses"
          hint="Separate addresses with commas. The configured admissions notification address is included when staff alerts are enabled."
        >
          <input
            className={inputClass}
            value={values.email_automation.admin_emails.join(", ")}
            onChange={(event) =>
              onChange(
                {
                  email_automation: {
                    ...values.email_automation,
                    admin_emails: event.target.value
                      .split(",")
                      .map((email) => email.trim())
                      .filter(Boolean),
                  },
                },
                "staff-emails",
              )
            }
          />
        </SettingLabel>
        <Link href="/admin/email/templates" className={buttonClass}>
          Edit confirmation & staff email templates →
        </Link>
        <p className="text-xs leading-relaxed text-slate-500">
          Publish notification settings before leaving to edit templates. Saved
          drafts retain their email template values; another editor's changes
          trigger a conflict check.
        </p>
      </SettingsCard>
    );
  if (section === "workshops") {
    const config = values.workshop_config || {
      enabled: false,
      required: false,
      workshop_ids: [],
    };
    return (
      <SettingsCard
        title="Workshop selection"
        description="Let applicants choose a session. Capacity and availability are checked when the response is saved."
      >
        <Toggle
          label="Include workshop choices"
          checked={config.enabled}
          onChange={(enabled) =>
            onChange({ workshop_config: { ...config, enabled } })
          }
        />
        <Toggle
          label="Require a workshop"
          checked={config.required}
          onChange={(required) =>
            onChange({ workshop_config: { ...config, required } })
          }
        />
        <div className="space-y-2">
          {workshops
            .filter((workshop) => workshop.campaign_id === form.campaign_id)
            .map((workshop) => (
              <label
                key={workshop.id}
                className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={config.workshop_ids.includes(workshop.id)}
                  onChange={(event) =>
                    onChange({
                      workshop_config: {
                        ...config,
                        workshop_ids: event.target.checked
                          ? [...config.workshop_ids, workshop.id]
                          : config.workshop_ids.filter(
                              (id) => id !== workshop.id,
                            ),
                      },
                    })
                  }
                  className="mt-1 accent-blue-600"
                />
                <span>
                  <strong>{workshop.title}</strong>
                  <span className="mt-1 block text-xs text-slate-500">
                    {new Date(workshop.start_time).toLocaleString()} ·{" "}
                    {workshop.capacity || "Unlimited"} seats
                  </span>
                </span>
              </label>
            ))}
        </div>
        <p className="text-xs text-slate-500">
          Leave all unchecked to show available sessions in this intake.
        </p>
        <Link href="/admin/workshops" className={buttonClass}>
          Plan a workshop →
        </Link>
      </SettingsCard>
    );
  }
  return (
    <div className="space-y-5">
      <SettingsCard title="Form content">
        <FormContentSettings values={values} onChange={onChange} />
      </SettingsCard>
      <SettingsCard
        title="Public link"
        description="Previously shared links will keep opening this form."
      >
        <SettingLabel label="Link name">
          <div className="mt-1.5 flex overflow-hidden rounded-lg border border-slate-300">
            <span className="bg-slate-50 p-2 text-sm font-normal text-slate-500">
              /form/
            </span>
            <input
              className="min-w-0 flex-1 px-2 text-sm font-normal outline-none"
              maxLength={100}
              value={values.slug}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) =>
                onChange({ slug: event.target.value.toLowerCase() }, "slug")
              }
            />
          </div>
        </SettingLabel>
        {formSlugProblem(values.slug) && (
          <p role="alert" className="text-xs text-amber-800">
            {formSlugProblem(values.slug)}
          </p>
        )}
        {form.previous_slugs?.length ? (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">
              Previously shared links
            </summary>
            <ul className="mt-2 space-y-1">
              {form.previous_slugs.map((slug) => (
                <li key={slug}>/form/{slug}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </SettingsCard>
      <SettingsCard
        title="Availability"
        description="Changes take effect when you publish or update the form."
      >
        <SettingLabel label="Form status">
          <select
            className={inputClass}
            value={values.status || "published"}
            onChange={(event) =>
              onChange({
                status: event.target.value as FormEditorValues["status"],
              })
            }
          >
            <option value="draft">Draft</option>
            <option value="published">Published · accepting responses</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
        </SettingLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingLabel label="Opens at (your local time)">
            <input
              type="datetime-local"
              className={inputClass}
              value={localTime(values.starts_at)}
              onChange={(event) =>
                onChange({
                  starts_at: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : "",
                })
              }
            />
          </SettingLabel>
          <SettingLabel label="Closes at (your local time)">
            <input
              type="datetime-local"
              className={inputClass}
              value={localTime(values.closes_at)}
              onChange={(event) =>
                onChange({
                  closes_at: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : "",
                })
              }
            />
          </SettingLabel>
        </div>
        <SettingLabel
          label="Maximum responses"
          hint="Leave empty or enter 0 for no response limit."
        >
          <input
            type="number"
            min={0}
            max={1000000}
            className={inputClass}
            value={values.submission_limit || ""}
            onChange={(event) =>
              onChange(
                { submission_limit: Number(event.target.value) || 0 },
                "limit",
              )
            }
          />
        </SettingLabel>
      </SettingsCard>
      <SettingsCard
        title="Duplicate protection"
        description="One registration and one application per intake. Email, NIC and phone are normalized and checked together on the server."
      >
        <p className="text-sm leading-relaxed text-slate-600">
          Admissions identity protection is always enabled. For an extra unique
          answer, select a question and enable “Require a unique answer” under
          Validation.
        </p>
      </SettingsCard>
    </div>
  );
}

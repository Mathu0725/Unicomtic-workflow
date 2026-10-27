"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";
import { formSlugProblem } from "@/lib/forms/public-links";
import { defaultFormMessages, formMessageFields, resolveFormMessageDisplay, resolveFormMessages } from "@/lib/forms/messages";
import FormInstructions from "@/components/form-instructions";
import FormSubmitMessages from "@/components/form-submit-messages";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  FormInput, 
  Save, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  FileSpreadsheet, 
  Mail, 
  Settings2, 
  Copy, 
  Check, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Eye, 
  Layers, 
  Sparkles,
  AlignLeft,
  AtSign,
  Phone,
  CreditCard,
  MapPin,
  Calendar,
  List,
  CheckSquare,
  Paperclip
} from "lucide-react";

export default function FormBuilderPage() {
  const [pageError, setPageError] = useState("");
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;

  const [form, setForm] = useState<any | null>(null);
  const [savedSlug, setSavedSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"fields" | "sheets" | "email" | "workshops" | "messages">("fields");
  const [workshops, setWorkshops] = useState<any[]>([]);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const handleSyncGoogleForm = async () => {
    if (!form) return;
    setSyncingGoogle(true);
    setBanner(null);
    try {
      setPageError("");
      const res = await apiResponse(`/api/admin/forms/${form.id}/google-sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setBanner({
          type: "success",
          message: data.message,
        });
        setForm((prev: any) => ({
          ...prev,
          submissions_count: data.totalSubmissions,
          google_form_config: {
            ...prev.google_form_config,
            last_synced_at: data.lastSyncedAt,
          },
        }));
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (e) {
      setBanner({ type: "error", message: "Failed to sync from Google Form." });
    } finally {
      setSyncingGoogle(false);
    }
  };

  useEffect(() => {
    apiResponse("/api/admin/workshops").then(r => r.json()).then(d => setWorkshops(d.workshops || [])).catch(e => setPageError(e.message));
    apiResponse(`/api/admin/forms/${formId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.form) {
          setForm({ ...data.form, messages: resolveFormMessages(data.form.messages), message_display: resolveFormMessageDisplay(data.form.message_display) });
          setSavedSlug(data.form.slug);
        }
      })
      .catch((e) => setPageError(e instanceof Error ? e.message : "Could not load this data."))
      .finally(() => setLoading(false));
  }, [formId]);

  // Field Management Helpers
  const addField = (fieldType: string) => {
    if (!form) return;
    const fieldId = `fld_${Date.now()}`;
    let newField: any = {
      id: fieldId,
      type: fieldType,
      label: "New Field",
      placeholder: "",
      required: false,
    };

    if (fieldType === "text") {
      newField.label = "Short Text Question";
      newField.placeholder = "Enter your answer";
    } else if (fieldType === "textarea") {
      newField.label = "Detailed Description / Statement";
      newField.placeholder = "Enter detailed response...";
    } else if (fieldType === "email") {
      newField.label = "Email Address";
      newField.placeholder = "student@example.lk";
      newField.required = true;
    } else if (fieldType === "phone") {
      newField.label = "Mobile Contact Number";
      newField.placeholder = "0771234567";
      newField.required = true;
    } else if (fieldType === "nic") {
      newField.label = "National Identity Card (NIC)";
      newField.placeholder = "200112304567 or 991234567V";
      newField.required = true;
    } else if (fieldType === "district") {
      newField.label = "Residential District (Sri Lanka)";
      newField.required = true;
    } else if (fieldType === "select" || fieldType === "radio") {
      newField.label = "Select Choice";
      newField.options = ["Option 1", "Option 2", "Option 3"];
    } else if (fieldType === "date") {
      newField.label = "Date Selection";
    } else if (fieldType === "file") {
      newField.label = "Supporting document";
      newField.helpText = "Upload a PDF, JPG or PNG document (maximum 4 MB).";
    } else if (fieldType === "terms") {
      newField.label = "I agree to the terms, conditions, and admissions policy.";
      newField.required = true;
    }

    setForm({
      ...form,
      fields: [...form.fields, newField],
    });
  };

  const updateField = (index: number, updatedProps: Record<string, any>) => {
    if (!form) return;
    const updated = [...form.fields];
    updated[index] = { ...updated[index], ...updatedProps };
    setForm({ ...form, fields: updated });
  };

  const removeField = (index: number) => {
    if (!form) return;
    const updated = form.fields.filter((_: any, i: number) => i !== index);
    setForm({ ...form, fields: updated });
  };

  const moveField = (index: number, direction: "up" | "down") => {
    if (!form) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= form.fields.length) return;
    const updated = [...form.fields];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setForm({ ...form, fields: updated });
  };

  const addOptionToField = (index: number) => {
    if (!form) return;
    const field = form.fields[index];
    const currentOptions = field.options || [];
    const newOptions = [...currentOptions, `Option ${currentOptions.length + 1}`];
    updateField(index, { options: newOptions });
  };

  const updateOption = (fieldIndex: number, optionIndex: number, val: string) => {
    if (!form) return;
    const field = form.fields[fieldIndex];
    const currentOptions = [...(field.options || [])];
    currentOptions[optionIndex] = val;
    updateField(fieldIndex, { options: currentOptions });
  };

  const removeOption = (fieldIndex: number, optionIndex: number) => {
    if (!form) return;
    const field = form.fields[fieldIndex];
    const currentOptions = (field.options || []).filter((_: any, i: number) => i !== optionIndex);
    updateField(fieldIndex, { options: currentOptions });
  };

  // Save Form Handler
  const handleSaveForm = async () => {
    if (!form || saving) return;
    const slug = form.slug.trim().toLowerCase();
    const linkProblem = formSlugProblem(slug);
    if (linkProblem) { setBanner({ type: "error", message: linkProblem }); return; }
    const messages = resolveFormMessages(form.messages);
    const invalidMessage = formMessageFields.find(field => (field.required && !messages[field.key].trim()) || messages[field.key].length > field.maxLength);
    if (invalidMessage) { setBanner({ type: "error", message: `Check ${invalidMessage.label}: enter valid text within ${invalidMessage.maxLength} characters.` }); return; }
    setSaving(true);
    setBanner(null);

    try {
      setPageError("");
      const res = await apiResponse(`/api/admin/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          expectedUpdatedAt: form.updated_at,
          description: form.description,
          slug,
          is_active: form.is_active,
          fields: form.fields,
          google_sheets_config: form.google_sheets_config,
          google_form_config: form.google_form_config,
          workshop_config: form.workshop_config,
          email_automation: form.email_automation,
          confirmation_message: form.confirmation_message,
          messages,
          message_display: resolveFormMessageDisplay(form.message_display),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setForm({ ...data.form, messages: resolveFormMessages(data.form.messages), message_display: resolveFormMessageDisplay(data.form.message_display) });
        setSavedSlug(data.form.slug);
        setCopiedLink(false);
        setBanner({ type: "success", message: data.message });
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Could not confirm this save. Reload before repeating the change." });
    } finally {
      setSaving(false);
    }
  };

  const copyPublicUrl = async () => {
    if (!form || !savedSlug) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const publicUrl = `${origin}/form/${savedSlug}`;
    try { await navigator.clipboard.writeText(publicUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); } catch { setPageError("Could not copy the link. Select the displayed URL manually."); }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
        Loading Form Builder Studio...
      </div>
    );
  }

  if (!form) {
    return (
      <div className="p-8 text-center text-slate-500">
        <RequestNotice error>{pageError}</RequestNotice><p>{pageError ? "The form could not be loaded." : "Form not found."}</p><Link href="/admin/forms" className="text-blue-600 underline">Return to forms list</Link>
      </div>
    );
  }

  const messages = resolveFormMessages(form.messages);
  const messageDisplay = resolveFormMessageDisplay(form.message_display);
  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      {/* Top Bar with Navigation & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/forms"
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="text-xl sm:text-2xl font-black text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
              <span>Public link:</span>
              <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                /form/{savedSlug}
              </span>
              <button
                onClick={copyPublicUrl}
                className="text-slate-400 hover:text-slate-700 transition"
                title="Copy Link"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Saved admissions repository
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/form/${savedSlug}`}
            target="_blank"
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs transition flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            Preview Live Form
          </Link>

          <Link
            href={`/admin/forms/${form.id}/responses`}
            className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition flex items-center gap-1.5"
          >
            <List className="w-3.5 h-3.5" />
            {form.submissions_count || 0} Responses
          </Link>

          <button
            onClick={handleSaveForm}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:bg-blue-300"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Form
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            banner.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {banner.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          )}
          {banner.message}
        </div>
      )}

      <section aria-labelledby="public-link-heading" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div><h2 id="public-link-heading" className="font-bold text-slate-900">Public form link</h2><p id="public-link-help" className="mt-1 text-sm text-slate-500">Change the name after /form/. Use lowercase letters, numbers and single hyphens. Previously shared links will still open this form.</p></div>
        <label htmlFor="public-form-slug" className="block text-sm font-semibold text-slate-700">Link name</label>
        <div className="flex max-w-2xl items-center overflow-hidden rounded-xl border border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"><span className="border-r border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">/form/</span><input id="public-form-slug" type="text" value={form.slug} disabled={saving} maxLength={100} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="public-link-help public-link-preview" aria-invalid={Boolean(formSlugProblem(form.slug.trim().toLowerCase()))} onChange={event => { setForm({ ...form, slug: event.target.value.toLowerCase() }); setCopiedLink(false); }} className="min-w-0 flex-1 bg-white px-3 py-2.5 text-sm outline-none disabled:opacity-60" placeholder="tic-2027-registration" /></div>
        {formSlugProblem(form.slug.trim().toLowerCase()) ? <p role="alert" className="text-xs text-red-700">{formSlugProblem(form.slug.trim().toLowerCase())}</p> : null}
        <p id="public-link-preview" className="break-all text-xs text-slate-600">{form.slug.trim().toLowerCase() !== savedSlug ? "New link after saving: " : "Current link: "}{origin}/form/{form.slug.trim().toLowerCase()}</p>
        {form.slug.trim().toLowerCase() !== savedSlug && <p className="text-xs font-semibold text-amber-700">Choose Save Form to activate the new link. Copy Link and Preview Live Form use the saved link.</p>}
        {form.previous_slugs?.length > 0 && <details className="text-xs text-slate-500"><summary className="cursor-pointer font-semibold">Previously shared links ({form.previous_slugs.length})</summary><ul className="mt-2 space-y-1">{form.previous_slugs.map((slug: string) => <li key={slug} className="break-all">{origin}/form/{slug}</li>)}</ul></details>}
      </section>

      {/* Tabs Switcher */}
      <div className="flex gap-2 border-b border-slate-200 text-xs font-bold pb-2">
        <button
          onClick={() => setActiveTab("fields")}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-2 ${
            activeTab === "fields"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FormInput className="w-4 h-4" />
          1. Form Fields Designer ({form.fields?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab("sheets")}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-2 ${
            activeTab === "sheets"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          2. Google Form & Sheets Connection
          {(form.google_form_config?.enabled || form.google_sheets_config?.enabled) && (
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("email")}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-2 ${
            activeTab === "email"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Mail className="w-4 h-4" />
          3. Email Automation
          {form.email_automation?.enabled && (
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
          )}
        </button>
      </div>

      {/* TAB 1: Visual Fields Designer */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveTab("workshops")} className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700">4. Workshop choices</button>
        <button onClick={() => setActiveTab("messages")} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${activeTab === "messages" ? "border-blue-600 bg-blue-600 text-white" : "border-blue-200 text-blue-700"}`}>5. Messages & popup</button>
      </div>
      {activeTab === "messages" && <section aria-labelledby="form-messages-heading" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="form-messages-heading" className="text-lg font-bold">Form messages & popup</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">Set instructions and draft messages for this form in English or Tamil. Control the popup and below-button messages separately. Choose Save Form to apply your changes.</p></div><FormInstructions messages={messages} enabled={messageDisplay.popup_enabled} autoOpen={false} triggerLabel="Preview popup" /></div>
        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-bold text-slate-700">Message visibility for this form</legend>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" role="switch" checked={messageDisplay.popup_enabled} disabled={saving} onChange={event => setForm({ ...form, message_display: { ...messageDisplay, popup_enabled: event.target.checked } })} className="mt-1 h-4 w-4 accent-blue-600 disabled:opacity-60" aria-describedby="popup-visibility-help" />
            <span><span className="text-sm font-semibold text-slate-700">Enable popup</span><span id="popup-visibility-help" className="mt-1 block text-xs text-slate-500">Show the instructions popup when the form opens and allow visitors to reopen it. Off hides both the popup and its button.</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" role="switch" checked={messageDisplay.bottom_messages_enabled} disabled={saving} onChange={event => setForm({ ...form, message_display: { ...messageDisplay, bottom_messages_enabled: event.target.checked } })} className="mt-1 h-4 w-4 accent-blue-600 disabled:opacity-60" aria-describedby="bottom-messages-visibility-help" />
            <span><span className="text-sm font-semibold text-slate-700">Enable bottom messages</span><span id="bottom-messages-visibility-help" className="mt-1 block text-xs text-slate-500">Show the English and Tamil instructions and draft saving notice below the submit button. The submit button and automatic draft saving keep working.</span></span>
          </label>
          <p className="text-xs text-slate-500">Turning a switch off keeps your saved text. Turn it on again to show the same messages.</p>
          {!messageDisplay.popup_enabled && <p className="text-xs font-semibold text-amber-700">Popup is disabled for this form. Enable it to preview.</p>}
        </fieldset>
        <p className="text-xs text-slate-500">Use plain text. Optional messages can be left empty to hide them. Draft saving and restoring continue to work with your edited text.</p>
        <div className="grid gap-5 md:grid-cols-2">{formMessageFields.map(field => <label key={field.key} className={`block text-sm font-semibold text-slate-700 ${field.key === "popupNotes" ? "md:col-span-2" : ""}`}><span>{field.label}{field.required ? " *" : ""}</span>{field.rows ? <textarea rows={field.rows} required={field.required} maxLength={field.maxLength} disabled={saving} value={messages[field.key]} onChange={event => setForm({ ...form, messages: { ...messages, [field.key]: event.target.value } })} className="mt-1 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60" /> : <input type="text" required={field.required} maxLength={field.maxLength} disabled={saving} value={messages[field.key]} onChange={event => setForm({ ...form, messages: { ...messages, [field.key]: event.target.value } })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60" />}{field.hint && <span className="mt-1 block text-xs font-normal text-slate-500">{field.hint}</span>}</label>)}</div>
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center"><h3 className="text-xs font-bold uppercase text-slate-400">Below-button preview</h3><div className="rounded-xl bg-[#4d4d4d] px-4 py-3 text-sm font-bold text-white">{messages.submitButtonLabel}</div><FormSubmitMessages messages={messages} enabled={messageDisplay.bottom_messages_enabled} />{!messageDisplay.bottom_messages_enabled && <p className="text-xs text-slate-500">Bottom messages are hidden for this form.</p>}</div>
        <button type="button" disabled={saving} onClick={() => { setForm({ ...form, messages: { ...defaultFormMessages } }); setBanner({ type: "success", message: "Default messages loaded into the editor. Choose Save Form to apply them." }); }} className="text-sm font-semibold text-blue-700 disabled:opacity-60">Load default messages</button>
      </section>}
      {activeTab === "workshops" && <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-lg font-bold">Let applicants select a workshop</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.workshop_config?.enabled || false} onChange={e => setForm({ ...form, workshop_config: { required: false, workshop_ids: [], ...form.workshop_config, enabled: e.target.checked } })} />Enable workshop booking in this form</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.workshop_config?.required || false} onChange={e => setForm({ ...form, workshop_config: { enabled: true, workshop_ids: [], ...form.workshop_config, required: e.target.checked } })} />Require a workshop selection before submission</label>
        <p className="text-xs text-slate-500">Leave all sessions unchecked to show every available workshop in this intake. Past, closed and full workshops cannot accept new bookings.</p>
        {workshops.filter(w => w.campaign_id === form.campaign_id).map(w => <label key={w.id} className="flex gap-2 text-sm border rounded-lg p-3"><input type="checkbox" checked={form.workshop_config?.workshop_ids?.includes(w.id) || false} onChange={e => { const ids = form.workshop_config?.workshop_ids || []; setForm({ ...form, workshop_config: { enabled: true, required: false, ...form.workshop_config, workshop_ids: e.target.checked ? [...ids, w.id] : ids.filter((id: string) => id !== w.id) } }); }} />{w.title} · {new Date(w.start_time).toLocaleString()} · {w.capacity || "Unlimited"} seats</label>)}
        <Link href="/admin/workshops" className="block text-sm font-semibold text-blue-600">Plan a new workshop →</Link><p className="text-xs text-slate-500">Click Save Form after changing these choices. Booking confirmations and 3-day / 1-day reminders use the selected email provider.</p>
      </section>}
      {activeTab === "fields" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Left Field Palette */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm text-xs sticky top-20">
            <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-slate-500">
              <Plus className="w-4 h-4 text-blue-600" />
              Add Form Elements
            </h3>

            <div className="space-y-1.5">
              <button
                onClick={() => addField("text")}
                className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300 transition flex items-center gap-2.5 font-medium text-slate-700"
              >
                <AlignLeft className="w-4 h-4 text-blue-600" />
                Short Text
              </button>

              <button
                onClick={() => addField("textarea")}
                className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300 transition flex items-center gap-2.5 font-medium text-slate-700"
              >
                <AlignLeft className="w-4 h-4 text-indigo-600" />
                Paragraph / Statement
              </button>

              <button
                onClick={() => addField("email")}
                className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300 transition flex items-center gap-2.5 font-medium text-slate-700"
              >
                <AtSign className="w-4 h-4 text-red-500" />
                Email Address
              </button>

              <button
                onClick={() => addField("phone")}
                className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300 transition flex items-center gap-2.5 font-medium text-slate-700"
              >
                <Phone className="w-4 h-4 text-emerald-600" />
                Mobile Phone (Sri Lanka)
              </button>

              <button
                onClick={() => addField("nic")}
                className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300 transition flex items-center gap-2.5 font-medium text-slate-700"
              >
                <CreditCard className="w-4 h-4 text-purple-600" />
                Sri Lankan NIC (Verified)
              </button>

              <button
                onClick={() => addField("district")}
                className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300 transition flex items-center gap-2.5 font-medium text-slate-700"
              >
                <MapPin className="w-4 h-4 text-amber-600" />
                District (25 Districts)
              </button>

              <button
                onClick={() => addField("select")}
                className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300 transition flex items-center gap-2.5 font-medium text-slate-700"
              >
                <List className="w-4 h-4 text-blue-500" />
                Dropdown Menu
              </button>

              <button
                onClick={() => addField("date")}
                className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300 transition flex items-center gap-2.5 font-medium text-slate-700"
              >
                <Calendar className="w-4 h-4 text-teal-600" />
                Date Picker
              </button>

              <button
                onClick={() => addField("terms")}
                className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300 transition flex items-center gap-2.5 font-medium text-slate-700"
              >
                <CheckSquare className="w-4 h-4 text-slate-600" />
                Terms Agreement
              </button>
              <button onClick={() => addField("file")} className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300 transition flex items-center gap-2.5 font-medium text-slate-700"><Paperclip className="w-4 h-4 text-slate-600" />File upload (PDF / image)</button>
              <p className="px-1 text-[11px] leading-relaxed text-slate-500">For portal forms. Connect Drive and create the documents folder in <Link href="/admin/google-integrations" className="text-blue-700 underline">Google integrations</Link> first. PDF, JPG, PNG · 4 MB per document.</p>
            </div>
          </div>

          {/* Center Canvas: Configured Form Fields */}
          <div className="lg:col-span-3 space-y-4">
            {/* Form Description */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs text-xs">
              <label className="block font-bold text-slate-700 mb-1">Form Subtitle / Instructions</label>
              <input
                type="text"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Give applicants instructions on how to fill out this form..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium"
              />
            </div>

            {form.fields.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
                No fields added yet. Click an element on the left palette to add your first question.
              </div>
            ) : (
              form.fields.map((field: any, index: number) => (
                <div
                  key={field.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-blue-400 transition text-xs"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[11px]">
                        {index + 1}
                      </span>
                      <span className="font-mono text-[10px] uppercase font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        {field.type}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer mr-2">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField(index, { required: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Required
                      </label>

                      <button
                        onClick={() => moveField(index, "up")}
                        disabled={index === 0}
                        className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-20"
                        title="Move Up"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveField(index, "down")}
                        disabled={index === form.fields.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-20"
                        title="Move Down"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeField(index)}
                        className="p-1 text-slate-400 hover:text-red-600 ml-1"
                        title="Delete Field"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Field Configuration Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Field Label / Question *</label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-900"
                      />
                    </div>

                    {field.type !== "terms" && field.type !== "district" && field.type !== "file" && (
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Placeholder Hint</label>
                        <input
                          type="text"
                          value={field.placeholder || ""}
                          onChange={(e) => updateField(index, { placeholder: e.target.value })}
                          placeholder="e.g. Enter value..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                        />
                      </div>
                    )}
                  </div>

                  {/* Dropdown Options Editor */}
                  {field.type !== "file" && <div className="mt-3"><label className="text-xs font-semibold text-slate-500">Identity mapping (needed for duplicate prevention)</label><select className="ml-2 rounded border border-slate-300 p-1 text-xs" value={field.systemKey || ""} onChange={e => updateField(index, { systemKey: e.target.value || undefined })}><option value="">Use field ID / custom answer</option>{["fullName", "nameWithInitials", "email", "phone", "nic", "district", "dob", "address", "gender", "whatsapp"].map(key => <option key={key} value={key}>{key}</option>)}</select></div>}
                  {(field.type === "select" || field.type === "radio") && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <label className="block font-semibold text-slate-700 mb-2">Selectable Choices</label>
                      <div className="space-y-1.5">
                        {(field.options || []).map((opt: string, optIdx: number) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => updateOption(index, optIdx, e.target.value)}
                              className="w-full px-3 py-1 rounded-lg border border-slate-300 text-xs"
                            />
                            <button
                              onClick={() => removeOption(index, optIdx)}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => addOptionToField(index)}
                        className="mt-2 text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Choice
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Google Form & Sheets Connection */}
      {activeTab === "sheets" && (
        <div className="space-y-6 max-w-3xl text-xs">
          {/* Card 1: Google Form Real-Time Connection */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  G
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Google Form Connection & Real-Time Sync</h3>
                  <p className="text-slate-500">
                    Connect an external Google Form to capture student responses automatically into Unicom TIC.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.google_form_config?.enabled ?? false}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      google_form_config: {
                        ...(form.google_form_config || {
                          response_mode: "webhook",
                          synced_count: 0,
                        }),
                        enabled: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-slate-300 text-purple-600 h-4 w-4"
                />
                Enable Google Form
              </label>
            </div>

            {/* Google Form Link */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Google Form URL / Link
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.google_form_config?.form_url || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      google_form_config: {
                        ...(form.google_form_config || {
                          enabled: true,
                          response_mode: "webhook",
                        }),
                        form_url: e.target.value.trim(),
                        enabled: true,
                      },
                    })
                  }
                  placeholder="https://docs.google.com/forms/d/e/.../viewform or https://forms.gle/..."
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs"
                />
                {form.google_form_config?.form_url && (
                  <a
                    href={form.google_form_config.form_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold flex items-center gap-1 border border-purple-200 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Test Form
                  </a>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Enter your Google Form public view link or short URL.
              </p>
            </div>

            {/* Sync Mode */}
            <div className="grid md:grid-cols-2 gap-4 mb-4"><label className="text-xs font-semibold">Google Form response spreadsheet URL<input className="block w-full border rounded-lg p-2 mt-1" value={form.google_form_config?.response_sheet_url || ""} onChange={e => setForm({ ...form, google_form_config: { enabled: true, response_mode: "webhook", ...form.google_form_config, response_sheet_url: e.target.value } })} placeholder="https://docs.google.com/spreadsheets/d/.../edit" /></label><label className="text-xs font-semibold">Response sheet tab<input className="block w-full border rounded-lg p-2 mt-1" value={form.google_form_config?.response_sheet_name || "Form Responses 1"} onChange={e => setForm({ ...form, google_form_config: { enabled: true, response_mode: "webhook", ...form.google_form_config, response_sheet_name: e.target.value } })} /></label></div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Google Form Response Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    (form.google_form_config?.response_mode || "webhook") === "webhook"
                      ? "border-purple-500 bg-purple-50/60 text-purple-900"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="response_mode"
                    value="webhook"
                    checked={(form.google_form_config?.response_mode || "webhook") === "webhook"}
                    onChange={() =>
                      setForm({
                        ...form,
                        google_form_config: {
                          ...(form.google_form_config || { enabled: true }),
                          response_mode: "webhook",
                        },
                      })
                    }
                    className="sr-only"
                  />
                  <p className="font-bold text-xs mb-0.5">1. Webhook (Recommended)</p>
                  <p className="text-[10px] text-slate-500">
                    Real-time push. Every Google Form submit triggers instant TIC registration & email.
                  </p>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    form.google_form_config?.response_mode === "sheet_sync"
                      ? "border-purple-500 bg-purple-50/60 text-purple-900"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="response_mode"
                    value="sheet_sync"
                    checked={form.google_form_config?.response_mode === "sheet_sync"}
                    onChange={() =>
                      setForm({
                        ...form,
                        google_form_config: {
                          ...(form.google_form_config || { enabled: true }),
                          response_mode: "sheet_sync",
                        },
                      })
                    }
                    className="sr-only"
                  />
                  <p className="font-bold text-xs mb-0.5">2. Sheet Auto-Sync</p>
                  <p className="text-[10px] text-slate-500">
                    Pulls rows directly from the Google Spreadsheet linked to your Google Form.
                  </p>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    form.google_form_config?.response_mode === "embed"
                      ? "border-purple-500 bg-purple-50/60 text-purple-900"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="response_mode"
                    value="embed"
                    checked={form.google_form_config?.response_mode === "embed"}
                    onChange={() =>
                      setForm({
                        ...form,
                        google_form_config: {
                          ...(form.google_form_config || { enabled: true }),
                          response_mode: "embed",
                        },
                      })
                    }
                    className="sr-only"
                  />
                  <p className="font-bold text-xs mb-0.5">3. Embed in Portal</p>
                  <p className="text-[10px] text-slate-500">
                    Embeds the Google Form iframe directly inside your Unicom TIC public page.
                  </p>
                </label>
              </div>
            </div>

            {/* Real-Time Google Apps Script Webhook Instructions */}
            <div className="p-4 rounded-xl bg-purple-950 text-purple-100 border border-purple-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Automated Google Apps Script Webhook Snippet
                  </h4>
                  <p className="text-[10px] text-purple-300">
                    Paste this 1-click script into your Google Form to push submissions instantly.
                  </p>
                </div>

                <button
                  onClick={() => {
                    const scriptCode = `/**
 * Unicom TIC Platform - Real-Time Google Form Webhook
 * Paste this in your Google Form -> Extensions -> Apps Script
 */
function onFormSubmit(e) {
  try {
    var response = e.response;
    var itemResponses = response.getItemResponses();
    var answers = {};
    
    for (var i = 0; i < itemResponses.length; i++) {
      var item = itemResponses[i];
      answers[item.getItem().getTitle()] = item.getResponse();
    }
    
    var payload = {
      responseId: response.getId(),
      secret: "${form.google_form_config?.webhook_secret || ""}",
      formId: "${form.id}",
      timestamp: response.getTimestamp().toISOString(),
      respondentEmail: response.getRespondentEmail ? response.getRespondentEmail() : "",
      answers: answers
    };
    
    var webhookUrl = "${origin || "http://localhost:3000"}/api/forms/${savedSlug}/google-webhook";
    
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var res = UrlFetchApp.fetch(webhookUrl, options);
    Logger.log("Unicom TIC Webhook Response: " + res.getContentText());
  } catch (err) {
    Logger.log("Error posting to Unicom TIC: " + err.toString());
  }
}`;
                    navigator.clipboard.writeText(scriptCode).then(() => { setCopiedScript(true); setTimeout(() => setCopiedScript(false), 3000); }).catch(() => setPageError("Could not copy the script. Select and copy its text manually."));
                  }}
                  className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  {copiedScript ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied Script!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Google Apps Script
                    </>
                  )}
                </button>
              </div>

              {/* Webhook Endpoint Display */}
              <div className="bg-purple-900/80 p-2.5 rounded-lg font-mono text-[11px] text-purple-200 border border-purple-800 flex items-center justify-between">
                <span className="truncate">
                  Webhook URL: {origin || "http://localhost:3000"}/api/forms/{savedSlug}/google-webhook
                </span>
              </div>

              {/* Step by step guide */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-purple-300 pt-1">
                <div className="bg-purple-900/50 p-2 rounded-lg border border-purple-800/60">
                  <span className="font-bold text-white block mb-0.5">1. Open Apps Script</span>
                  In Google Form, click (⋮) top right &rarr; <strong>Apps Script</strong>.
                </div>
                <div className="bg-purple-900/50 p-2 rounded-lg border border-purple-800/60">
                  <span className="font-bold text-white block mb-0.5">2. Paste & Save</span>
                  Delete existing code, paste the copied snippet and save (Ctrl+S).
                </div>
                <div className="bg-purple-900/50 p-2 rounded-lg border border-purple-800/60">
                  <span className="font-bold text-white block mb-0.5">3. Add Form Trigger</span>
                  Click <strong>Triggers</strong> (alarm icon) &rarr; + Add Trigger &rarr; Event: <strong>On form submit</strong>.
                </div>
              </div>
            </div>

            {/* Sync Now Action */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="text-slate-500 text-[11px]">
                {form.google_form_config?.last_synced_at ? (
                  <span>
                    Last synced:{" "}
                    <strong>
                      {new Date(form.google_form_config.last_synced_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "numeric",
                        month: "short",
                      })}
                    </strong>
                  </span>
                ) : (
                  <span>Not synced yet</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleSyncGoogleForm}
                disabled={syncingGoogle}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:bg-purple-300"
              >
                {syncingGoogle ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                Sync Latest Google Form Responses Now
              </button>
            </div>
          </div>

          {/* Card 2: Google Sheets Storage Export */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Separate Google Sheet for this form</h3>
                  <p className="text-slate-500">Every submission will also automatically append a new row to your spreadsheet.</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.google_sheets_config?.enabled}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      google_sheets_config: {
                        ...form.google_sheets_config,
                        enabled: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-slate-300 text-emerald-600 h-4 w-4"
                />
                Enable Google Sheet Sync
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Google Spreadsheet ID or URL *
              </label>
              <input
                type="text"
                value={form.google_sheets_config?.sheet_id || ""}
                onChange={(e) => {
                  let val = e.target.value.trim();
                  const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                  if (match) val = match[1];
                  setForm({
                    ...form,
                    google_sheets_config: {
                      ...form.google_sheets_config,
                      sheet_id: val,
                    },
                  });
                }}
                placeholder="e.g. 1A2B3C4D5E6F7G8H9I0 or paste full Google Sheet link"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                You can paste the entire Google Sheets link directly from your browser.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Sheet Tab Name</label>
              <input
                type="text"
                value={form.google_sheets_config?.sheet_name || "Sheet1"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    google_sheets_config: {
                      ...form.google_sheets_config,
                      sheet_name: e.target.value,
                    },
                  })
                }
                placeholder="Sheet1"
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="text-blue-800 font-semibold">
                When this override is off, responses use the admissions spreadsheet in Google Integrations. When it is on, this form writes to the sheet entered above.
              </p>
              <p className="font-bold text-slate-800">How to authorize Google Sheets:</p>
              <p className="text-slate-600">
                1. Connect your admissions Gmail in Google Integrations.
              </p>
              <p className="text-slate-600">
                2. The connected Gmail account must own the sheet or have Editor access.
              </p>
              <p className="font-mono text-blue-700 bg-white p-2 rounded border border-slate-200 select-all">
                Use the same Google account connected to this portal.
              </p>
            </div>
          </div>

          {/* Card 3: Supabase PostgreSQL Real-Time Sync */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  ⚡
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Admissions data storage</h3>
                  <p className="text-slate-500">
                    Forms, student identities, bookings and notification jobs are saved together. Storage is configured in Google Integrations.
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Uses your configured repository
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="block font-bold text-slate-800 text-xs mb-0.5">Table 1: custom_forms</span>
                <p className="text-[10px] text-slate-500">
                  Form configuration, field types, validations, and Google integration settings.
                </p>
                <span className="inline-block mt-2 font-mono text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
                  Saved with form
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="block font-bold text-slate-800 text-xs mb-0.5">Table 2: form_submissions</span>
                <p className="text-[10px] text-slate-500">
                  Full raw payload, dynamic answers, and unique reference codes.
                </p>
                <span className="inline-block mt-2 font-mono text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
                  Tracked per response
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="block font-bold text-slate-800 text-xs mb-0.5">Table 3: students & registrations</span>
                <p className="text-[10px] text-slate-500">
                  Canonical identity, Sri Lanka NIC, phone, and lifecycle tracking.
                </p>
                <span className="inline-block mt-2 font-mono text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
                  Linked by identity
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Email Automation Studio */}
      {activeTab === "email" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm max-w-2xl text-xs space-y-6">
          <Link href="/admin/email/templates" className="inline-flex font-semibold text-blue-700">Edit this form's confirmation and staff alert in Email Templates →</Link>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Automated Applicant Email Dispatch</h3>
                <p className="text-slate-500">Automatically sends a formatted confirmation email upon form submission.</p>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
              <input
                type="checkbox"
                checked={form.email_automation?.send_applicant_email}
                onChange={(e) =>
                  setForm({
                    ...form,
                    email_automation: {
                      ...form.email_automation,
                      send_applicant_email: e.target.checked,
                      enabled: e.target.checked || form.email_automation?.send_admin_notification,
                    },
                  })
                }
                className="rounded border-slate-300 text-blue-600 h-4 w-4"
              />
              Send Automated Email
            </label>
          </div>

          {/* Email Subject */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Email Subject Line *</label>
            <input
              type="text"
              value={form.email_automation?.applicant_subject || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  email_automation: {
                    ...form.email_automation,
                    applicant_subject: e.target.value,
                  },
                })
              }
              placeholder="Registration Confirmed - Unicom TIC Intake [{{reference_no}}]"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-900"
            />
          </div>

          {/* Dynamic Tags Helper */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Available Dynamic Tags (Click to copy into body):
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                "reference_no",
                "fullName",
                "email",
                "phone",
                "district",
                "submission_date",
                "title",
              ].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const tagString = `{{${tag}}}`;
                    navigator.clipboard.writeText(tagString).then(() => setBanner({ type: "success", message: `Copied ${tagString}.` })).catch(() => setPageError("Could not copy this template tag. Type the displayed tag manually."));
                  }}
                  className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono text-[10px] hover:bg-blue-100 transition"
                >
                  {`{{${tag}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* HTML Email Body */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Email Message (HTML supported)</label>
            <textarea
              rows={6}
              value={form.email_automation?.applicant_body_html || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  email_automation: {
                    ...form.email_automation,
                    applicant_body_html: e.target.value,
                  },
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-[11px]"
            />
          </div>

          {/* Staff Notification Section */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Admin Notification Alert</span>
              <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.email_automation?.send_admin_notification}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      email_automation: {
                        ...form.email_automation,
                        send_admin_notification: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-slate-300 text-blue-600"
                />
                Alert Staff
              </label>
            </div>

            {form.email_automation?.send_admin_notification && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Staff Notification Emails</label>
                <input
                  type="text"
                  value={(form.email_automation?.admin_emails || []).join(", ")}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      email_automation: {
                        ...form.email_automation,
                        admin_emails: e.target.value.split(",").map((s) => s.trim()),
                      },
                    })
                  }
                  placeholder="admissions@unicomtic.org, dean@unicomtic.org"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

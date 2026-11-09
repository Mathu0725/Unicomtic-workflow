"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  FormInput, 
  Plus, 
  Copy, 
  Check, 
  ExternalLink, 
  FileSpreadsheet, 
  Mail, 
  Edit3, 
  Trash2, 
  ListOrdered, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ToggleLeft, 
  ToggleRight, 
  Sparkles,
  Layers,
  Settings2,
  RotateCw,
  X,
  CalendarDays
} from "lucide-react";

type Intake = {
  id: string;
  code: string;
  title: string;
  academic_year: string;
  description: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
};

export default function AdminFormsPage() {
  const [pageError, setPageError] = useState("");
  const [forms, setForms] = useState<any[]>([]);
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [accessUpdatingId, setAccessUpdatingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("registration");
  const [newCampaignId, setNewCampaignId] = useState("");
  const [enableWorkshops, setEnableWorkshops] = useState(false);
  const [newGoogleFormUrl, setNewGoogleFormUrl] = useState("");
  const [newSheetUrl, setNewSheetUrl] = useState("");
  const [newSheetName, setNewSheetName] = useState("Sheet1");
  const [sheetModalForm, setSheetModalForm] = useState<any | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [sheetEnabled, setSheetEnabled] = useState(false);
  const [sheetAutoSync, setSheetAutoSync] = useState(true);
  const [savingSheet, setSavingSheet] = useState(false);
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [intakeTitle, setIntakeTitle] = useState("");
  const [intakeYear, setIntakeYear] = useState(String(new Date().getFullYear()));
  const [intakeDescription, setIntakeDescription] = useState("");
  const [intakeStartsAt, setIntakeStartsAt] = useState("");
  const [intakeClosesAt, setIntakeClosesAt] = useState("");
  const [creatingIntake, setCreatingIntake] = useState(false);
  const [updatingIntakeId, setUpdatingIntakeId] = useState<string | null>(null);
  const [updatingFormIntakeId, setUpdatingFormIntakeId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchForms = async () => {
    setLoading(true);
    try {
      setPageError("");
      const res = await apiResponse("/api/admin/forms");
      const data = await res.json();
      if (data.forms) {
        setForms(data.forms);
      }
      if (data.intakes) {
        setIntakes(data.intakes);
        setNewCampaignId((current) => current || data.intakes.find((item: Intake) => item.is_active)?.id || "");
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, []);

  // 1-Click Form Duplication ("like forms app mari duplicate pannanum")
  const handleDuplicate = async (form: any) => {
    setDuplicatingId(form.id);
    setBanner(null);

    try {
      setPageError("");
      const res = await apiResponse("/api/admin/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "duplicate",
          formId: form.id,
          newTitle: `${form.title} (Batch 2 Copy)`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBanner({
          type: "success",
          message: `“${data.form.title}” copied as a draft. Review email settings and configure its spreadsheet before publishing.`,
        });
        fetchForms();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to duplicate form." });
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleToggleActive = async (form: any) => {
    try {
      setPageError("");
      const res = await apiResponse(`/api/admin/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !form.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        setForms((prev) =>
          prev.map((f) => (f.id === form.id ? { ...f, is_active: !f.is_active } : f))
        );
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    }
  };

  const handleToggleSecureLink = async (form: any) => {
    if (accessUpdatingId) return;
    setAccessUpdatingId(form.id);
    setBanner(null);
    try {
      const nextMode = form.application_mode === "open" ? "invitation" : "open";
      const res = await apiResponse(`/api/admin/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_mode: nextMode, expectedUpdatedAt: form.updated_at }),
      });
      const data = await res.json();
      setForms((previous) => previous.map((item) => item.id === form.id ? data.form : item));
      setBanner({
        type: "success",
        message: nextMode === "open"
          ? `Secure link turned off for “${form.title}”. Applicants can now open the form directly.`
          : `Secure link turned on for “${form.title}”. Registered applicants must verify their email before filling it.`,
      });
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Could not update secure-link access." });
    } finally {
      setAccessUpdatingId(null);
    }
  };

  const handleDelete = async (form: any) => {
    if (!confirm(`Are you sure you want to delete '${form.title}'? This action cannot be undone.`)) {
      return;
    }

    try {
      setPageError("");
      const res = await apiResponse(`/api/admin/forms/${form.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setBanner({ type: "success", message: data.message });
        fetchForms();
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    }
  };

  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setBanner(null);

    try {
      let sheetId = "";
      if (newSheetUrl.trim()) {
        const match = newSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        sheetId = match ? match[1] : newSheetUrl.trim();
      }

      setPageError("");
      const res = await apiResponse("/api/admin/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: newTitle,
          type: newType,
          campaignId: newCampaignId,
          google_form_url: newGoogleFormUrl.trim() || undefined,
          workshop_config: { enabled: enableWorkshops, required: enableWorkshops, workshop_ids: [] },
          google_sheets_config: sheetId
            ? {
                enabled: true,
                sheet_id: sheetId,
                sheet_name: newSheetName.trim() || "Sheet1",
                auto_sync: true,
              }
            : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setNewTitle("");
        setNewCampaignId(intakes.find((item) => item.is_active)?.id || "");
        setNewGoogleFormUrl("");
        setNewSheetUrl("");
        setNewSheetName("Sheet1");
        setBanner({ type: "success", message: data.message });
        fetchForms();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to create form." });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleIntake = async (intake: Intake) => {
    if (updatingIntakeId) return;
    setUpdatingIntakeId(intake.id);
    setBanner(null);
    try {
      const res = await apiResponse("/api/admin/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: intake.id, is_active: !intake.is_active }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Could not update the intake.");
      setIntakes((current) => current.map((item) => item.id === intake.id ? data.campaign : item));
      setNewCampaignId((current) => !intake.is_active ? intake.id : current === intake.id ? "" : current);
      setBanner({ type: "success", message: `“${intake.title}” is now ${intake.is_active ? "closed" : "accepting submissions"}.` });
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Could not update the intake." });
    } finally {
      setUpdatingIntakeId(null);
    }
  };

  const handleFormIntakeChange = async (form: any, campaignId: string) => {
    if (!campaignId || campaignId === form.campaign_id || updatingFormIntakeId) return;
    const intake = intakes.find((item) => item.id === campaignId);
    if (!intake?.is_active) return;
    setUpdatingFormIntakeId(form.id);
    setBanner(null);
    try {
      const res = await apiResponse(`/api/admin/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId, expectedUpdatedAt: form.updated_at }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Could not update the form intake.");
      setForms((current) => current.map((item) => item.id === form.id ? data.form : item));
      setBanner({ type: "success", message: `“${form.title}” now belongs to ${intake.academic_year} · ${intake.title}.` });
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Could not update the form intake." });
    } finally {
      setUpdatingFormIntakeId(null);
    }
  };

  const handleCreateIntake = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreatingIntake(true);
    setBanner(null);
    try {
      const res = await apiResponse("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: intakeTitle,
          academic_year: intakeYear,
          description: intakeDescription,
          start_date: intakeStartsAt || undefined,
          end_date: intakeClosesAt || undefined,
          is_active: true,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Could not create the intake.");
      setIntakes((current) => [...current, data.campaign]);
      setNewCampaignId(data.campaign.id);
      setIntakeTitle(""); setIntakeDescription(""); setIntakeStartsAt(""); setIntakeClosesAt("");
      setShowIntakeModal(false);
      setBanner({ type: "success", message: `“${data.campaign.title}” is active. New forms can now use this intake.` });
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Could not create the intake." });
    } finally {
      setCreatingIntake(false);
    }
  };

  const openSheetModal = (form: any) => {
    setSheetModalForm(form);
    setSheetEnabled(form.google_sheets_config?.enabled ?? false);
    setSheetUrl(form.google_sheets_config?.sheet_id || "");
    setSheetName(form.google_sheets_config?.sheet_name || "Sheet1");
    setSheetAutoSync(form.google_sheets_config?.auto_sync ?? true);
  };

  const handleSaveSheetSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetModalForm) return;
    setSavingSheet(true);
    setBanner(null);

    let val = sheetUrl.trim();
    const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = match ? match[1] : val;

    try {
      setPageError("");
      const res = await apiResponse(`/api/admin/forms/${sheetModalForm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          google_sheets_config: {
            enabled: sheetEnabled,
            sheet_id: sheetId,
            sheet_name: sheetName.trim() || "Sheet1",
            auto_sync: sheetAutoSync,
            last_synced_at: sheetModalForm.google_sheets_config?.last_synced_at || null,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBanner({
          type: "success",
          message: `Google Sheet settings for '${sheetModalForm.title}' saved successfully!`,
        });
        setSheetModalForm(null);
        fetchForms();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to update Google Sheet settings." });
    } finally {
      setSavingSheet(false);
    }
  };

  const handleSyncToSheet = async (form: any) => {
    setSyncingSheet(true);
    setBanner(null);
    try {
      setPageError("");
      const res = await apiResponse(`/api/admin/forms/${form.id}/responses`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setBanner({
          type: "success",
          message: data.message || `Successfully synchronized submissions to Google Sheet.`,
        });
        fetchForms();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to sync to Google Sheet." });
    } finally {
      setSyncingSheet(false);
    }
  };

  const handleSyncGoogleForm = async (form: any) => {
    setSyncingId(form.id);
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
          message: data.message || `Synchronized responses from Google Form for '${form.title}'.`,
        });
        fetchForms();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to sync from Google Form." });
    } finally {
      setSyncingId(null);
    }
  };

  const copyPublicLink = async (slug: string, id: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const publicUrl = `${origin}/form/${slug}`;
    try { await navigator.clipboard.writeText(publicUrl); setCopiedId(id); setTimeout(() => setCopiedId(null), 2500); } catch { setPageError("Could not copy this link. Select and copy the displayed URL manually."); }
  };

  const activeIntakes = intakes.filter((intake) => intake.is_active);

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      {/* Title & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Forms studio</span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight sm:text-3xl">
            Forms
          </h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Create registration and application forms, manage responses, and configure each form’s integrations.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowIntakeModal(true)}
            className="inline-flex shrink-0 items-center gap-2 self-start whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <CalendarDays className="h-4 w-4" />
            Manage intakes
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeIntakes.length) {
                setBanner({ type: "error", message: "Create or open an intake before creating a form." });
                setShowIntakeModal(true);
                return;
              }
              setNewCampaignId((current) => current || activeIntakes[0].id);
              setShowCreateModal(true);
            }}
            className="inline-flex shrink-0 items-center gap-2 self-start whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create New Form
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Current intake</h2>
            <p className="mt-1 text-xs text-slate-600">Only active intakes can receive registrations or be selected for a new form.</p>
          </div>
          <button type="button" onClick={() => setShowIntakeModal(true)} className="text-xs font-semibold text-blue-700 hover:underline">Manage intakes</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {intakes.map((intake) => (
            <span key={intake.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${intake.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              {intake.academic_year} · {intake.title}
              <span className="font-medium">{intake.is_active ? "Open" : "Closed"}</span>
            </span>
          ))}
          {!intakes.length && <p className="text-sm text-slate-500">No intake created yet.</p>}
        </div>
      </section>

      {/* Forms Grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {loading ? (
          <div className="col-span-2 p-12 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            Loading forms studio...
          </div>
        ) : forms.length === 0 ? (
          <div className="col-span-2 p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
            {pageError ? "Data could not be loaded. Use refresh to try again." : "No forms created yet. Click \"Create New Form\" above to start."}
          </div>
        ) : (
          forms.map((form) => {
            const isCopied = copiedId === form.id;
            const isDuplicating = duplicatingId === form.id;

            return (
              <div
                key={form.id}
                className="flex min-w-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-6"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        form.type === "registration"
                          ? "bg-blue-100 text-blue-800"
                          : form.type === "application"
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {form.type}
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">
                        {form.is_active ? (
                          <span className="text-emerald-700 font-bold">Active</span>
                        ) : (
                          <span className="text-slate-400">Closed</span>
                        )}
                      </span>
                      <button
                        onClick={() => handleToggleActive(form)}
                        title="Toggle active status"
                        className="text-slate-500 hover:text-slate-800"
                      >
                        {form.is_active ? (
                          <ToggleRight className="w-6 h-6 text-emerald-600" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-slate-300" />
                        )}
                      </button>
                    </div>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 mb-1">{form.title}</h2>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-4">{form.description}</p>

                  <div className="mb-4 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                    <label className="block text-[11px] font-bold uppercase tracking-wide text-violet-800" htmlFor={`form-intake-${form.id}`}>Intake / academic year</label>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        id={`form-intake-${form.id}`}
                        value={form.campaign_id || ""}
                        disabled={updatingFormIntakeId === form.id || !activeIntakes.length}
                        onChange={(event) => void handleFormIntakeChange(form, event.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-60"
                      >
                        <option value="">Choose an open intake</option>
                        {intakes.map((intake) => <option key={intake.id} value={intake.id} disabled={!intake.is_active && intake.id !== form.campaign_id}>{intake.academic_year} · {intake.title}{intake.is_active ? "" : " (Closed)"}</option>)}
                      </select>
                      {updatingFormIntakeId === form.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-700" aria-label="Saving intake" />}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-600">Choose the year this existing form belongs to. Only open intakes can be selected.</p>
                  </div>

                  {form.type === "application" && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                      <div>
                        <span className="block text-[11px] font-bold uppercase tracking-wide text-blue-800">Secure email link</span>
                        <span className="text-xs text-slate-600">
                          {form.application_mode === "open" ? "Off · anyone can fill this form" : "On · registered applicants verify their email"}
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-label={`Require a secure email link for ${form.title}`}
                        aria-checked={form.application_mode !== "open"}
                        disabled={accessUpdatingId === form.id}
                        onClick={() => handleToggleSecureLink(form)}
                        className="inline-flex min-w-14 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
                      >
                        {accessUpdatingId === form.id ? <Loader2 className="h-4 w-4 animate-spin" /> : form.application_mode === "open" ? "Off" : "On"}
                      </button>
                    </div>
                  )}

                  {/* Public Link Pill */}
                  <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs mb-4">
                    <span className="font-mono text-slate-600 truncate flex-1">
                      /form/{form.slug}
                    </span>
                    <button
                      onClick={() => copyPublicLink(form.slug, form.id)}
                      className="px-2 py-1 rounded bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition flex items-center gap-1"
                      title="Copy Public URL"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Link
                        </>
                      )}
                    </button>
                    <Link
                      href={`/form/${form.slug}`}
                      target="_blank"
                      className="p-1 text-slate-400 hover:text-blue-600 transition"
                      title="Open Public Form"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>

                  {/* Integration Badges */}
                  <div className="space-y-2 mb-4">
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      {/* Form-specific Google Sheet Connection Badge & Action */}
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileSpreadsheet
                            className={`w-4 h-4 flex-shrink-0 ${
                              form.google_sheets_config?.enabled && form.google_sheets_config?.sheet_id
                                ? "text-emerald-600"
                                : "text-slate-400"
                            }`}
                          />
                          <div className="min-w-0">
                            <span className="block text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                              Google Sheet
                            </span>
                            <span className="font-semibold text-slate-800 text-[11px] truncate block">
                              {form.google_sheets_config?.enabled && form.google_sheets_config?.sheet_id
                                ? `Linked: ${form.google_sheets_config.sheet_name || "Sheet1"}`
                                : "Not Linked"}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {form.google_sheets_config?.enabled && form.google_sheets_config?.sheet_id && (
                            <a
                              href={`https://docs.google.com/spreadsheets/d/${form.google_sheets_config.sheet_id}/edit`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 rounded bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-bold text-[10px] flex items-center gap-0.5 transition"
                              title="Open linked Google Sheet"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open
                            </a>
                          )}
                          <button
                            onClick={() => openSheetModal(form)}
                            className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-[10px] flex items-center gap-0.5 transition cursor-pointer"
                            title="Edit Google Sheet link for this form"
                          >
                            <Settings2 className="w-3 h-3 text-slate-500" />
                            Settings
                          </button>
                        </div>
                      </div>

                      {/* Email Automation Badge */}
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <Mail
                          className={`w-4 h-4 ${
                            form.email_automation?.enabled ? "text-blue-600" : "text-slate-400"
                          }`}
                        />
                        <div>
                          <span className="block text-[10px] text-slate-400 font-bold uppercase">Email Automation</span>
                          <span className="font-semibold text-slate-800 text-[11px]">
                            {form.email_automation?.enabled ? "Auto Confirmation" : "Disabled"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Google Form Integration Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/70 p-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="h-5 w-5 rounded bg-purple-600 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                          G
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[10px] text-purple-700 font-bold uppercase tracking-wider">
                            Google Form
                          </span>
                          <span className="font-semibold text-slate-800 text-[11px] truncate block">
                            {form.google_form_config?.enabled
                              ? "Connected (Real-time Webhook & Sheet Sync)"
                              : "Not Connected — Click Builder to Link"}
                          </span>
                        </div>
                      </div>

                      {form.google_form_config?.enabled && (
                        <button
                          onClick={() => handleSyncGoogleForm(form)}
                          disabled={syncingId === form.id}
                          className="px-2.5 py-1 rounded-md bg-white border border-purple-300 text-purple-700 hover:bg-purple-100 font-bold text-[10px] flex items-center gap-1 transition flex-shrink-0 cursor-pointer shadow-2xs"
                          title="Sync latest responses from Google Form"
                        >
                          {syncingId === form.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <span>Sync Form</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/forms/${form.id}/responses`}
                      className="font-bold text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                      {form.submissions_count || 0} Submissions
                    </Link>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* 1-Click Form Duplication Button */}
                    <button
                      onClick={() => handleDuplicate(form)}
                      disabled={isDuplicating}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs transition flex items-center gap-1 cursor-pointer border border-amber-200"
                      title="Clone entire form, fields, Google Sheet & Email automation like Forms App"
                    >
                      {isDuplicating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Layers className="w-3.5 h-3.5 text-amber-600" />
                      )}
                      Duplicate
                    </button>

                    <Link
                      href={`/admin/forms/${form.id}/builder`}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center gap-1 shadow-xs"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Builder
                    </Link>

                    <button
                      onClick={() => handleDelete(form)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="Delete Form"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showIntakeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 text-xs shadow-xl">
            <button type="button" onClick={() => setShowIntakeModal(false)} className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:text-slate-700" aria-label="Close intake management"><X className="h-5 w-5" /></button>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CalendarDays className="h-4 w-4 text-blue-600" />Intakes and academic years</h2>
            <p className="mt-1 text-slate-500">Open an intake when it is ready to receive registrations. Closing it stops every form linked to that intake.</p>

            <div className="mt-5 space-y-3">
              {intakes.map((intake) => (
                <div key={intake.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{intake.title}</p>
                    <p className="mt-1 text-slate-500">{intake.academic_year}{intake.start_date || intake.end_date ? ` · ${intake.start_date || "No opening date"} to ${intake.end_date || "No closing date"}` : ""}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={intake.is_active}
                    disabled={updatingIntakeId === intake.id}
                    onClick={() => void handleToggleIntake(intake)}
                    className={`min-w-24 rounded-lg border px-3 py-2 font-bold transition disabled:opacity-60 ${intake.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    {updatingIntakeId === intake.id ? "Saving…" : intake.is_active ? "Open" : "Closed"}
                  </button>
                </div>
              ))}
              {!intakes.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Create your first intake below.</p>}
            </div>

            <form onSubmit={handleCreateIntake} className="mt-6 space-y-3 border-t border-slate-200 pt-5">
              <h3 className="font-bold text-slate-900">Create an intake</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                <label className="block font-semibold text-slate-700">Intake name *<input required maxLength={160} value={intakeTitle} onChange={(event) => setIntakeTitle(event.target.value)} placeholder="e.g. Unicom TIC Scholarship Intake" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
                <label className="block font-semibold text-slate-700">Academic year *<input required maxLength={32} value={intakeYear} onChange={(event) => setIntakeYear(event.target.value)} placeholder="2027" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
              </div>
              <label className="block font-semibold text-slate-700">Short description <textarea maxLength={2000} rows={2} value={intakeDescription} onChange={(event) => setIntakeDescription(event.target.value)} placeholder="Optional note shown to staff" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block font-semibold text-slate-700">Opens on <input type="date" value={intakeStartsAt} onChange={(event) => setIntakeStartsAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
                <label className="block font-semibold text-slate-700">Closes on <input type="date" value={intakeClosesAt} onChange={(event) => setIntakeClosesAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
              </div>
              <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setShowIntakeModal(false)} className="rounded-xl bg-slate-100 px-4 py-2 font-bold hover:bg-slate-200">Cancel</button><button type="submit" disabled={creatingIntake} className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white shadow hover:bg-blue-700 disabled:bg-blue-300">{creatingIntake ? "Creating…" : "Create active intake"}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Form Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative text-xs">
            <button
              onClick={() => setShowCreateModal(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 absolute top-4 right-4"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <FormInput className="w-4 h-4 text-blue-600" />
              Create New Registration / Application Form
            </h2>
            <p className="text-slate-500 mb-4">
              Choose a form template to quickly pre-fill standard Sri Lankan admission fields.
            </p>

            <form onSubmit={handleCreateForm} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Intake / academic year *</label>
                <select required value={newCampaignId} onChange={(event) => setNewCampaignId(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium">
                  <option value="">Choose an open intake</option>
                  {activeIntakes.map((intake) => <option key={intake.id} value={intake.id}>{intake.academic_year} · {intake.title}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">Need another year? <button type="button" onClick={() => { setShowCreateModal(false); setShowIntakeModal(true); }} className="font-semibold text-blue-700 hover:underline">Create an intake</button>.</p>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Form Title *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Unicom TIC 2025 Intake - Batch B"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Form Template Preset</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium"
                >
                  <option value="registration">
                    Student Registration Form (NIC, Phone, District, Address, T&C)
                  </option>
                  <option value="application">
                    Formal Educational Application (O/L, A/L, Z-score, SOP)
                  </option>
                  <option value="workshop_rsvp">
                    Workshop RSVP & Orientation Confirmation
                  </option>
                  <option value="custom">
                    Blank Custom Form (Build from scratch)
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Connect Google Form (Optional)
                </label>
                <input
                  type="url"
                  value={newGoogleFormUrl}
                  onChange={(e) => setNewGoogleFormUrl(e.target.value)}
                  placeholder="https://docs.google.com/forms/d/e/... or https://forms.gle/..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-normal"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Paste your Google Form link here to automatically enable webhook sync & automated emails.
                </p>
              </div>

              <label className="flex gap-2 items-center font-semibold"><input type="checkbox" checked={enableWorkshops} onChange={e => setEnableWorkshops(e.target.checked)} />Require workshop selection on this form</label>
              {/* Form-specific Google Sheet link */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                <label className="block font-bold text-emerald-900 text-xs">
                  Link Google Sheet for this Form (Optional)
                </label>
                <input
                  type="text"
                  value={newSheetUrl}
                  onChange={(e) => setNewSheetUrl(e.target.value)}
                  placeholder="Paste Google Spreadsheet URL or Sheet ID"
                  className="w-full px-3 py-1.5 rounded-lg border border-emerald-300 bg-white font-mono text-[11px]"
                />
                <input
                  type="text"
                  value={newSheetName}
                  onChange={(e) => setNewSheetName(e.target.value)}
                  placeholder="Sheet Tab Name (e.g. Sheet1, Batch-A)"
                  className="w-full px-3 py-1.5 rounded-lg border border-emerald-300 bg-white font-semibold text-[11px]"
                />
                <p className="text-[10px] text-emerald-700">
                  Every submission to this form will automatically append a new row in this spreadsheet.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow"
                >
                  {creating ? "Creating..." : "Create Form"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dedicated Google Sheet Settings Modal for Form */}
      {sheetModalForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative text-xs">
            <button
              onClick={() => setSheetModalForm(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 absolute top-4 right-4"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Google Sheet Settings</h2>
                <p className="text-slate-500 font-medium truncate max-w-xs">{sheetModalForm.title}</p>
              </div>
            </div>

            <form onSubmit={handleSaveSheetSettings} className="space-y-4 mt-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block text-xs">Enable Google Sheet Integration</span>
                  <p className="text-slate-500 text-[11px]">
                    Append all submissions for this specific form directly into your spreadsheet.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={sheetEnabled}
                  onChange={(e) => setSheetEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 h-4 w-4 cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Google Spreadsheet URL or Sheet ID *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required={sheetEnabled}
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1A2B3C... or ID"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs"
                  />
                  {sheetUrl && (
                    <a
                      href={
                        sheetUrl.startsWith("http")
                          ? sheetUrl
                          : `https://docs.google.com/spreadsheets/d/${sheetUrl}/edit`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold border border-emerald-200 flex items-center gap-1 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  You can paste the entire Google Sheets URL directly from your browser.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sheet Tab / Worksheet Name</label>
                <input
                  type="text"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="e.g. Sheet1, Registrations, Batch-A"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sheetAutoSync"
                  checked={sheetAutoSync}
                  onChange={(e) => setSheetAutoSync(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 h-4 w-4"
                />
                <label htmlFor="sheetAutoSync" className="text-slate-700 font-semibold cursor-pointer">
                  Auto-sync: immediately push each new submission as it arrives
                </label>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
                <span className="font-bold block">Authorization Requirement:</span>
                <p>
                  Connect your admissions Gmail in Google Integrations. That account must have Editor access to the spreadsheet.
                </p>
                <p className="font-mono bg-white p-1.5 rounded border border-amber-200 select-all font-semibold">
                  Use the same Google account connected to this portal.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleSyncToSheet(sheetModalForm)}
                  disabled={syncingSheet || !sheetEnabled || !sheetUrl}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {syncingSheet ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="w-3.5 h-3.5" />
                  )}
                  Sync Existing Rows Now
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSheetModalForm(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingSheet}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition disabled:bg-emerald-300"
                  >
                    {savingSheet ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


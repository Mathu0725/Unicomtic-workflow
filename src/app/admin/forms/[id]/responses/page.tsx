"use client";
import { apiResponse } from "@/lib/client/api";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect, useCallback } from "react";
import { fetchWithTimeout, readJson, responseError } from "@/lib/client/api";
import FormResponseDetails from "@/components/form-response-details";
import { useParams } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  FileSpreadsheet, 
  Download, 
  Search, 
  CheckCircle2, 
  RotateCw, 
  Loader2, 
  AlertCircle, 
  ListOrdered, 
  Mail, 
  Edit3,
  ExternalLink
} from "lucide-react";

export default function FormResponsesPage() {
  const [pageError, setPageError] = useState("");
  const params = useParams();
  const formId = params.id as string;

  const [formTitle, setFormTitle] = useState("");
  const [fields, setFields] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [googleSheetsConfig, setGoogleSheetsConfig] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingGoogleForm, setSyncingGoogleForm] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [syncFilter, setSyncFilter] = useState("all"), [fromDate, setFromDate] = useState(""), [toDate, setToDate] = useState("");
  const [stats, setStats] = useState({ total: 0, synced: 0, emails: 0 }), [googleFormEnabled, setGoogleFormEnabled] = useState(false), [selectedResponse, setSelectedResponse] = useState<any>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchResponses = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      setPageError("");
      const query = new URLSearchParams({ page: String(page), pageSize: "25", search, status: syncFilter, ...(fromDate ? { from: fromDate } : {}), ...(toDate ? { to: toDate } : {}) });
      const res = await apiResponse(`/api/admin/forms/${formId}/responses?${query}`, { signal });
      const data = await res.json();
      if (data.success) {
        setFormTitle(data.formTitle);
        setFields((data.fields || []).filter((field: any) => field.type !== "section"));
        setSubmissions(data.submissions || []);
        setGoogleSheetsConfig(data.googleSheetsConfig || null);
        setTotal(data.total); setStats(data.stats); setPage(data.page); setGoogleFormEnabled(Boolean(data.googleFormConfig?.enabled));
      }
    } catch (e) {
      if (signal?.aborted) return;
      setPageError(e instanceof Error ? e.message : "Could not load or save this data. Please try again.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [formId, page, search, syncFilter, fromDate, toDate]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void fetchResponses(controller.signal), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [fetchResponses]);

  const handleSyncToSheets = async () => {
    setSyncing(true);
    setBanner(null);

    try {
      setPageError("");
      const res = await apiResponse(`/api/admin/forms/${formId}/responses`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setBanner({ type: "success", message: data.message });
        fetchResponses();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to sync to Google Sheet." });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncFromGoogleForm = async () => {
    setSyncingGoogleForm(true);
    setBanner(null);

    try {
      setPageError("");
      const res = await apiResponse(`/api/admin/forms/${formId}/google-sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setBanner({ type: "success", message: data.message });
        fetchResponses();
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to sync from Google Form." });
    } finally {
      setSyncingGoogleForm(false);
    }
  };

  const exportCSV = async () => {
    try {
      const query = new URLSearchParams({ export: "csv", search, status: syncFilter, ...(fromDate ? { from: fromDate } : {}), ...(toDate ? { to: toDate } : {}) });
      const response = await fetchWithTimeout(`/api/admin/forms/${formId}/responses?${query}`);
      if (!response.ok) throw responseError(response, await readJson(response));
      const url = URL.createObjectURL(await response.blob()), link = document.createElement("a");
      link.href = url; link.download = `${formTitle.replace(/[^a-z0-9]/gi, "_")}_responses.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setPageError(error instanceof Error ? error.message : "Could not export responses."); }
  };
  const filteredSubmissions = submissions;

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/forms"
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Responses & Submissions</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">{formTitle}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {googleSheetsConfig?.enabled && googleSheetsConfig?.sheet_id && (
            <a
              href={
                googleSheetsConfig.sheet_id.startsWith("http")
                  ? googleSheetsConfig.sheet_id
                  : `https://docs.google.com/spreadsheets/d/${googleSheetsConfig.sheet_id}/edit`
              }
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200 transition flex items-center gap-1.5 shadow-2xs"
              title="Open linked Google Spreadsheet in a new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Sheet ({googleSheetsConfig.sheet_name || "Sheet1"})
            </a>
          )}

          <Link
            href={`/admin/forms/${formId}/builder`}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs transition flex items-center gap-1.5"
          >
            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
            Edit in Builder
          </Link>

          <button
            onClick={handleSyncFromGoogleForm}
            disabled={syncingGoogleForm || !googleFormEnabled}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow transition flex items-center gap-1.5 cursor-pointer disabled:bg-purple-400"
            title="Pull latest responses from connected Google Form"
          >
            {syncingGoogleForm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            Sync from Google Form
          </button>

          <button
            onClick={handleSyncToSheets}
            disabled={syncing || !googleSheetsConfig}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow transition flex items-center gap-1.5 cursor-pointer disabled:bg-emerald-400"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            Sync to Google Sheet
          </button>

          <button
            onClick={exportCSV}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow transition flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {googleSheetsConfig && (
        <p className="text-xs text-slate-600">
          {googleSheetsConfig.source === "admissions"
            ? "Responses use the admissions spreadsheet configured in Google Integrations."
            : "Responses use a separate spreadsheet configured in this form's Builder."}
          {" "}Destination tab: <strong>{googleSheetsConfig.sheet_name}</strong>.
        </p>
      )}

      {banner && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            banner.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {banner.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600" />
          )}
          {banner.message}
        </div>
      )}

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-xs">
          <span className="text-slate-400 font-semibold block">Total Submissions</span>
          <span className="text-2xl font-extrabold text-slate-900">{stats.total}</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-sm text-xs">
          <span className="text-emerald-700 font-semibold block">Synced to Google Sheet</span>
          <span className="text-2xl font-extrabold text-emerald-800">
            {stats.synced} of {stats.total}
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-blue-200 bg-blue-50/20 shadow-sm text-xs">
          <span className="text-blue-700 font-semibold block">Automated Confirmation Emails</span>
          <span className="text-2xl font-extrabold text-blue-800">
            {stats.emails} Dispatched
          </span>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            maxLength={200}
            aria-label="Search responses"
            placeholder="Search responses by name, email, phone, reference number..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs"><label className="text-slate-500">Sheet status<select value={syncFilter} onChange={event => { setSyncFilter(event.target.value); setPage(1); }} className="ml-2 rounded-lg border border-slate-300 p-2 text-slate-800"><option value="all">All responses</option><option value="synced">Synced</option><option value="pending">Not yet synced</option></select></label><label className="text-slate-500">From<input type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); setPage(1); }} className="ml-2 rounded-lg border border-slate-300 p-2 text-slate-800" /></label><label className="text-slate-500">To<input type="date" value={toDate} onChange={event => { setToDate(event.target.value); setPage(1); }} className="ml-2 rounded-lg border border-slate-300 p-2 text-slate-800" /></label></div>
      </div>

      {/* Responses Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
              <tr>
                <th className="p-3.5">Reference No</th>
                <th className="p-3.5">Date</th>
                {fields.slice(0, 6).map((field) => (
                  <th key={field.id} className="p-3.5 truncate max-w-[150px]">
                    {field.label}
                  </th>
                ))}
                <th className="p-3.5">Sheet Sync</th>
                <th className="p-3.5">Email</th>
                {fields.some(field => field.type === "file") && <th className="p-3.5">Documents</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={Math.min(fields.length, 6) + 4 + Number(fields.some(field => field.type === "file"))} className="p-12 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading responses...
                  </td>
                </tr>
              ) : filteredSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={Math.min(fields.length, 6) + 4 + Number(fields.some(field => field.type === "file"))} className="p-12 text-center text-slate-400">
                    {pageError ? "Data could not be loaded. Use refresh to try again." : "No submissions found matching criteria."}
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5 font-mono font-bold text-blue-700">
                      <button type="button" onClick={() => setSelectedResponse(sub)} className="text-left underline decoration-blue-200 underline-offset-4">{sub.reference_no}</button>
                    </td>
                    <td className="p-3.5 text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </td>
                    {fields.slice(0, 6).map((field) => (
                      <td key={field.id} className="p-3.5 font-medium text-slate-800 truncate max-w-[160px]">
                        {sub.data[field.id] !== undefined ? String(sub.data[field.id]) : "-"}
                      </td>
                    ))}
                    <td className="p-3.5">
                      {sub.synced_to_sheet ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Synced
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold text-[10px]">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {sub.email_sent ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] inline-flex items-center gap-1">
                          <Mail className="w-3 h-3" /> Sent
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                    {fields.some(field => field.type === "file") && <td className="p-3.5"><div className="space-y-2">{fields.filter(field => field.type === "file" && /^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view$/.test(sub.data[field.id] || "")).map(field => <a key={field.id} href={sub.data[field.id]} target="_blank" rel="noreferrer" className="block whitespace-nowrap text-blue-700 underline">{field.label} ↗</a>)}</div></td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{total ? (page - 1) * 25 + 1 : 0}–{Math.min(page * 25, total)} of {total} matching responses</span><div className="flex items-center gap-3"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700 disabled:opacity-40">Previous</button><span>Page {page} of {Math.max(1, Math.ceil(total / 25))}</span><button type="button" disabled={page * 25 >= total || loading} onClick={() => setPage(current => current + 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700 disabled:opacity-40">Next</button></div></div>
      {selectedResponse && <FormResponseDetails submission={selectedResponse} fields={fields} onClose={() => setSelectedResponse(null)} />}
    </div>
  );
}

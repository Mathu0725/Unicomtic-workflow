"use client";
import { apiResponse } from "@/lib/client/api";
import { UPLOAD_MAX_BYTES } from "@/lib/upload-limits";
import { Notice as RequestNotice } from "@/components/live-data";

import { useState, useEffect } from "react";
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Loader2, 
  FileText, 
  ArrowRight, 
  Check, 
  RefreshCw 
} from "lucide-react";

export default function AdminMarksImportPage() {
  const [pageError, setPageError] = useState("");
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Column mapping state
  const [studentIdCol, setStudentIdCol] = useState("StudentID");
  const [scoreCol, setScoreCol] = useState("Marks");
  const [nameCol, setNameCol] = useState("CandidateName");

  useEffect(() => {
    apiResponse("/api/admin/exams")
      .then((res) => res.json())
      .then((data) => {
        if (data.exams && data.exams.length > 0) {
          setExams(data.exams);
          setSelectedExamId(data.exams[0].id);
        }
      }).catch(e => setPageError(e.message));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      if (!e.target.files[0].size || e.target.files[0].size > UPLOAD_MAX_BYTES) {
        setFile(null); setPreviewData(null);
        setBanner({ type: "error", message: "Choose a marks file up to 4 MB." });
        e.target.value = "";
        return;
      }
      setFile(e.target.files[0]);
      setPreviewData(null);
      setBanner(null);
    }
  };

  const handlePreview = async () => {
    if (!file || !selectedExamId) return;
    setPreviewing(true);
    setBanner(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("examId", selectedExamId);
    formData.append("studentIdColumn", studentIdCol);
    formData.append("scoreColumn", scoreCol);
    formData.append("nameColumn", nameCol);

    try {
      setPageError("");
      const res = await apiResponse("/api/admin/marks-import/preview", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setPreviewData(data);
        if (data.detectedMapping) {
          setStudentIdCol(data.detectedMapping.studentIdColumn);
          setScoreCol(data.detectedMapping.scoreColumn);
        }
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to parse and validate marks file." });
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!previewData || !previewData.rowsPreview) return;
    setCommitting(true);
    setBanner(null);

    try {
      setPageError("");
      const res = await apiResponse("/api/admin/marks-import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedExamId,
          fileName: previewData.fileName,
          validRows: previewData.commitRows,
          previewToken: previewData.previewToken,
          importedBy: "Admissions Examiner Officer",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBanner({ type: "success", message: data.message });
        setPreviewData(null);
        setFile(null);
      } else {
        setBanner({ type: "error", message: data.message });
      }
    } catch (err: any) {
      setBanner({ type: "error", message: err.message || "Failed to commit marks to database." });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <RequestNotice error>{pageError}</RequestNotice>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Module 10 (Stage 8 & 9)</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">OMR & Google Forms Marks Import</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Bulk optical scanner CSV/Excel marks ingestion, column mapping, anomaly detection, and row preview.
          </p>
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
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600" />
          )}
          {banner.message}
        </div>
      )}

      {/* Upload and Configuration Form */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-600" />
          1. Select Examination & Upload Scanner File (CSV / XLSX)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Target Examination *</label>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
            >
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.name} (Max: {exam.max_marks}, Pass: {exam.pass_mark})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">OMR / Google Forms Result File *</label>
            <input
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileChange}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-slate-50"
            />
          </div>
        </div>

        {/* Column Mapping Inputs */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <h3 className="text-xs font-bold text-slate-800 mb-2">Column Header Mapping</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-600 mb-1">Student / Index ID Column</label>
              <input
                type="text"
                value={studentIdCol}
                onChange={(e) => setStudentIdCol(e.target.value)}
                placeholder="StudentID or Index"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Score / Marks Column</label>
              <input
                type="text"
                value={scoreCol}
                onChange={(e) => setScoreCol(e.target.value)}
                placeholder="Marks or Score"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Candidate Name (Optional)</label>
              <input
                type="text"
                value={nameCol}
                onChange={(e) => setNameCol(e.target.value)}
                placeholder="CandidateName"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handlePreview}
            disabled={!file || previewing}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition flex items-center gap-2 disabled:bg-blue-300 cursor-pointer"
          >
            {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Validate & Preview Import Rows
          </button>
        </div>
      </div>

      {/* Validation Summary & Preview Table */}
      {previewData && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-xs">
              <span className="text-slate-400 block font-semibold">Total Rows</span>
              <span className="text-xl font-black text-slate-900">{previewData.summary.totalRows}</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm text-xs">
              <span className="text-emerald-700 block font-semibold">Valid Rows</span>
              <span className="text-xl font-black text-emerald-800">{previewData.summary.validRows}</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-red-200 bg-red-50/20 shadow-sm text-xs">
              <span className="text-red-700 block font-semibold">Errors Detected</span>
              <span className="text-xl font-black text-red-800">{previewData.summary.invalidRows}</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-xs">
              <span className="text-slate-400 block font-semibold">Duplicates</span>
              <span className="text-xl font-black text-amber-700">{previewData.summary.duplicateRows}</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-xs">
              <span className="text-slate-400 block font-semibold">Pass Threshold</span>
              <span className="text-xl font-black text-blue-700">{previewData.summary.passMark}</span>
            </div>
          </div>

          {/* Preview Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900">Row-by-Row Anomaly Inspection</h3>
                <p className="text-[11px] text-slate-500">File: {previewData.fileName}</p>
              </div>
              <button
                onClick={handleCommit}
                disabled={committing || previewData.summary.validRows === 0 || previewData.summary.invalidRows > 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow transition flex items-center gap-1.5 disabled:bg-slate-300"
              >
                {committing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Commit {previewData.summary.validRows} Valid Marks
              </button>
            </div>

            <div className="overflow-x-auto text-xs max-h-96">
              <table className="w-full text-left text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="p-3 w-16">Row</th>
                    <th className="p-3">Student Exam ID</th>
                    <th className="p-3">Raw Score</th>
                    <th className="p-3">Result</th>
                    <th className="p-3">Validation Status / Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.rowsPreview.map((row: any) => (
                    <tr key={row.rowNumber} className={row.isValid ? "hover:bg-slate-50" : "bg-red-50/30"}>
                      <td className="p-3 font-mono font-bold text-slate-500">{row.rowNumber}</td>
                      <td className="p-3 font-mono font-bold text-slate-900">{row.studentExamId || "BLANK"}</td>
                      <td className="p-3 font-bold text-slate-900">{row.rawScore !== null ? row.rawScore : "N/A"}</td>
                      <td className="p-3">
                        {row.rawScore !== null && row.rawScore >= previewData.summary.passMark ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            PASSED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold text-[10px]">
                            FAILED
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {row.isValid ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                          </span>
                        ) : (
                          <div className="text-red-700 font-semibold space-y-0.5">
                            {row.errors.map((err: string, i: number) => (
                              <div key={i} className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-red-600 flex-shrink-0" />
                                <span>{err}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

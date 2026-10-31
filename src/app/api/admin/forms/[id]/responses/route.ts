import { NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { route, RequestError } from "@/lib/http";
import { queueSheet } from "@/lib/jobs/outbox";
import { formSheetTarget } from "@/lib/google/sheet-target";
import { spreadsheetId } from "@/lib/google/sheets-service";
import { submissionSheetIdentity, submissionSheetRow } from "@/lib/google/submission-row";
import { responseCsv } from "@/lib/forms/responses";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const GET = route(
  async (
    req,
    {
      params,
    }: {
      params: {
        id: string;
      };
    },
  ) => {
    const db = getDb(),
      form = db.customForms.find(
        (f) => f.id === params.id || f.slug === params.id,
      );
    if (!form) throw new RequestError("Form not found.", 404);
    const target = formSheetTarget(db.integrations, form);
    const submissions = db.formSubmissions
      .filter((s) => s.form_id === form.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((sub) => {
        const exports = target
          ? db.outbox.filter((job) => {
              if (
                job.type !== "sheet" ||
                job.status !== "sent" ||
                job.payload.sheetName !== target.sheet_name ||
                !(
                  job.payload.sourceId === sub.id ||
                  job.payload.rows?.some(
                    (row: any) => row.referenceNo === submissionSheetIdentity(sub).referenceNo,
                  )
                )
              )
                return false;
              try {
                return (
                  spreadsheetId(job.payload.sheetId) ===
                  spreadsheetId(target.sheet_id)
                );
              } catch {
                return false;
              }
            })
          : [];
        const latest = exports.reduce<(typeof exports)[number] | undefined>(
          (previous, job) =>
            !previous ||
            Date.parse(job.completed_at || job.created_at) >=
              Date.parse(previous.completed_at || previous.created_at)
              ? job
              : previous,
          undefined,
        );
        const currentEmail = db.students.find(
          (student) => student.id === sub.student_id,
        )?.email;
        return {
          ...sub,
          synced_to_sheet: Boolean(
            latest &&
            (!currentEmail ||
              latest.payload.rows?.some(
                (row: any) =>
                  row.referenceNo === submissionSheetIdentity(sub).referenceNo &&
                  String(row.email || "").toLowerCase() ===
                    currentEmail.toLowerCase(),
              )),
          ),
        };
      });
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        search: z.string().max(200).default(""),
        status: z.enum(["all", "pending", "synced"]).default("all"),
        from: z.string().date().optional(),
        to: z.string().date().optional(),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    const search = query.search.trim().toLowerCase();
    const responseDay = (timestamp: string) =>
      new Date(timestamp).toLocaleDateString("en-CA", {
        timeZone: "Asia/Colombo",
      });
    const filtered = submissions.filter(
      (sub) =>
        (!search ||
          sub.reference_no.toLowerCase().includes(search) ||
          Object.values(sub.data).some((value) =>
            String(value).toLowerCase().includes(search),
          )) &&
        (query.status === "all" ||
          sub.synced_to_sheet === (query.status === "synced")) &&
        (!query.from || responseDay(sub.created_at) >= query.from) &&
        (!query.to || responseDay(sub.created_at) <= query.to),
    );
    if (req.nextUrl.searchParams.get("export") === "csv")
      return new Response(responseCsv(form.fields, filtered), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="form-${form.id.replace(/[^\w-]/g, "")}-responses.csv"`,
          "Cache-Control": "no-store",
        },
      });
    const page = Math.min(
      query.page,
      Math.max(1, Math.ceil(filtered.length / query.pageSize)),
    );
    return NextResponse.json(
      {
        success: true,
        formTitle: form.title,
        fields: form.fields,
        googleSheetsConfig: target,
        googleFormConfig: form.google_form_config
          ? {
              enabled: form.google_form_config.enabled,
              response_mode: form.google_form_config.response_mode,
            }
          : undefined,
        total: filtered.length,
        page,
        pageSize: query.pageSize,
        stats: {
          total: submissions.length,
          synced: submissions.filter((sub) => sub.synced_to_sheet).length,
          emails: submissions.filter((sub) => sub.email_sent).length,
        },
        submissions: filtered.slice(
          (page - 1) * query.pageSize,
          page * query.pageSize,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  true,
);
export const POST = route(
  async (
    req,
    {
      params,
    }: {
      params: {
        id: string;
      };
    },
  ) => {
    const db = getDb(),
      form = db.customForms.find(
        (f) => f.id === params.id || f.slug === params.id,
      );
    if (!form) throw new RequestError("Form not found.", 404);
    const config = formSheetTarget(db.integrations, form);
    if (!config)
      throw new RequestError(
        "Configure the admissions spreadsheet in Google Integrations, or select a separate sheet in this form's Builder.",
      );
    const submissions = db.formSubmissions.filter((s) => s.form_id === form.id);
    const counts = { pending: 0, exported: 0, attention: 0 };
    for (const sub of submissions) {
      const student = db.students.find((s) => s.id === sub.student_id);
      const reg = db.registrations.find((r) => r.id === sub.registration_id);
      const app = db.applications.find((a) => a.id === sub.application_id);
      const row =
        student && reg
          ? submissionSheetRow(student, reg, app, sub)
          : {
              ...sub.data,
              ...submissionSheetIdentity(sub),
              createdAt: sub.created_at,
            };
      const job = queueSheet(
        db,
        config.sheet_id,
        config.sheet_name,
        row,
        sub.id,
      );
      if (job.status === "sent") counts.exported++;
      else if (["queued", "sending"].includes(job.status)) counts.pending++;
      else counts.attention++;
    }
    return NextResponse.json({
      success: true,
      queuedCount: counts.pending,
      ...counts,
      message: `${counts.pending} pending exports, ${counts.exported} previously exported, ${counts.attention} needing repair. See Email Center for provider status.`,
    });
  },
  true,
);

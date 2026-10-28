import { NextResponse } from "next/server";
import { getDb } from "@/lib/data/store";
import { route, RequestError } from "@/lib/http";
import type { ApplicationDetails } from "@/lib/admissions/application-review";

export const dynamic = "force-dynamic";

export const GET = route(
  async (_req, { params }: { params: { id: string } }) => {
    const db = getDb();
    const application = db.applications.find((app) => app.id === params.id);
    if (!application) throw new RequestError("Application not found.", 404);

    const submissions = db.formSubmissions
      .filter((submission) => submission.application_id === application.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((submission) => {
        const form = db.customForms.find(
          (item) => item.id === submission.form_id,
        );
        const labels = new Map(
          form?.fields.map((field) => [field.id, field.label]),
        );
        return {
          id: submission.id,
          formId: submission.form_id,
          formTitle: form?.title || "Submitted application form",
          createdAt: submission.created_at,
          answers: Object.entries(submission.data).map(([id, value]) => ({
            id,
            label: submission.field_labels?.[id] || labels.get(id) || id,
            value,
          })),
        };
      });

    const details: ApplicationDetails = { application, submissions };
    return NextResponse.json(
      { success: true, ...details },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  },
  true,
);

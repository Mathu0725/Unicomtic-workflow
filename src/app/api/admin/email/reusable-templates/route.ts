import { NextResponse } from "next/server";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { getSession } from "@/lib/security/session";
import { changeReusableTemplate, reusableTemplateAction, templateAllowedVariables } from "@/lib/email/reusable-templates";
import { workshopTemplateVariables } from "@/lib/workshops/confirmation";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const db = getDb();
  return NextResponse.json({ success: true, templates: db.customEmailTemplates.map(({ revisions, ...template }) => ({ ...template, revisionCount: revisions.length })), forms: db.customForms.map(form => ({ id: form.id, title: form.title, variables: templateAllowedVariables(db, form.id) })), commonVariables: templateAllowedVariables(db), workshopVariables: workshopTemplateVariables });
}, true);
export const POST = route(async req => {
  const parsed = reusableTemplateAction.safeParse(await req.json());
  if (!parsed.success) throw new RequestError("Check the template name, form, subject and HTML message.");
  const template = changeReusableTemplate(getDb(), parsed.data, getSession(req)!.email);
  return NextResponse.json({ success: true, id: template.id, version: template.version, message: "Template saved. Existing queued emails keep their previous content." });
}, true);

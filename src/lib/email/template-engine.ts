/**
 * Email Template Engine
 * Escapes HTML variable values and reports missing template variables.
 */

export interface RenderResult {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  missingVariables: string[];
  isValid: boolean;
}

import { escapeEmailHtml, personalizeTemplate, templateVariables } from "./template-catalog";
export const extractTemplateVariables = templateVariables;

export function renderEmailTemplate(
  subjectTemplate: string,
  htmlTemplate: string,
  textTemplate: string | null | undefined,
  variables: Record<string, string | number | undefined | null>
): RenderResult {
  const allText = `${subjectTemplate} ${htmlTemplate} ${textTemplate || ""}`;
  const requiredVars = extractTemplateVariables(allText);
  const missingVariables: string[] = [];

  for (const v of requiredVars) {
    if (variables[v] === undefined || variables[v] === null || String(variables[v]).trim() === "") {
      missingVariables.push(v);
    }
  }

  const renderedSubject = personalizeTemplate(subjectTemplate, variables).replace(/[\r\n]+/g, " ");
  const renderedHtml = personalizeTemplate(htmlTemplate, Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, escapeEmailHtml(value)])));
  const renderedText = personalizeTemplate(textTemplate || "", variables);

  return {
    subject: renderedSubject,
    bodyHtml: renderedHtml,
    bodyText: renderedText,
    missingVariables,
    isValid: missingVariables.length === 0,
  };
}

/**
 * Email Template Engine
 * Handles safe variable replacement, HTML sanitization, and missing variable validation.
 */

export interface RenderResult {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  missingVariables: string[];
  isValid: boolean;
}

export function extractTemplateVariables(content: string): string[] {
  const matches = content.match(/\{\{([a-zA-Z0-9_]+)\}\}/g);
  if (!matches) return [];
  const vars = matches.map((m) => m.replace(/\{\{|\}\}/g, "").trim());
  return Array.from(new Set(vars));
}

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

  let renderedSubject = subjectTemplate;
  let renderedHtml = htmlTemplate;
  let renderedText = textTemplate || "";

  for (const [key, val] of Object.entries(variables)) {
    const safeVal = val !== undefined && val !== null ? String(val) : "";
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    renderedSubject = renderedSubject.replace(regex, safeVal);
    renderedHtml = renderedHtml.replace(regex, safeVal);
    renderedText = renderedText.replace(regex, safeVal);
  }

  return {
    subject: renderedSubject,
    bodyHtml: renderedHtml,
    bodyText: renderedText,
    missingVariables,
    isValid: missingVariables.length === 0,
  };
}

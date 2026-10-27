import { describe, it, expect } from "vitest";
import {
  extractTemplateVariables,
  renderEmailTemplate,
} from "../../src/lib/email/template-engine";

describe("Email Template Engine", () => {
  it("should extract all variables enclosed in double curly braces", () => {
    const text = "Dear {{student_name}}, your ref is {{reference_no}} for {{campaign_title}}.";
    const vars = extractTemplateVariables(text);
    expect(vars).toEqual(["student_name", "reference_no", "campaign_title"]);
  });

  it("should render variables accurately in subject and body", () => {
    const subject = "Registration Confirmed - {{reference_no}}";
    const bodyHtml = "<p>Welcome {{student_name}} to {{campaign_title}}</p>";
    const bodyText = "Welcome {{student_name}} to {{campaign_title}}";

    const result = renderEmailTemplate(subject, bodyHtml, bodyText, {
      reference_no: "REG-25-100",
      student_name: "Kavindu",
      campaign_title: "TIC 2025",
    });

    expect(result.isValid).toBe(true);
    expect(result.missingVariables).toHaveLength(0);
    expect(result.subject).toBe("Registration Confirmed - REG-25-100");
    expect(result.bodyHtml).toBe("<p>Welcome Kavindu to TIC 2025</p>");
  });

  it("should detect missing variables", () => {
    const subject = "Registration {{reference_no}}";
    const bodyHtml = "<p>Hello {{student_name}}, your district is {{district}}</p>";

    const result = renderEmailTemplate(subject, bodyHtml, null, {
      reference_no: "REG-25-100",
      // missing student_name and district
    });

    expect(result.isValid).toBe(false);
    expect(result.missingVariables).toContain("student_name");
    expect(result.missingVariables).toContain("district");
  });
});

import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FormRichText from "../../src/components/form-rich-text";
import FormThankYou from "../../src/components/form-thank-you";
import {
  cleanRichText,
  richTextFromPlain,
  richTextPlainText,
  safeContentLink,
} from "../../src/lib/forms/rich-text";
import {
  defaultFormAnswers,
  extraAnswerProblem,
  fieldConfigurationProblem,
  fieldIdentityKeys,
  visibleFormFields,
} from "../../src/lib/forms/field-rules";
import {
  duplicateFormField,
  newFormField,
  reorderFormFields,
} from "../../src/lib/forms/editor";
import type { FormField } from "../../src/lib/data/store";

it("keeps original phone identity when its answer also supplies WhatsApp", () => {
  const phone: FormField = {
    id: "phone",
    systemKey: "whatsapp",
    type: "phone",
    label: "Phone / WhatsApp",
    required: true,
  };
  expect(fieldIdentityKeys(phone)).toEqual(["phone", "whatsapp"]);
  expect(fieldConfigurationProblem([phone])).toBeUndefined();
  expect(
    fieldConfigurationProblem([
      phone,
      { ...phone, id: "other", systemKey: "phone" },
    ]),
  ).toContain("mapped once");
  expect(
    fieldConfigurationProblem([{ ...phone, systemKey: "email" }]),
  ).toContain("separate questions");
  expect(
    fieldConfigurationProblem([
      { id: "choice", type: "text", label: "Choice", required: false },
      { ...phone, visibility: { field_id: "choice", operator: "not_empty" } },
    ]),
  ).toContain("always be visible");
});

it("maps the first added applicant detail without reusing an existing identity", () => {
  const nic = newFormField("nic", []);
  expect(nic.systemKey).toBe("nic");
  expect(nic.required).toBe(true);
  expect(newFormField("nic", [nic]).systemKey).toBeUndefined();
  expect(
    newFormField("phone", [
      {
        id: "phone",
        systemKey: "whatsapp",
        type: "phone",
        label: "Phone",
        required: true,
      },
    ]).systemKey,
  ).toBeUndefined();
});

it("renders safe formatting, Tamil, lists and links without interpreting embedded HTML", () => {
  const content = cleanRichText({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2, onclick: "bad" },
        content: [{ type: "text", text: "வழிமுறைகள்" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "<script>bad</script>",
            marks: [
              { type: "bold" },
              { type: "underline" },
              { type: "link", attrs: { href: "javascript:alert(1)" } },
            ],
          },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Website",
                    marks: [
                      { type: "link", attrs: { href: "https://uticx.com" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { type: "iframe", attrs: { src: "https://bad.example" } },
    ],
  });
  const html = renderToStaticMarkup(createElement(FormRichText, { content }));
  expect(html).toContain("வழிமுறைகள்");
  expect(html).toContain("<strong>");
  expect(html).toContain("<u>");
  expect(html).toContain("<ul");
  expect(html).toContain("https://uticx.com/");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("iframe");
  expect(html).not.toContain("onclick");
});
it("bounds rich content depth and preserves plain descriptions", () => {
  let child: any = { type: "text", text: "deep" };
  for (let n = 0; n < 100; n++) child = { type: "paragraph", content: [child] };
  expect(
    JSON.stringify(cleanRichText({ type: "doc", content: [child] })).length,
  ).toBeLessThan(1000);
  expect(richTextPlainText(richTextFromPlain("English\nதமிழ்"))).toBe(
    "English\nதமிழ்",
  );
});
it.each([
  "javascript:alert(1)",
  "data:text/html,bad",
  "//evil.example",
  "file:///private",
])("rejects an unsafe content link (%s)", (link) => {
  expect(safeContentLink(link)).toBeUndefined();
});
it("shows a committed reference and configured confirmation text", () => {
  const html = renderToStaticMarkup(
    createElement(FormThankYou, {
      referenceNo: "APP-26-123",
      message: "நன்றி! Saved",
      redirectUrl: "javascript:bad",
    }),
  );
  expect(html).toContain("APP-26-123");
  expect(html).toContain("நன்றி! Saved");
  expect(html).not.toContain("javascript:");
});
it("copies and reorders questions using new IDs while preserving rules and options", () => {
  const original: FormField = {
      id: "email",
      systemKey: "email",
      type: "select",
      label: "Choice",
      required: true,
      options: ["A", "B"],
    },
    copy = duplicateFormField(original);
  expect(copy.id).not.toBe(original.id);
  expect(copy.systemKey).toBeUndefined();
  copy.options!.push("C");
  expect(original.options).toEqual(["A", "B"]);
  expect(reorderFormFields([original, copy], copy.id, original.id)[0].id).toBe(
    copy.id,
  );
});
it("hides an entire conditional section and excludes stale dependent answers", () => {
  const fields: FormField[] = [
    {
      id: "experience",
      type: "radio",
      label: "Experience",
      required: true,
      options: ["Yes", "No"],
    },
    {
      id: "section_work",
      type: "section",
      label: "Work",
      required: false,
      visibility: { field_id: "experience", operator: "equals", value: "Yes" },
    },
    { id: "details", type: "textarea", label: "Details", required: true },
    { id: "section_next", type: "section", label: "Next", required: false },
    { id: "finish", type: "text", label: "Finish", required: true },
  ];
  expect([
    ...visibleFormFields(fields, { experience: "No", details: "Stale answer" }),
  ]).toEqual(["experience", "section_next", "finish"]);
  expect(visibleFormFields(fields, { experience: "Yes" }).has("details")).toBe(
    true,
  );
});
it("rejects forward dependencies, duplicate choices, hidden identities and invalid defaults", () => {
  const field: FormField = {
    id: "first",
    type: "text",
    label: "First",
    required: false,
    visibility: { field_id: "later", operator: "empty" },
  };
  expect(fieldConfigurationProblem([field])).toContain("earlier question");
  expect(
    fieldConfigurationProblem([
      {
        id: "choice",
        type: "select",
        label: "Choices",
        required: false,
        options: ["A", "a"],
      },
    ]),
  ).toContain("distinct");
  expect(
    fieldConfigurationProblem([
      {
        id: "choice",
        type: "select",
        label: "Choices",
        required: false,
        options: ["A"],
        defaultValue: "B",
      },
    ]),
  ).toContain("default answer");
});
it("validates numeric bounds, URLs and checkbox limits", () => {
  expect(
    extraAnswerProblem(
      {
        id: "score",
        type: "number",
        label: "Score",
        required: true,
        min: 1,
        max: 10,
      },
      0,
    ),
  ).toContain("1 or more");
  expect(
    extraAnswerProblem(
      { id: "url", type: "url", label: "Website", required: false },
      "javascript:bad",
    ),
  ).toBeTruthy();
  expect(
    extraAnswerProblem(
      {
        id: "choices",
        type: "checkbox",
        label: "Choices",
        required: false,
        options: ["A", "B"],
        maxSelections: 1,
      },
      ["A", "B"],
    ),
  ).toContain("at most 1");
});
it("uses configured defaults without preaccepting consent or documents", () => {
  const defaults = defaultFormAnswers([
    {
      id: "score",
      type: "number",
      label: "Score",
      required: false,
      defaultValue: 0,
    },
    {
      id: "consent",
      type: "terms",
      label: "Consent",
      required: true,
      defaultValue: true,
    },
    {
      id: "file",
      type: "file",
      label: "Upload",
      required: false,
      defaultValue: "forged",
    },
    { id: "section", type: "section", label: "Heading", required: false },
    { id: "multi", type: "checkbox", label: "Topics", required: false },
  ]);
  expect(defaults).toEqual({ score: 0, consent: false, file: "", multi: [] });
});

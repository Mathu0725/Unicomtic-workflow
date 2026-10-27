import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { PATCH, GET as readAdminForm } from "../../src/app/api/admin/forms/[id]/route";
import { POST as createForm } from "../../src/app/api/admin/forms/route";
import { GET as readPublicForm } from "../../src/app/api/forms/[slug]/route";
import { transaction, readDatabase } from "../../src/lib/data/repository";
import { signSession, SESSION_COOKIE } from "../../src/lib/security/session";
import { defaultFormMessageDisplay, defaultFormMessages, formMessageFields, resolveFormMessageDisplay, resolveFormMessages } from "../../src/lib/forms/messages";
import FormInstructions from "../../src/components/form-instructions";
import FormSubmitMessages from "../../src/components/form-submit-messages";

let directory: string;
const id = "form-reg-2025";
const form = async (formId = id) => (await readDatabase()).customForms.find(form => form.id === formId)!;
function request(body?: unknown, role: string | undefined = "super_admin", url = `/api/admin/forms/${id}`, method = body === undefined ? "GET" : "PATCH") {
  return new NextRequest(`http://localhost${url}`, { method, headers: { ...(role ? { Cookie: `${SESSION_COOKIE}=${signSession({ email: "messages-admin@example.com", name: "Messages editor", role })}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function save(messages: unknown, formId = id, expectedUpdatedAt?: string) {
  return PATCH(request({ messages, expectedUpdatedAt: expectedUpdatedAt ?? (await form(formId)).updated_at }, "super_admin", `/api/admin/forms/${formId}`), { params: { id: formId } });
}
async function saveDisplay(message_display: unknown, formId = id, expectedUpdatedAt?: string) {
  return PATCH(request({ message_display, expectedUpdatedAt: expectedUpdatedAt ?? (await form(formId)).updated_at }, "super_admin", `/api/admin/forms/${formId}`), { params: { id: formId } });
}
async function publicCopy(formId = id) {
  const current = await form(formId);
  const response = await readPublicForm(request(undefined, undefined, `/api/forms/${current.slug}`), { params: { slug: current.slug } });
  expect(response.status).toBe(200); return (await response.json()).form;
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tic-form-messages-"));
  vi.stubEnv("DATA_DIR", directory); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mock.supabase.co"); vi.stubEnv("SEED_DEMO_DATA", "false"); vi.stubEnv("APP_SECRET", "messages-test-secret-at-least-32-characters");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await transaction(() => {});
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

it("provides the existing message defaults for old forms without changing saved records", async () => {
  const before = await readDatabase();
  expect(before.customForms[0].messages).toBeUndefined();
  expect((await publicCopy()).messages).toEqual(defaultFormMessages);
  expect(before.customForms[0].message_display).toBeUndefined();
  expect((await publicCopy()).message_display).toEqual(defaultFormMessageDisplay);
  expect(await readDatabase()).toEqual(before);
});

it("persists different English and Tamil messages for each form without changing responses or notification jobs", async () => {
  const before = await readDatabase();
  const registration = { popupTitle: "Registration instructions", submitEnglish: "Press Register below.", submitTamil: "கீழே உள்ள பதிவு பொத்தானை அழுத்தவும்.", autoSaveMessage: "உங்கள் தகவல் தானாகச் சேமிக்கப்படும்.", submitButtonLabel: "Register / பதிவு" };
  const application = { popupTitle: "Application instructions", submitEnglish: "Complete your application.", submitTamil: "விண்ணப்பத்தை பூர்த்தி செய்யவும்.", autoSaveMessage: "Application draft saved on this device." };
  expect((await save(registration)).status).toBe(200);
  expect((await save(application, "form-app-2025")).status).toBe(200);
  const admin = await readAdminForm(request(), { params: Promise.resolve({ id }) });
  expect((await admin.json()).form.messages).toMatchObject(registration);
  expect((await publicCopy()).messages).toMatchObject(registration);
  expect((await publicCopy("form-app-2025")).messages).toMatchObject(application);
  const after = await readDatabase(); expect(after.formSubmissions).toEqual(before.formSubmissions); expect(after.outbox).toEqual(before.outbox); expect(after.registrations).toEqual(before.registrations);
});

it.each(["", "examiner", "entrance_staff"])("rejects message changes from an unauthorized user (%s)", async role => {
  const response = await PATCH(request({ messages: { popupTitle: "Unauthorized" }, message_display: { popup_enabled: false, bottom_messages_enabled: false }, expectedUpdatedAt: (await form()).updated_at }, role), { params: { id } });
  expect(response.status).toBe(role ? 403 : 401); expect((await form()).messages).toBeUndefined();
  expect((await form()).message_display).toBeUndefined();
});

it.each([
  { popup_enabled: true, bottom_messages_enabled: true },
  { popup_enabled: false, bottom_messages_enabled: true },
  { popup_enabled: true, bottom_messages_enabled: false },
  { popup_enabled: false, bottom_messages_enabled: false },
])("persists and renders independent per-form visibility switches (%j)", async display => {
  const before = await readDatabase();
  await save({ popupTitle: "Saved popup", submitEnglish: "Saved English instructions", submitTamil: "சேமிக்கப்பட்ட தமிழ் வழிமுறைகள்", autoSaveMessage: "Saved draft notice" });
  expect((await saveDisplay(display)).status).toBe(200);
  const publicForm = await publicCopy();
  expect(publicForm.message_display).toEqual(display);
  expect((await form()).message_display).toEqual(display);
  const admin = await readAdminForm(request(), { params: { id } });
  expect((await admin.json()).form.message_display).toEqual(display);
  const popup = renderToStaticMarkup(createElement(FormInstructions, { messages: publicForm.messages, enabled: publicForm.message_display.popup_enabled }));
  const footer = renderToStaticMarkup(createElement(FormSubmitMessages, { messages: publicForm.messages, enabled: publicForm.message_display.bottom_messages_enabled }));
  if (display.popup_enabled) expect(popup).toContain("Saved popup");
  else expect(popup).toBe("");
  if (display.bottom_messages_enabled) {
    for (const text of ["Saved English instructions", "சேமிக்கப்பட்ட தமிழ் வழிமுறைகள்", "Saved draft notice"]) expect(footer).toContain(text);
  } else expect(footer).toBe("");
  expect((await publicCopy("form-app-2025")).message_display).toEqual(defaultFormMessageDisplay);
  const after = await readDatabase();
  expect(after.formSubmissions).toEqual(before.formSubmissions); expect(after.outbox).toEqual(before.outbox); expect(after.registrations).toEqual(before.registrations);
});

it("retains all wording while disabling and reenabling messages and merges partial visibility changes", async () => {
  await save({ popupTitle: "Keep this popup", submitEnglish: "Keep these instructions", submitTamil: "தமிழை வைத்திருக்கவும்", viewInstructionsLabel: "", autoSaveMessage: "Keep this draft notice" });
  const saved = (await publicCopy()).messages;
  await saveDisplay({ popup_enabled: false, bottom_messages_enabled: false });
  expect((await publicCopy()).messages).toEqual(saved);
  await save({ popupTitle: "Edited while disabled" });
  expect((await publicCopy()).message_display).toEqual({ popup_enabled: false, bottom_messages_enabled: false });
  await saveDisplay({ popup_enabled: true });
  expect((await publicCopy()).message_display).toEqual({ popup_enabled: true, bottom_messages_enabled: false });
  await saveDisplay({ bottom_messages_enabled: true });
  const restored = await publicCopy();
  expect(restored.message_display).toEqual(defaultFormMessageDisplay);
  expect(restored.messages).toEqual({ ...saved, popupTitle: "Edited while disabled" });
});

it.each([
  { popup_enabled: "false" }, { bottom_messages_enabled: 0 }, { popup_enabled: null },
  { unknownSwitch: false }, null, [],
])("rejects invalid display settings without changing the form (%j)", async display => {
  const before = await form();
  expect((await saveDisplay(display)).status).toBe(400);
  expect(await form()).toEqual(before);
});

it("requires a current version for visibility-only saves and rejects stale switches", async () => {
  const previous = (await form()).updated_at;
  expect((await PATCH(request({ message_display: { popup_enabled: false } }), { params: { id } })).status).toBe(409);
  expect((await form()).message_display).toBeUndefined();
  expect((await saveDisplay({ popup_enabled: false })).status).toBe(200);
  const stale = await saveDisplay({ bottom_messages_enabled: false }, id, previous);
  expect(stale.status).toBe(409); expect((await stale.json()).code).toBe("VERSION_CONFLICT");
  expect((await publicCopy()).message_display).toEqual({ popup_enabled: false, bottom_messages_enabled: true });
});

it("merges partial message updates and retains explicitly hidden optional text", async () => {
  await save({ submitEnglish: "Saved directions", submitTamil: "தமிழ் வழிமுறைகள்", popupNotes: "One\n\nTwo" });
  await save({ submitTamil: "", autoSaveMessage: "" });
  const copy = (await publicCopy()).messages;
  expect(copy.submitEnglish).toBe("Saved directions"); expect(copy.popupNotes).toBe("One\n\nTwo"); expect(copy.submitTamil).toBe(""); expect(copy.autoSaveMessage).toBe("");
  const html = renderToStaticMarkup(createElement(FormSubmitMessages, { messages: copy }));
  expect(html).toContain("Saved directions"); expect(html).not.toContain(defaultFormMessages.autoSaveMessage); expect(html).not.toContain('lang="ta"');
});

it.each(["", "   "])("saves an optional empty instructions button label and keeps the popup preview usable (%j)", async label => {
  expect(formMessageFields.find(field => field.key === "viewInstructionsLabel")?.required).not.toBe(true);
  expect((await save({ viewInstructionsLabel: label })).status).toBe(200);
  const messages = (await publicCopy()).messages;
  expect(messages.viewInstructionsLabel).toBe("");
  expect((await form()).messages?.viewInstructionsLabel).toBe("");
  const popup = renderToStaticMarkup(createElement(FormInstructions, { messages }));
  expect(popup).not.toContain("View instructions");
  expect(popup).toContain('aria-label="Close instructions"');
  expect(popup).toContain(defaultFormMessages.continueButtonLabel);
  const preview = renderToStaticMarkup(createElement(FormInstructions, { messages, autoOpen: false, triggerLabel: "Preview popup" }));
  expect(preview).toContain("Preview popup");
});

it.each([
  { popupTitle: "" }, { popupTitle: "a".repeat(161) }, { submitEnglish: "a".repeat(1501) }, { popupNotes: "a".repeat(8001) },
  { submitButtonLabel: " " }, { viewInstructionsLabel: "a".repeat(101) }, { continueButtonLabel: "" }, { unknownSetting: "ignored?" },
])("rejects invalid message content without saving it (%j)", async messages => {
  expect((await save(messages)).status).toBe(400); expect((await form()).messages).toBeUndefined();
});

it("requires the latest form version and preserves another administrator's saved messages", async () => {
  const previous = (await form()).updated_at;
  const unversioned = await PATCH(request({ messages: { popupTitle: "No version" } }), { params: { id } });
  expect(unversioned.status).toBe(409);
  expect((await save({ popupTitle: "Latest instructions" })).status).toBe(200);
  const stale = await save({ popupTitle: "Stale instructions" }, id, previous);
  expect(stale.status).toBe(409); expect((await stale.json()).code).toBe("VERSION_CONFLICT"); expect((await publicCopy()).messages.popupTitle).toBe("Latest instructions");
});

it("copies custom messages when duplicating a form and keeps later edits independent", async () => {
  await save({ popupTitle: "Original custom title", autoSaveMessage: "Original draft notice" });
  await saveDisplay({ popup_enabled: false, bottom_messages_enabled: false });
  const duplicated = await createForm(request({ action: "duplicate", formId: id }, "super_admin", "/api/admin/forms", "POST"), undefined);
  expect(duplicated.status).toBe(200); const copy = (await duplicated.json()).form;
  expect(copy.messages.popupTitle).toBe("Original custom title");
  expect(copy.message_display).toEqual({ popup_enabled: false, bottom_messages_enabled: false });
  await save({ popupTitle: "Copied form only" }, copy.id);
  await saveDisplay({ popup_enabled: true }, copy.id);
  expect((await publicCopy(copy.id)).messages.popupTitle).toBe("Copied form only"); expect((await publicCopy()).messages.popupTitle).toBe("Original custom title");
  expect((await publicCopy(copy.id)).message_display).toEqual({ popup_enabled: true, bottom_messages_enabled: false });
  expect((await publicCopy()).message_display).toEqual({ popup_enabled: false, bottom_messages_enabled: false });
});

it("renders the saved directions in both the popup and footer and escapes markup", () => {
  const messages = { popupTitle: "Custom popup", submitEnglish: "Press Register now", submitTamil: "பதிவு செய்யவும்", popupNotes: "First instruction\n\n<script>alert('test')</script>", autoSaveMessage: "Custom draft notice", continueButtonLabel: "Proceed / தொடரவும்" };
  const popup = renderToStaticMarkup(createElement(FormInstructions, { messages, autoOpen: false, triggerLabel: "Preview popup" }));
  const footer = renderToStaticMarkup(createElement(FormSubmitMessages, { messages }));
  for (const text of [messages.submitEnglish, messages.submitTamil]) { expect(popup).toContain(text); expect(footer).toContain(text); }
  expect(popup).toContain(messages.popupTitle); expect(popup).toContain(messages.continueButtonLabel); expect(popup).toContain("&lt;script&gt;"); expect(popup).not.toContain("<script>"); expect(footer).toContain(messages.autoSaveMessage);
});

it("resolves defaults independently for each form", () => {
  const first = resolveFormMessages({ popupTitle: "First" }); first.submitEnglish = "Changed locally";
  const second = resolveFormMessages(); expect(second.popupTitle).toBe(defaultFormMessages.popupTitle); expect(second.submitEnglish).toBe(defaultFormMessages.submitEnglish);
  const display = resolveFormMessageDisplay({ popup_enabled: false }); display.bottom_messages_enabled = false;
  expect(resolveFormMessageDisplay()).toEqual({ popup_enabled: true, bottom_messages_enabled: true });
  expect(resolveFormMessageDisplay({ popup_enabled: false })).toEqual({ popup_enabled: false, bottom_messages_enabled: true });
});

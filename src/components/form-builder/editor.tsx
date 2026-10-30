"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Eye,
  GripVertical,
  Loader2,
  Plus,
  Redo2,
  Search,
  Settings2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useFormEditor } from "@/lib/client/use-form-editor";
import { api } from "@/lib/client/api";
import {
  duplicateFormField,
  editorValues,
  fieldLibrary,
  newFormField,
  reorderFormFields,
} from "@/lib/forms/editor";
import { fieldConfigurationProblem } from "@/lib/forms/field-rules";
import { formEditableSchema } from "@/lib/validations/forms";
import { formSlugProblem } from "@/lib/forms/public-links";
import { resolveFormMessages } from "@/lib/forms/messages";
import type { FormField, Workshop } from "@/lib/data/store";
import FormQuestion from "@/components/form-question";
import FormRichText from "@/components/form-rich-text";
import FieldSettings from "./field-settings";
import FormSettings, { FormContentSettings } from "./form-settings";
import FormIntegrations from "./integrations";
import FormPreview from "./preview";
import { buttonClass, inputClass } from "./controls";

export default function FormBuilderEditor({ id }: { id: string }) {
  const editor = useFormEditor(id),
    { form, values, change } = editor;
  const [mode, setMode] = useState("build"),
    [panel, setPanel] = useState("canvas"),
    [section, setSection] = useState("general");
  const [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [preview, setPreview] = useState(false),
    [notice, setNotice] = useState(""),
    [workshops, setWorkshops] = useState<Workshop[]>([]),
    [resourceError, setResourceError] = useState(""),
    [workshopsLoaded, setWorkshopsLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api("/api/admin/workshops?summary=1", undefined, "GET", controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setWorkshops(result.workshops);
          setWorkshopsLoaded(true);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResourceError(error.message);
      });
    return () => controller.abort();
  }, [id]);
  if (editor.loading)
    return (
      <div
        role="status"
        className="flex min-h-80 items-center justify-center gap-3 text-sm text-slate-500"
      >
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        Loading form editor…
      </div>
    );
  if (!form || !values)
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-8">
        <h1 className="text-lg font-bold">The form could not be loaded</h1>
        <p role="alert" className="text-sm text-red-700">
          {editor.error}
        </p>
        <button className={buttonClass} onClick={() => void editor.reload()}>
          Try again
        </button>
        <Link href="/admin/forms" className="ml-3 text-sm text-blue-700">
          Return to forms
        </Link>
      </div>
    );
  const field = values.fields.find((field) => field.id === selected),
    index = values.fields.findIndex((field) => field.id === selected);
  const unpublished =
    JSON.stringify(editorValues(form)) !== JSON.stringify(values);
  const fieldProblem = fieldConfigurationProblem(values.fields),
    busy = editor.publishing;
  const status = form.status || (form.is_active ? "published" : "closed");
  const selectField = (id: string | null) => {
    setSelected(id);
    setPanel("settings");
  };
  const updateField = (patch: Partial<FormField>, group = "") =>
    change(
      (current) => ({
        ...current,
        fields: current.fields.map((item) =>
          item.id === selected ? { ...item, ...patch } : item,
        ),
      }),
      group ? `${selected}-${group}` : "",
    );
  const addField = (type: FormField["type"], target?: string) => {
    if (values.fields.length >= 100) {
      setNotice("Use at most 100 questions per form.");
      return;
    }
    const next = newFormField(type, values.fields),
      fields = [...values.fields],
      at = target ? fields.findIndex((field) => field.id === target) : index;
    fields.splice(at >= 0 ? at + 1 : fields.length, 0, next);
    change({ fields });
    setSelected(next.id);
    setPanel("settings");
    setNotice(`${next.label} added.`);
  };
  const drop = (event: React.DragEvent, target: string) => {
    event.preventDefault();
    event.stopPropagation();
    const source = event.dataTransfer.getData("application/x-tic-question"),
      type = event.dataTransfer.getData("application/x-tic-field-type");
    if (source)
      change({ fields: reorderFormFields(values.fields, source, target) });
    else if (fieldLibrary.some((item) => item.type === type))
      addField(type as FormField["type"], target);
  };
  const publish = async () => {
    setNotice("");
    const parsed = formEditableSchema.safeParse(values),
      problem = formSlugProblem(values.slug) || fieldProblem;
    if (problem || !parsed.success) {
      setNotice(
        problem ||
          (!parsed.success
            ? `${parsed.error.issues[0].path.join(" → ")}: ${parsed.error.issues[0].message}`
            : "Review the form settings."),
      );
      return;
    }
    const changedQuestions = form.fields.some(
      (old) =>
        !values.fields.some(
          (next) => next.id === old.id && next.type === old.type,
        ),
    );
    if (
      form.submissions_count > 0 &&
      (changedQuestions || values.status !== "published") &&
      !window.confirm(
        "This form already has responses. Existing answers will be kept. Apply these changes to the public form?",
      )
    )
      return;
    if (await editor.publish())
      setNotice("Form updated. The saved public link is ready.");
  };
  return (
    <div className="-m-3 sm:-m-5">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin/forms"
              aria-label="Back to forms"
              className={buttonClass}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1
                className="max-w-md truncate text-base font-bold text-slate-900"
                title={values.title}
              >
                {values.title || "Untitled form"}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold capitalize ${status === "published" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                >
                  {status}
                </span>
                <span
                  role="status"
                  aria-live="polite"
                  className={editor.error ? "text-red-700" : "text-slate-500"}
                >
                  {editor.publishing
                    ? "Publishing…"
                    : editor.saving
                      ? "Saving draft…"
                      : editor.error
                        ? "Save needs attention"
                        : editor.dirty
                          ? "Unsaved changes"
                          : editor.savedAt
                            ? "Draft saved"
                            : "All changes saved"}
                </span>
                {unpublished && (
                  <span className="text-amber-700">Unpublished changes</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              <button
                type="button"
                title="Undo"
                aria-label="Undo"
                disabled={!editor.canUndo || busy}
                className={buttonClass}
                onClick={editor.undo}
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Redo"
                aria-label="Redo"
                disabled={!editor.canRedo || busy}
                className={buttonClass}
                onClick={editor.redo}
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setPreview(true)}
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40"
              disabled={
                busy ||
                editor.saving ||
                editor.conflict ||
                (!unpublished && status !== "draft")
              }
              onClick={() => void publish()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {status === "draft" ? "Publish form" : "Update form"}
            </button>
            <details className="relative">
              <summary
                className={`${buttonClass} cursor-pointer list-none`}
                aria-label="More form actions"
              >
                •••
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-56 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <Link
                  href={`/form/${form.slug}`}
                  target="_blank"
                  className="flex items-center gap-2 rounded-lg p-2 text-xs hover:bg-slate-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open published form
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${location.origin}/form/${form.slug}`,
                      );
                      setNotice("Published form link copied.");
                    } catch {
                      setNotice(
                        `Copy this link: ${location.origin}/form/${form.slug}`,
                      );
                    }
                  }}
                  className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy published link
                </button>
                <Link
                  href={`/admin/forms/${form.id}/responses`}
                  className="block rounded-lg p-2 text-xs hover:bg-slate-50"
                >
                  View {form.submissions_count} responses
                </Link>
                <button
                  type="button"
                  disabled={editor.saving || busy || editor.conflict}
                  onClick={() => void editor.saveDraft()}
                  className="block w-full rounded-lg p-2 text-left text-xs hover:bg-slate-50"
                >
                  Save draft now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Discard your editor draft and load the published form?",
                      )
                    )
                      void editor.discard();
                  }}
                  className="block w-full rounded-lg p-2 text-left text-xs text-red-700 hover:bg-red-50"
                >
                  Discard editor draft
                </button>
              </div>
            </details>
          </div>
        </div>
        <nav aria-label="Form editor" className="mt-3 flex gap-1">
          {[
            ["build", "Build"],
            ["settings", "Settings"],
            ["integrations", "Integrations"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-current={mode === value ? "page" : undefined}
              onClick={() => setMode(value)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === value ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="space-y-4 p-3 sm:p-5">
        {(editor.error || notice || fieldProblem) && (
          <div
            role={editor.error || fieldProblem ? "alert" : "status"}
            className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3 text-sm ${editor.error ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-900"}`}
          >
            <p>{editor.error || fieldProblem || notice}</p>
            {editor.error && (
              <div className="flex gap-3 text-xs font-semibold">
                {!editor.conflict && (
                  <button
                    type="button"
                    disabled={editor.saving}
                    onClick={() => void editor.saveDraft()}
                  >
                    Retry save
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !editor.dirty ||
                      window.confirm(
                        "Replace your local edits with the latest saved draft?",
                      )
                    )
                      void editor.reload();
                  }}
                >
                  Reload latest
                </button>
              </div>
            )}
          </div>
        )}
        <fieldset disabled={busy} className="min-w-0">
          {mode === "build" && (
            <>
              <nav
                aria-label="Editor panels"
                className="mb-4 flex rounded-xl border border-slate-200 bg-white p-1 xl:hidden"
              >
                {[
                  ["library", "Add fields"],
                  ["canvas", "Form canvas"],
                  ["settings", "Settings"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={panel === value}
                    onClick={() => setPanel(value)}
                    className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold ${panel === value ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="grid items-start gap-4 xl:grid-cols-[170px_minmax(0,1fr)_280px] 2xl:grid-cols-[190px_minmax(0,1fr)_300px]">
                <aside
                  aria-label="Field library"
                  className={`${panel === "library" ? "block" : "hidden"} rounded-2xl border border-slate-200 bg-white p-3 xl:sticky xl:top-32 xl:block xl:max-h-[calc(100dvh-160px)] xl:overflow-y-auto`}
                >
                  <h2 className="text-sm font-bold text-slate-900">
                    Add fields
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Click or drag onto the form.
                  </p>
                  <div className="relative mt-3">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      aria-label="Search field types"
                      placeholder="Find a field"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className={`${inputClass} mt-0 pl-8 text-xs`}
                    />
                  </div>
                  {["Questions", "Applicant details", "More fields"].map(
                    (group) => (
                      <details
                        key={group}
                        open={Boolean(search) || group !== "More fields"}
                        className="mt-4"
                      >
                        <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {group}
                        </summary>
                        <div className="mt-2 space-y-1">
                          {fieldLibrary
                            .filter(
                              (item) =>
                                item.group === group &&
                                item.label
                                  .toLowerCase()
                                  .includes(search.toLowerCase()),
                            )
                            .map((item) => (
                              <button
                                key={item.type}
                                type="button"
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.setData(
                                    "application/x-tic-field-type",
                                    item.type,
                                  );
                                  event.dataTransfer.effectAllowed = "copy";
                                }}
                                onClick={() => addField(item.type)}
                                className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                              >
                                <Plus className="h-3 w-3 shrink-0 text-slate-400" />
                                {item.label}
                              </button>
                            ))}
                        </div>
                      </details>
                    ),
                  )}
                  <button
                    type="button"
                    className="mt-4 w-full rounded-lg border border-blue-200 p-3 text-left text-xs font-semibold text-blue-700"
                    onClick={() => {
                      setMode("settings");
                      setSection("workshops");
                    }}
                  >
                    Built-in block · Workshop selection
                  </button>
                </aside>
                <section
                  aria-label="Form canvas"
                  className={`${panel === "canvas" ? "block" : "hidden"} min-w-0 xl:block`}
                >
                  <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {
                        values.fields.filter(
                          (field) => field.type !== "section",
                        ).length
                      }{" "}
                      questions
                    </span>
                    <span>Click a question to edit</span>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div
                      onClick={() => selectField(null)}
                      className={`w-full bg-[#4d4d4d] p-5 text-left text-white ${selected === null ? "ring-2 ring-inset ring-blue-400" : ""}`}
                    >
                      <p className="text-[10px] font-semibold tracking-wide text-neutral-200">
                        UNICOM TIC PORTAL
                      </p>
                      <h2 className="mt-2 text-xl font-bold">
                        {values.title || "Untitled form"}
                      </h2>
                      {values.description_rich ? (
                        <FormRichText
                          content={values.description_rich}
                          interactive={false}
                          className="mt-3 text-xs text-neutral-100"
                        />
                      ) : (
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-200">
                          {values.description}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => selectField(null)}
                        className="mt-4 text-xs font-semibold text-blue-200 underline underline-offset-4"
                      >
                        Edit title & description
                      </button>
                    </div>
                    <div
                      className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) =>
                        drop(event, values.fields.at(-1)?.id || "")
                      }
                    >
                      {values.fields.map((item, at) => (
                        <article
                          key={item.id}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => drop(event, item.id)}
                          className={`min-w-0 rounded-xl border p-3 ${item.width === "half" && item.type !== "section" ? "" : "sm:col-span-2"} ${selected === item.id ? "border-blue-400 bg-blue-50/20 ring-1 ring-blue-100" : "border-transparent hover:border-slate-200"}`}
                        >
                          <div className="mb-3 flex items-center justify-between gap-1">
                            <button
                              type="button"
                              aria-label={`Edit ${item.label}`}
                              onClick={() => selectField(item.id)}
                              className="min-w-0 truncate text-[10px] font-semibold text-slate-400"
                            >
                              {at + 1}. {item.type}
                              {item.visibility ? " · Conditional" : ""}
                            </button>
                            <div className="flex items-center">
                              <button
                                type="button"
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.setData(
                                    "application/x-tic-question",
                                    item.id,
                                  );
                                  event.dataTransfer.effectAllowed = "move";
                                }}
                                aria-label={`Drag ${item.label} to reorder`}
                                className="cursor-grab p-1 text-slate-400"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Move ${item.label} up`}
                                disabled={at === 0}
                                className="p-1 text-slate-400 hover:text-blue-700 disabled:opacity-20"
                                onClick={() =>
                                  change({
                                    fields: reorderFormFields(
                                      values.fields,
                                      item.id,
                                      values.fields[at - 1].id,
                                    ),
                                  })
                                }
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Move ${item.label} down`}
                                disabled={at === values.fields.length - 1}
                                className="p-1 text-slate-400 hover:text-blue-700 disabled:opacity-20"
                                onClick={() =>
                                  change({
                                    fields: reorderFormFields(
                                      values.fields,
                                      item.id,
                                      values.fields[at + 1].id,
                                    ),
                                  })
                                }
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Duplicate ${item.label}`}
                                className="p-1 text-slate-400 hover:text-blue-700"
                                onClick={() => {
                                  const copy = duplicateFormField(item),
                                    fields = [...values.fields];
                                  fields.splice(at + 1, 0, copy);
                                  change({ fields });
                                  selectField(copy.id);
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${item.label}`}
                                className="p-1 text-slate-400 hover:text-red-700"
                                onClick={() => {
                                  change({
                                    fields: values.fields.filter(
                                      (field) => field.id !== item.id,
                                    ),
                                  });
                                  if (selected === item.id) setSelected(null);
                                  setNotice(
                                    "Question removed. Use Undo to restore it. Existing submitted answers are kept.",
                                  );
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div
                            onClick={() => selectField(item.id)}
                            className="cursor-pointer"
                          >
                            <div className="pointer-events-none">
                              <FormQuestion
                                field={item}
                                value={item.defaultValue}
                                onChange={() => {}}
                                disabled
                              />
                            </div>
                          </div>
                        </article>
                      ))}
                      {!values.fields.length && (
                        <div className="rounded-xl border-2 border-dashed border-slate-200 p-10 text-center text-sm text-slate-400 sm:col-span-2">
                          Add your first question from the field library.
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setPanel("library");
                          document
                            .querySelector<HTMLElement>(
                              '[aria-label="Search field types"]',
                            )
                            ?.focus();
                        }}
                        className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs font-semibold text-blue-700 sm:col-span-2"
                      >
                        + Add a question
                      </button>
                    </div>
                    <div className="border-t border-slate-100 p-5">
                      <div className="rounded-xl bg-[#4d4d4d] p-3 text-center text-sm font-bold text-white">
                        {resolveFormMessages(values.messages).submitButtonLabel}
                      </div>
                    </div>
                  </div>
                </section>
                <aside
                  aria-label="Contextual settings"
                  className={`${panel === "settings" ? "block" : "hidden"} min-w-0 rounded-2xl border border-slate-200 bg-white p-4 xl:sticky xl:top-32 xl:block xl:max-h-[calc(100dvh-160px)] xl:overflow-y-auto`}
                >
                  <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-3">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <Settings2 className="h-4 w-4 text-slate-400" />
                      {field ? "Question settings" : "Form content"}
                    </h2>
                    {field && (
                      <button
                        type="button"
                        aria-label="Show form settings"
                        onClick={() => setSelected(null)}
                        className="p-1 text-slate-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {field ? (
                    <FieldSettings
                      key={field.id}
                      field={field}
                      fields={values.fields}
                      onChange={updateField}
                    />
                  ) : (
                    <>
                      <FormContentSettings values={values} onChange={change} />
                      <button
                        type="button"
                        className={`${buttonClass} mt-5 w-full`}
                        onClick={() => {
                          setMode("settings");
                          setSection("general");
                        }}
                      >
                        More form settings
                      </button>
                    </>
                  )}
                </aside>
              </div>
            </>
          )}
          {mode === "settings" && (
            <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[170px_minmax(0,1fr)]">
              <nav
                aria-label="Form settings sections"
                className="flex flex-wrap gap-1 self-start rounded-xl border border-slate-200 bg-white p-2 md:sticky md:top-32 md:flex-col"
              >
                {[
                  ["general", "General"],
                  ["messages", "Messages & popup"],
                  ["confirmation", "After submission"],
                  ["email", "Email notifications"],
                  ["workshops", "Workshops"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-current={section === value ? "page" : undefined}
                    className={`rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${section === value ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}
                    onClick={() => setSection(value)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div>
                {resourceError && section === "workshops" && (
                  <p role="alert" className="mb-4 text-sm text-red-700">
                    Workshop choices could not be loaded: {resourceError}
                  </p>
                )}
                {section === "workshops" &&
                  !workshopsLoaded &&
                  !resourceError && (
                    <p role="status">Loading workshop choices…</p>
                  )}
                {(section !== "workshops" || workshopsLoaded) && (
                  <FormSettings
                    form={form}
                    values={values}
                    onChange={change}
                    section={section}
                    workshops={workshops}
                    onWorkshopCreated={(workshop) =>
                      setWorkshops((current) => [
                        ...current.filter((w) => w.id !== workshop.id),
                        workshop,
                      ])
                    }
                  />
                )}
              </div>
            </div>
          )}
          {mode === "integrations" && (
            <FormIntegrations
              form={form}
              values={values}
              onChange={change}
              saved={!unpublished}
            />
          )}
        </fieldset>
      </div>
      {preview && (
        <FormPreview
          values={values}
          workshops={workshops}
          campaignId={form.campaign_id}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}

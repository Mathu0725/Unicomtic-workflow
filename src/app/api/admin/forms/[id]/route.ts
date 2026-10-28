import { NextResponse } from "next/server";
import { z } from "zod";
import { route, RequestError } from "@/lib/http";
import { getDb } from "@/lib/data/store";
import { formDraftSchema, formEditableSchema } from "@/lib/validations/forms";
import { audit } from "@/lib/admissions/service";
import { formLinkTaken } from "@/lib/forms/public-links";
import { editorValues } from "@/lib/forms/editor";
import { fieldIdentityKeys, identityKeys } from "@/lib/forms/field-rules";
import { richTextPlainText } from "@/lib/forms/rich-text";
export const dynamic = "force-dynamic";
const find = (id: string) =>
  getDb().customForms.find((f) => f.id === id || f.slug === id);
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
    const form = find(params.id);
    if (!form) throw new RequestError("Form not found.", 404);
    return NextResponse.json({ success: true, form });
  },
  true,
);
export const PATCH = route(
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
    const form = find(params.id);
    if (!form) throw new RequestError("Form not found.", 404);
    const parsed = formEditableSchema
      .extend({
        expectedUpdatedAt: z.string().optional(),
        expectedDraftVersion: z.string().nullable().optional(),
        action: z.enum(["save_draft", "discard_draft", "publish"]).optional(),
        draft: formDraftSchema.optional(),
      })
      .safeParse(await req.json());
    if (!parsed.success) throw new RequestError(parsed.error.issues[0].message);
    if (parsed.data.action) {
      if (
        parsed.data.expectedUpdatedAt !== form.updated_at ||
        parsed.data.expectedDraftVersion !==
          (form.editor_draft?.version || null)
      )
        throw new RequestError(
          "This form or its draft changed in another session. Reload before saving.",
          409,
          { code: "VERSION_CONFLICT" },
        );
      if (
        parsed.data.action !== "discard_draft" &&
        form.editor_draft &&
        form.editor_draft.base_updated_at !== form.updated_at
      )
        throw new RequestError(
          "The published form changed after this draft. Discard the old draft and review the current form before saving.",
          409,
          { code: "VERSION_CONFLICT" },
        );
      if (parsed.data.action === "save_draft") {
        if (!parsed.data.draft)
          throw new RequestError("Draft settings are required.");
        form.editor_draft = {
          version: new Date(
            Math.max(
              Date.now(),
              Date.parse(form.editor_draft?.version || "") + 1 || 0,
            ),
          ).toISOString(),
          base_updated_at: form.updated_at,
          values: { ...editorValues(form), ...parsed.data.draft } as ReturnType<
            typeof editorValues
          >,
        };
        return NextResponse.json({
          success: true,
          form,
          message: "Draft saved. Public form unchanged.",
        });
      }
      if (parsed.data.action === "discard_draft") {
        delete form.editor_draft;
        return NextResponse.json({
          success: true,
          form,
          message: "Draft discarded.",
        });
      }
      const nextFields = parsed.data.fields || form.fields;
      for (const key of identityKeys)
        if (
          !nextFields.some(
            (field) => fieldIdentityKeys(field).includes(key) && field.required,
          )
        )
          throw new RequestError(
            `Keep a required ${key} question for admissions identity and duplicate protection.`,
          );
      const hasResponses = getDb().formSubmissions.some(
        (sub) => sub.form_id === form.id,
      );
      if (
        hasResponses &&
        nextFields.some((field) =>
          form.fields.some(
            (old) => old.id === field.id && old.type !== field.type,
          ),
        )
      )
        throw new RequestError(
          "A question with responses cannot change its type. Add a new question instead; existing responses remain available.",
        );
    }
    const changingLink =
      parsed.data.slug !== undefined && parsed.data.slug !== form.slug;
    if (
      (parsed.data.messages !== undefined ||
        parsed.data.message_display !== undefined) &&
      !parsed.data.expectedUpdatedAt
    )
      throw new RequestError(
        "Reload this form before changing its messages.",
        409,
        { code: "VERSION_CONFLICT" },
      );
    if (changingLink && !parsed.data.expectedUpdatedAt)
      throw new RequestError(
        "Reload this form before changing its public link.",
        409,
        { code: "VERSION_CONFLICT" },
      );
    if (
      parsed.data.slug &&
      formLinkTaken(getDb().customForms, parsed.data.slug, form.id)
    )
      throw new RequestError(
        "That public link belongs to another form or its previously shared link. Choose a different name.",
        409,
        { code: "FORM_LINK_TAKEN" },
      );
    if (
      parsed.data.workshop_config?.workshop_ids.some(
        (id) =>
          !getDb().workshops.some(
            (w) => w.id === id && w.campaign_id === form.campaign_id,
          ),
      )
    )
      throw new RequestError("Choose workshops from this form's intake.");
    if (
      parsed.data.email_automation?.invitation_form_id &&
      (form.type !== "registration" ||
        !getDb().customForms.some(
          (target) =>
            target.id === parsed.data.email_automation!.invitation_form_id &&
            target.type === "application" &&
            target.campaign_id === form.campaign_id,
        ))
    )
      throw new RequestError(
        "Choose an application form from this intake for the follow-up email link.",
      );
    if (
      parsed.data.expectedUpdatedAt &&
      parsed.data.expectedUpdatedAt !== form.updated_at
    )
      throw new RequestError(
        "This form changed in another session. Reload before saving.",
        409,
        { code: "VERSION_CONFLICT" },
      );
    const {
      expectedUpdatedAt,
      expectedDraftVersion,
      action,
      draft,
      ...incoming
    } = parsed.data as any;
    const opensAt = incoming.starts_at ?? form.starts_at,
      closesAt = incoming.closes_at ?? form.closes_at;
    if (opensAt && closesAt && Date.parse(opensAt) >= Date.parse(closesAt))
      throw new RequestError("Closing time must be after opening time.");
    if (incoming.description_rich)
      incoming.description = richTextPlainText(incoming.description_rich);
    else if (
      incoming.description !== undefined &&
      incoming.description !== form.description
    )
      delete form.description_rich;
    if (incoming.status !== undefined)
      incoming.is_active = incoming.status === "published";
    else if (incoming.is_active !== undefined)
      incoming.status = incoming.is_active ? "published" : "closed";
    if (
      incoming.google_sheets_config &&
      JSON.stringify(incoming.google_sheets_config) !==
        JSON.stringify(form.google_sheets_config) &&
      getDb().outbox.some((j) => j.type === "sheet" && j.status === "sending")
    )
      throw new RequestError(
        "An export is running. Wait for it to finish before changing Sheet settings.",
        409,
      );
    if (incoming.google_form_config)
      incoming.google_form_config = {
        ...incoming.google_form_config,
        webhook_secret:
          form.google_form_config?.webhook_secret || crypto.randomUUID(),
        last_synced_at: form.google_form_config?.last_synced_at,
        synced_count: form.google_form_config?.synced_count,
      };
    const previousSlug = form.slug;
    if (incoming.messages)
      incoming.messages = { ...form.messages, ...incoming.messages };
    if (incoming.message_display)
      incoming.message_display = {
        ...form.message_display,
        ...incoming.message_display,
      };
    if (changingLink)
      form.previous_slugs = [
        ...new Set([...(form.previous_slugs || []), previousSlug]),
      ].filter((slug) => slug !== incoming.slug);
    Object.assign(form, incoming, {
      updated_at: new Date(
        Math.max(Date.now(), Date.parse(form.updated_at) + 1 || 0),
      ).toISOString(),
    });
    if (action === "publish") delete form.editor_draft;
    audit("FORM_UPDATED", "custom_forms", form.id, {
      title: form.title,
      ...(changingLink ? { previousSlug, slug: form.slug } : {}),
    });
    return NextResponse.json({
      success: true,
      form,
      message: changingLink
        ? "Form saved. The new public link is ready; previously shared links still open this form."
        : "Form settings saved.",
    });
  },
  true,
);
export const DELETE = route(
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
    const form = find(params.id);
    if (!form) throw new RequestError("Form not found.", 404);
    // Preserve submitted records and their tracking links.
    if (getDb().formSubmissions.some((s) => s.form_id === form.id))
      throw new RequestError(
        "This form has responses. Close submissions instead of deleting it.",
        409,
      );
    getDb().customForms = getDb().customForms.filter((f) => f.id !== form.id);
    audit("FORM_DELETED", "custom_forms", form.id, { title: form.title });
    return NextResponse.json({ success: true, message: "Form deleted." });
  },
  true,
);

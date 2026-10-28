"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomForm } from "../data/store";
import { api, ApiError } from "./api";
import { stableJson } from "../json";
import { formDraftSchema } from "../validations/forms";
import {
  editorHistory,
  editorValues,
  type EditorHistory,
  type FormEditorValues,
} from "../forms/editor";

const fingerprint = stableJson;
export function useFormEditor(id: string) {
  const [form, setForm] = useState<CustomForm | null>(null),
    [history, setHistory] = useState<EditorHistory | null>(null);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [savedAt, setSavedAt] = useState("");
  const state = useRef<EditorHistory | null>(null),
    metadata = useRef<CustomForm | null>(null),
    saved = useRef("");
  const locked = useRef(false),
    coalescing = useRef({ key: "", at: 0 });
  const apply = useCallback((action: Parameters<typeof editorHistory>[1]) => {
    if (!state.current) return;
    const next = editorHistory(state.current, action);
    state.current = next;
    setHistory(next);
  }, []);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      setConflict(false);
      try {
        const result = await api(
          `/api/admin/forms/${id}`,
          undefined,
          "GET",
          signal,
        );
        if (signal?.aborted) return;
        const current: CustomForm = result.form;
        const values = current.editor_draft?.values || editorValues(current);
        const initial: EditorHistory = {
          past: [],
          present: values,
          future: [],
        };
        metadata.current = current;
        state.current = initial;
        saved.current = fingerprint(values);
        setForm(current);
        setHistory(initial);
        setSavedAt(current.editor_draft?.version || "");
        if (
          current.editor_draft &&
          current.editor_draft.base_updated_at !== current.updated_at
        ) {
          setConflict(true);
          setError(
            "The published form changed after this draft. Review the draft or discard it to load the published version.",
          );
        }
      } catch (err) {
        if (!signal?.aborted)
          setError(
            err instanceof Error ? err.message : "Could not load this form.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const change = useCallback(
    (
      update:
        | Partial<FormEditorValues>
        | ((current: FormEditorValues) => FormEditorValues),
      key = "",
    ) => {
      if (!state.current || publishing) return;
      const now = Date.now(),
        coalesce = Boolean(
          key &&
          coalescing.current.key === key &&
          now - coalescing.current.at < 800,
        );
      coalescing.current = { key, at: now };
      apply({
        type: "change",
        values:
          typeof update === "function"
            ? update(state.current.present)
            : { ...state.current.present, ...update },
        coalesce,
      });
    },
    [apply, publishing],
  );
  const saveDraft = useCallback(async () => {
    if (locked.current || !state.current || !metadata.current || conflict)
      return false;
    const values = state.current.present,
      body = fingerprint(values),
      current = metadata.current;
    if (body === saved.current) return true;
    locked.current = true;
    setSaving(true);
    setError("");
    const accept = (accepted: CustomForm) => {
      metadata.current = accepted;
      saved.current = body;
      setForm(accepted);
      setSavedAt(accepted.editor_draft?.version || "");
    };
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await api(
            `/api/admin/forms/${id}`,
            {
              action: "save_draft",
              draft: values,
              expectedUpdatedAt: current.updated_at,
              expectedDraftVersion: current.editor_draft?.version || null,
            },
            "PATCH",
          );
          accept(result.form);
          return true;
        } catch (err) {
          // A timed-out request may already be committed. Confirm before retrying.
          const latest: CustomForm = (
            await api(`/api/admin/forms/${id}`, undefined, "GET")
          ).form;
          const normalized = formDraftSchema.safeParse(values);
          if (
            latest.updated_at === current.updated_at &&
            latest.editor_draft?.base_updated_at === current.updated_at &&
            fingerprint(latest.editor_draft.values) ===
              fingerprint(normalized.success ? normalized.data : values)
          ) {
            accept(latest);
            return true;
          }
          if (
            latest.updated_at !== current.updated_at ||
            (latest.editor_draft?.version || null) !==
              (current.editor_draft?.version || null)
          ) {
            setConflict(true);
            throw new Error(
              "Another session changed this form or draft. Your edits remain on this page. Reload the latest version before saving.",
            );
          }
          if (
            attempt >= 2 ||
            !(err instanceof ApiError) ||
            ![0, 429, 503].includes(err.status)
          )
            throw err;
          await new Promise((resolve) =>
            setTimeout(resolve, 600 * 2 ** attempt),
          );
        }
      }
      return false;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Draft save failed. Your edits remain on this page.",
      );
      return false;
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }, [id, conflict]);
  const dirty = Boolean(
    history && fingerprint(history.present) !== saved.current,
  );
  useEffect(() => {
    if (!dirty || saving || publishing || conflict || error) return;
    const timer = setTimeout(() => {
      void saveDraft();
    }, 1600);
    return () => clearTimeout(timer);
  }, [history, dirty, saving, publishing, conflict, error, saveDraft]);

  const publish = async () => {
    if (locked.current || !state.current || !metadata.current || conflict)
      return false;
    locked.current = true;
    setPublishing(true);
    setError("");
    const current = metadata.current,
      values = state.current.present;
    const firstPublication = current.status === "draft";
    const status =
      firstPublication && values.status === "draft"
        ? "published"
        : values.status || "published";
    const next = { ...values, status, is_active: status === "published" };
    try {
      const result = await api(
        `/api/admin/forms/${id}`,
        {
          ...next,
          action: "publish",
          expectedUpdatedAt: current.updated_at,
          expectedDraftVersion: current.editor_draft?.version || null,
        },
        "PATCH",
      );
      metadata.current = result.form;
      const published = editorValues(result.form);
      saved.current = fingerprint(published);
      setForm(result.form);
      apply({ type: "reset", values: published });
      setSavedAt("");
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT")
        setConflict(true);
      setError(
        err instanceof Error
          ? err.message
          : "Publishing was not confirmed. Reload before trying again.",
      );
      return false;
    } finally {
      locked.current = false;
      setPublishing(false);
    }
  };
  const discard = async () => {
    if (locked.current || !metadata.current) return;
    locked.current = true;
    setSaving(true);
    setError("");
    try {
      const current = metadata.current;
      await api(
        `/api/admin/forms/${id}`,
        {
          action: "discard_draft",
          expectedUpdatedAt: current.updated_at,
          expectedDraftVersion: current.editor_draft?.version || null,
        },
        "PATCH",
      );
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT")
        setConflict(true);
      setError(
        err instanceof Error ? err.message : "Could not discard the draft.",
      );
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !link ||
        link.target === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        link.origin !== location.origin
      )
        return;
      if (
        !window.confirm("Your latest edits are still saving. Leave this page?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);
  const undo = () => {
    coalescing.current.key = "";
    apply({ type: "undo" });
  };
  const redo = () => {
    coalescing.current.key = "";
    apply({ type: "redo" });
  };
  return {
    form,
    values: history?.present,
    change,
    undo,
    redo,
    canUndo: Boolean(history?.past.length),
    canRedo: Boolean(history?.future.length),
    loading,
    saving,
    publishing,
    dirty,
    error,
    conflict,
    savedAt,
    saveDraft,
    publish,
    discard,
    reload: load,
  };
}

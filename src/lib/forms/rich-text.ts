export interface RichTextNode {
  type: string;
  text?: string;
  attrs?: { level?: number; href?: string; start?: number };
  marks?: { type: string; attrs?: { href?: string } }[];
  content?: RichTextNode[];
}

export function safeContentLink(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2000) return;
  try {
    const url = new URL(value);
    if (["http:", "https:", "mailto:"].includes(url.protocol)) return url.href;
  } catch {
    /* Only absolute, explicitly allowed links are accepted. */
  }
}

/** Allowlisted document data is rendered as React nodes, never injected HTML. */
export function cleanRichText(value: unknown): RichTextNode {
  let nodes = 0,
    length = 0;
  const visit = (input: unknown, depth: number): RichTextNode | undefined => {
    if (!input || typeof input !== "object" || depth > 12 || ++nodes > 1500)
      return;
    const node = input as RichTextNode;
    if (
      ![
        "doc",
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "hardBreak",
        "text",
      ].includes(node.type)
    )
      return;
    if (node.type === "text") {
      if (typeof node.text !== "string") return;
      const text = node.text.slice(0, Math.max(0, 20000 - length));
      length += text.length;
      const marks = (Array.isArray(node.marks) ? node.marks : [])
        .slice(0, 8)
        .flatMap((mark) => {
          if (["bold", "italic", "underline"].includes(mark?.type))
            return [{ type: mark.type }];
          const href =
            mark?.type === "link" && safeContentLink(mark.attrs?.href);
          return href ? [{ type: "link", attrs: { href } }] : [];
        });
      return { type: "text", text, ...(marks.length ? { marks } : {}) };
    }
    return {
      type: node.type,
      ...(node.type === "heading"
        ? { attrs: { level: node.attrs?.level === 3 ? 3 : 2 } }
        : {}),
      ...(node.type === "orderedList"
        ? {
            attrs: {
              start:
                Number.isSafeInteger(node.attrs?.start) &&
                node.attrs!.start! > 0 &&
                node.attrs!.start! <= 1000
                  ? node.attrs!.start
                  : 1,
            },
          }
        : {}),
      ...(Array.isArray(node.content)
        ? {
            content: node.content
              .map((child) => visit(child, depth + 1))
              .filter((child): child is RichTextNode => Boolean(child)),
          }
        : {}),
    };
  };
  const doc = visit(value, 0);
  return doc?.type === "doc" ? doc : { type: "doc", content: [] };
}

export function richTextFromPlain(text: string): RichTextNode {
  return {
    type: "doc",
    content: text
      .split("\n")
      .map((line) => ({
        type: "paragraph",
        ...(line ? { content: [{ type: "text", text: line }] } : {}),
      })),
  };
}

export function richTextPlainText(node: RichTextNode): string {
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  return (node.content || [])
    .map(richTextPlainText)
    .join(
      ["doc", "bulletList", "orderedList", "listItem"].includes(node.type)
        ? "\n"
        : "",
    );
}

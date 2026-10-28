import { Fragment, type ReactNode } from "react";
import {
  cleanRichText,
  safeContentLink,
  type RichTextNode,
} from "@/lib/forms/rich-text";

export default function FormRichText({
  content,
  className = "",
  interactive = true,
}: {
  content: RichTextNode;
  className?: string;
  interactive?: boolean;
}) {
  const render = (node: RichTextNode, key: number): ReactNode => {
    const children = node.content?.map(render);
    if (node.type === "text") {
      let text: ReactNode = node.text;
      for (const mark of node.marks || []) {
        if (mark.type === "bold") text = <strong>{text}</strong>;
        if (mark.type === "italic") text = <em>{text}</em>;
        if (mark.type === "underline") text = <u>{text}</u>;
        if (mark.type === "link" && safeContentLink(mark.attrs?.href))
          text = interactive ? (
            <a
              href={safeContentLink(mark.attrs?.href)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {text}
            </a>
          ) : (
            <span className="underline underline-offset-2">{text}</span>
          );
      }
      return <Fragment key={key}>{text}</Fragment>;
    }
    switch (node.type) {
      case "heading":
        return node.attrs?.level === 3 ? (
          <h3 key={key} className="mt-4 text-base font-bold">
            {children}
          </h3>
        ) : (
          <h2 key={key} className="mt-4 text-lg font-bold">
            {children}
          </h2>
        );
      case "paragraph":
        return (
          <p key={key} className="min-h-4 whitespace-pre-wrap">
            {children}
          </p>
        );
      case "bulletList":
        return (
          <ul key={key} className="list-disc space-y-1 pl-5">
            {children}
          </ul>
        );
      case "orderedList":
        return (
          <ol
            key={key}
            start={node.attrs?.start}
            className="list-decimal space-y-1 pl-5"
          >
            {children}
          </ol>
        );
      case "listItem":
        return <li key={key}>{children}</li>;
      case "hardBreak":
        return <br key={key} />;
      default:
        return <Fragment key={key}>{children}</Fragment>;
    }
  };
  return (
    <div
      className={`space-y-2 break-words text-sm leading-relaxed ${className}`}
    >
      {render(cleanRichText(content), 0)}
    </div>
  );
}

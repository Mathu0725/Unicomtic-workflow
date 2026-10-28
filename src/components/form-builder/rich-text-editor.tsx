"use client";
import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  List,
  ListOrdered,
  Link2,
  RemoveFormatting,
} from "lucide-react";
import {
  cleanRichText,
  safeContentLink,
  type RichTextNode,
} from "@/lib/forms/rich-text";

export default function RichTextEditor({
  value,
  onChange,
}: {
  value: RichTextNode;
  onChange: (value: RichTextNode) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false),
    [link, setLink] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: {
          openOnClick: false,
          autolink: false,
          isAllowedUri: (url) => Boolean(safeContentLink(url)),
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Form description",
        "aria-multiline": "true",
        class:
          "min-h-40 max-h-80 overflow-y-auto p-3 text-sm leading-relaxed outline-none [&_h2]:text-lg [&_h2]:font-bold [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-700 [&_a]:underline [&_p]:mb-2",
      },
    },
    onUpdate: ({ editor }) => onChange(cleanRichText(editor.getJSON())),
  });
  useEffect(() => {
    if (
      editor &&
      JSON.stringify(cleanRichText(editor.getJSON())) !==
        JSON.stringify(cleanRichText(value))
    )
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  const tools = [
    {
      label: "Bold",
      Icon: Bold,
      active: editor?.isActive("bold"),
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      Icon: Italic,
      active: editor?.isActive("italic"),
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: "Underline",
      Icon: Underline,
      active: editor?.isActive("underline"),
      run: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      label: "Heading",
      Icon: Heading2,
      active: editor?.isActive("heading"),
      run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Bullet list",
      Icon: List,
      active: editor?.isActive("bulletList"),
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      Icon: ListOrdered,
      active: editor?.isActive("orderedList"),
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Link",
      Icon: Link2,
      active: editor?.isActive("link"),
      run: () => {
        setLink(editor?.getAttributes("link").href || "");
        setLinkOpen((current) => !current);
      },
    },
    {
      label: "Clear formatting",
      Icon: RemoveFormatting,
      active: false,
      run: () => editor?.chain().focus().clearNodes().unsetAllMarks().run(),
    },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
      <div
        role="toolbar"
        aria-label="Description formatting"
        className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-1.5"
      >
        {tools.map(({ label, Icon, active, run }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={Boolean(active)}
            disabled={!editor}
            onMouseDown={(event) => event.preventDefault()}
            onClick={run}
            className={`rounded-md p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${active ? "bg-blue-100 text-blue-800" : "text-slate-600 hover:bg-slate-200"}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      {linkOpen && (
        <div className="space-y-2 border-b bg-slate-50 p-3">
          <label className="block text-xs font-semibold">
            Link address
            <input
              type="url"
              autoFocus
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://example.com"
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal"
            />
          </label>
          <div className="flex gap-3 text-xs font-semibold">
            <button
              type="button"
              disabled={!safeContentLink(link)}
              onClick={() => {
                editor
                  ?.chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: safeContentLink(link)! })
                  .run();
                setLinkOpen(false);
              }}
              className="text-blue-700 disabled:opacity-40"
            >
              Apply link
            </button>
            <button
              type="button"
              onClick={() => {
                editor?.chain().focus().unsetLink().run();
                setLinkOpen(false);
              }}
            >
              Remove link
            </button>
            <button type="button" onClick={() => setLinkOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

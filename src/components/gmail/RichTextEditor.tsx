import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Placeholder } from "@tiptap/extensions";
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Link2, Eraser, Palette } from "lucide-react";

const COLORS = ["#111827", "#E24B4A", "#0ABEDF", "#16A34A", "#F59E0B", "#7C3AED"];

function ToolBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex items-center justify-center rounded transition-colors"
      style={{
        width: 28,
        height: 28,
        borderRadius: 4,
        background: active ? "#E0F7FC" : "transparent",
        color: active ? "#0ABEDF" : "inherit",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#E0F7FC"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span style={{ width: 1, height: 18, background: "#C8F0F8", margin: "0 2px" }} />;
}

function Toolbar({ editor, rightSlot }: { editor: Editor; rightSlot?: React.ReactNode }) {
  const [colorOpen, setColorOpen] = useState(false);
  return (
    <div
      className="flex items-center relative"
      style={{ background: "#F8FFFD", borderBottom: "0.5px solid #C8F0F8", padding: "6px 10px", gap: 4 }}
    >
      <ToolBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-3.5 h-3.5" /></ToolBtn>
      <ToolBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-3.5 h-3.5" /></ToolBtn>
      <ToolBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="w-3.5 h-3.5" /></ToolBtn>
      <ToolBtn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-3.5 h-3.5" /></ToolBtn>
      <Divider />
      <ToolBtn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-3.5 h-3.5" /></ToolBtn>
      <ToolBtn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-3.5 h-3.5" /></ToolBtn>
      <Divider />
      <ToolBtn
        title="Link"
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link")?.href || "";
          const url = window.prompt("Link URL", prev);
          if (url === null) return;
          if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
          const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
          editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
        }}
      >
        <Link2 className="w-3.5 h-3.5" />
      </ToolBtn>
      <Divider />
      <ToolBtn title="Text color" active={colorOpen} onClick={() => setColorOpen((o) => !o)}><Palette className="w-3.5 h-3.5" /></ToolBtn>
      {colorOpen && (
        <div className="absolute z-50 top-9 left-0 flex gap-1 p-2 rounded-md border bg-white shadow-md">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { editor.chain().focus().setColor(c).run(); setColorOpen(false); }}
              className="w-5 h-5 rounded-full border"
              style={{ background: c }}
            />
          ))}
        </div>
      )}
      <Divider />
      <ToolBtn
        title="Clear formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <Eraser className="w-3.5 h-3.5" />
      </ToolBtn>
      {rightSlot && <span className="ml-auto flex items-center gap-1">{rightSlot}</span>}
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  minHeight = 120,
  toolbarRight,
  footer,
}: {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  toolbarRight?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const initial = useRef(value);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: "Write your message..." }),
    ],
    content: initial.current,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "gmail-compose-editor focus:outline-none",
        style: `min-height:${minHeight}px;padding:10px 12px;font-size:13px;line-height:1.6;`,
      },
    },
  });

  useEffect(() => {
    if (editor) onChange(editor.getHTML());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rounded-md border border-gray-100 overflow-visible bg-white">
      <Toolbar editor={editor} rightSlot={toolbarRight} />
      <div className="overflow-auto">
        <EditorContent editor={editor} />
      </div>
      {footer}
    </div>
  );
}

export function plainTextToHtml(text: string): string {
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => `<p>${l.trim() ? esc(l) : "<br>"}</p>`)
    .join("");
}

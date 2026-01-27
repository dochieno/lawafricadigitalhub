import React, { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";

// Keep this minimal + predictable for law reports
const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    blockquote: true,
    bulletList: true,
    orderedList: true,
    horizontalRule: true,
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
    HTMLAttributes: {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    },
  }),
  TextAlign.configure({
    types: ["heading", "paragraph"],
  }),
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({
    placeholder: "Paste the formatted case here (Word paste supported).",
  }),
];

function normalizeHtml(html) {
  return String(html ?? "").trim();
}

/** ✅ moved OUTSIDE render to satisfy eslint(react-hooks/static-components) */
function ToolbarBtn({ title, onClick, active, disabled, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rt-btn ${active ? "is-active" : ""}`}
    >
      {children}
    </button>
  );
}

export default function ReportTiptapEditor({ value, onChange, disabled }) {
  const editor = useEditor({
    extensions,
    content: normalizeHtml(value),
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange?.(html);
    },
  });

  // keep editor in sync if value changes from outside (load/refresh)
  useEffect(() => {
    if (!editor) return;

    const current = normalizeHtml(editor.getHTML());
    const incoming = normalizeHtml(value);

    if (incoming !== current) {
      editor.commands.setContent(incoming || "<p></p>", false);
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return <div style={{ padding: 10, color: "#6b7280", fontWeight: 800 }}>Loading editor…</div>;
  }

  return (
    <div className={`rt-wrap ${disabled ? "is-disabled" : ""}`}>
      <style>{`
        .rt-wrap{
          border:1px solid #e5e7eb;
          border-radius:14px;
          overflow:hidden;
          background:#fff;
        }
        .rt-toolbar{
          display:flex;
          flex-wrap:wrap;
          gap:6px;
          padding:10px;
          border-bottom:1px solid #e5e7eb;
          background:#fafafa;
        }
        .rt-btn{
          border:1px solid #e5e7eb;
          background:#fff;
          border-radius:10px;
          padding:6px 10px;
          font-weight:800;
          font-size:12px;
          cursor:pointer;
        }
        .rt-btn.is-active{
          border-color:#c7d2fe;
          background:#eef2ff;
        }
        .rt-btn:disabled{
          opacity:.6;
          cursor:not-allowed;
        }
        .rt-editor{
          padding:14px;
          min-height:68vh;
        }
        .rt-wrap.is-disabled .rt-editor{
          background:#fbfbfb;
        }
        /* Content defaults */
        .rt-editor :where(h2){ font-size:18px; font-weight:900; margin:14px 0 8px; }
        .rt-editor :where(h3){ font-size:16px; font-weight:900; margin:12px 0 6px; }
        .rt-editor :where(h4){ font-size:14px; font-weight:900; margin:10px 0 6px; }
        .rt-editor :where(p){ margin: 8px 0; line-height:1.7; }
        .rt-editor :where(blockquote){
          border-left:4px solid #e5e7eb;
          padding-left:12px;
          color:#374151;
          margin:10px 0;
        }
        .rt-editor :where(table){
          width:100%;
          border-collapse:collapse;
          margin:10px 0;
        }
        .rt-editor :where(th, td){
          border:1px solid #e5e7eb;
          padding:8px;
          vertical-align:top;
        }
        .rt-editor :where(ul,ol){ padding-left:20px; }
        .rt-editor :where(a){ text-decoration:underline; }
      `}</style>

      <div className="rt-toolbar">
        <ToolbarBtn
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarBtn>
        <ToolbarBtn
          title="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarBtn>
        <ToolbarBtn
          title="Heading 4"
          active={editor.isActive("heading", { level: 4 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
        >
          H4
        </ToolbarBtn>

        <span style={{ width: 8 }} />

        <ToolbarBtn
          title="Bold"
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarBtn>
        <ToolbarBtn
          title="Italic"
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </ToolbarBtn>
        <ToolbarBtn
          title="Underline"
          active={editor.isActive("underline")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          U
        </ToolbarBtn>

        <span style={{ width: 8 }} />

        <ToolbarBtn
          title="Bulleted list"
          active={editor.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolbarBtn>
        <ToolbarBtn
          title="Numbered list"
          active={editor.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolbarBtn>
        <ToolbarBtn
          title="Block quote"
          active={editor.isActive("blockquote")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          “ Quote
        </ToolbarBtn>

        <span style={{ width: 8 }} />

        <ToolbarBtn
          title="Insert table (3x3)"
          disabled={disabled}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          Table
        </ToolbarBtn>
        <ToolbarBtn title="Add row" disabled={disabled} onClick={() => editor.chain().focus().addRowAfter().run()}>
          +Row
        </ToolbarBtn>
        <ToolbarBtn title="Add column" disabled={disabled} onClick={() => editor.chain().focus().addColumnAfter().run()}>
          +Col
        </ToolbarBtn>
        <ToolbarBtn title="Delete table" disabled={disabled} onClick={() => editor.chain().focus().deleteTable().run()}>
          Del table
        </ToolbarBtn>

        <span style={{ width: 8 }} />

        <ToolbarBtn
          title="Remove formatting (clear marks)"
          disabled={disabled}
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
        >
          Remove format
        </ToolbarBtn>
        <ToolbarBtn title="Undo" disabled={disabled} onClick={() => editor.chain().focus().undo().run()}>
          Undo
        </ToolbarBtn>
        <ToolbarBtn title="Redo" disabled={disabled} onClick={() => editor.chain().focus().redo().run()}>
          Redo
        </ToolbarBtn>
      </div>

      <div className="rt-editor">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
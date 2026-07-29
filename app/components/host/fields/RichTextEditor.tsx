"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Heading from "@tiptap/extension-heading";
import History from "@tiptap/extension-history";
import Placeholder from "@tiptap/extension-placeholder";
import { BulletList, OrderedList, ListItem } from "@tiptap/extension-list";
import { Bold as BoldIcon, Heading3, Image as ImageIcon, Italic as ItalicIcon, List, ListOrdered, MapPin, StickyNote } from "lucide-react";
import { canonical, EMPTY_DOC, RICH_LIMITS, textLength, type RichNode } from "@/lib/rich-text";

// The ONLY file in the app that imports Tiptap. Everything downstream — the
// renderer, the differ, the C# walk — reads the plain JSON tree, so replacing
// the editor library would change this file and nothing else.
//
// The schema here IS the allowlist. A node type with no definition cannot be
// held by the document, so pasted <script>, <iframe>, <img> and styled Word
// content are coerced away at the door rather than filtered afterwards.

const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  parseHTML: () => [{ tag: "div[data-callout]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, {
      "data-callout": "",
      class: "rounded-(--radius-control) border-l-2 border-river bg-river-soft py-2 pl-3 pr-2.5 text-river-deep",
    }),
    0,
  ],
});

/** Both reference nodes are ATOMS carrying an identifier and nothing else.
 *  There is no href, no src and no free-text attribute — the label a guest
 *  sees is resolved from the listing at render time. */
// The chip/card labels below are rendered straight into the editable
// ProseMirror DOM (there is no NodeView), so they are real, host-visible
// text — not decoration. They come from `addOptions`/`.configure()` so the
// module-level Node definitions stay pure while the component instance
// supplies the localized label from `strings`; no English literal lives here.
const PhotoRef = Node.create({
  name: "photoRef",
  group: "inline",
  inline: true,
  atom: true,
  addOptions: () => ({ label: "" }),
  addAttributes: () => ({ url: { default: null } }),
  parseHTML: () => [{ tag: "span[data-photo-ref]" }],
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-photo-ref": HTMLAttributes.url, class: chipClass("bg-surface-2 text-ink") }),
      `▣ ${this.options.label}`,
    ];
  },
});

const PlaceRef = Node.create({
  name: "placeRef",
  group: "inline",
  inline: true,
  atom: true,
  addOptions: () => ({ label: "" }),
  addAttributes: () => ({ entryId: { default: null } }),
  parseHTML: () => [{ tag: "span[data-place-ref]" }],
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      // brand tones, not "meadow" (that token doesn't exist — see globals.css) —
      // matches the placeRef chip RichText.tsx renders for guests, so the
      // editing surface and the guest page read as the same colour.
      mergeAttributes({ "data-place-ref": HTMLAttributes.entryId, class: chipClass("bg-brand-soft text-brand-strong") }),
      // No label attribute exists on this atom (see the comment above), so the
      // editor shows a generic tag rather than pretending to resolve a name.
      `◎ ${this.options.label}`,
    ];
  },
});

const PhotoFigure = Node.create({
  name: "photoFigure",
  group: "block",
  atom: true,
  draggable: true,
  addOptions: () => ({ label: "" }),
  addAttributes: () => ({ url: { default: null }, caption: { default: null } }),
  parseHTML: () => [{ tag: "figure[data-photo-figure]" }],
  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes({ "data-photo-figure": HTMLAttributes.url, class: "rounded-(--radius-control) border border-line p-2 text-xs text-muted" }),
      `▣ ${this.options.label}`,
    ];
  },
});

const PlaceCard = Node.create({
  name: "placeCard",
  group: "block",
  atom: true,
  draggable: true,
  addOptions: () => ({ label: "" }),
  addAttributes: () => ({ entryId: { default: null } }),
  parseHTML: () => [{ tag: "div[data-place-card]" }],
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-place-card": HTMLAttributes.entryId, class: "rounded-(--radius-control) border border-line p-2 text-xs text-muted" }),
      `◎ ${this.options.label}`,
    ];
  },
});

const chipClass = (tone: string) => `mx-0.5 inline-flex items-baseline gap-1 rounded-(--radius-control) px-1.5 py-0.5 text-[0.875em] ${tone}`;

// `CONTENT_MODEL` in lib/rich-text.ts is the shared contract with the C#
// validator: `heading` may only hold `text`, and `listItem` may only hold a
// single `paragraph` (so lists can't nest). Tiptap's stock extensions don't
// match that — `Heading` defaults to `content: "inline*"` (it would happily
// take a photo or place chip), and `ListItem` defaults to
// `content: "paragraph block*"` with Tab bound to `sinkListItem` (it would
// happily nest a bulletList inside a bulletList). Left alone, a normal
// keystroke (Tab in a list) or toolbar click (insert photo with the caret in
// a heading) would build a document the server rejects on save with no
// warning in the editor. Narrowing the content expression here makes both
// actions no-ops instead — ProseMirror simply won't apply a transaction the
// schema disallows.
// Every reachable path already forces level 3 (the toolbar's
// `toggleHeading({level:3})`, the `#` input rule, and `parseHTML`, which only
// matches `h3` since `levels: [3]` is the sole configured level) — but the
// stock extension's `level` attribute still *defaults* to 1 when unset. That
// default is exactly the field `validateDoc` rejects on
// (`copy_bad_heading`), so it's overridden here too: belt-and-braces against
// any future insertion path (e.g. a bare `setNode("heading")`) that forgets
// to pass an explicit level.
const RestrictedHeading = Heading.extend({
  content: "text*",
  addAttributes: () => ({ level: { default: 3, rendered: false } }),
}).configure({ levels: [3] });
const RestrictedListItem = ListItem.extend({ content: "paragraph" });

export type RichTextEditorProps = {
  value: RichNode | null;
  onChange: (next: RichNode) => void;
  label: string;
  tag?: string;
  placeholder?: string;
  /** A persistent caption below the editor — mirrors `TextAreaField`'s
   *  `hint`. Distinct from `placeholder`, which only shows while empty and
   *  disappears the moment there is a single character. */
  hint?: string;
  /** Opens the pickers. The parent owns them so both editors share one. */
  onInsertPhoto: (insert: (url: string, asFigure: boolean) => void) => void;
  onInsertPlace: (insert: (entryId: string, asCard: boolean) => void) => void;
  /** Toolbar button labels, so this component holds no untranslated copy. */
  strings: Record<"bold" | "italic" | "heading" | "bullet" | "ordered" | "note" | "photo" | "place", string>;
};

export function RichTextEditor({
  value, onChange, label, tag, placeholder, hint, onInsertPhoto, onInsertPlace, strings,
}: RichTextEditorProps) {
  const editor = useEditor({
    // Static export: the editor must not render on the server.
    immediatelyRender: false,
    extensions: [
      Document, Paragraph, Text, Bold, Italic,
      RestrictedHeading,
      BulletList, OrderedList, RestrictedListItem, History,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Callout,
      PhotoRef.configure({ label: strings.photo }),
      PlaceRef.configure({ label: strings.place }),
      PhotoFigure.configure({ label: strings.photo }),
      PlaceCard.configure({ label: strings.place }),
    ],
    content: value ?? { type: "doc", content: [] },
    editorProps: {
      attributes: {
        class: "min-h-40 px-3.5 py-3 text-[0.9375rem] leading-relaxed outline-none [&_h3]:text-[1.0625rem] [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichNode),
  });

  // Re-sync when the parent replaces the document wholesale — a discard
  // (including back to `null`, which means "no document", not "no change"),
  // or a reload after save. `null` is normalized to `EMPTY_DOC` so a discard
  // actually clears the editor instead of leaving the discarded text (or a
  // lone reference chip — see below) on screen. Deliberately NOT
  // short-circuited by any notion of "is this empty": a document holding
  // only a `photoRef`/`photoFigure`/`placeRef`/`placeCard` and no words has
  // `textLength() === 0`, so any text-based emptiness check (e.g.
  // `isEmptyDoc`) would call it empty and skip clearing it on discard — the
  // exact bug this effect exists to prevent, just for chips instead of text.
  // The plain content comparison below is sufficient on its own: when the
  // incoming document and the editor's current document already agree
  // (including "both hold nothing," typing that just round-tripped back
  // through the parent, or a still-untouched editor seeing `null`), the
  // comparison matches and `setContent` is skipped — that's what stops every
  // keystroke from resetting the cursor. No separate guard is needed.
  //
  // Compared via `canonical()`, not raw `JSON.stringify`: a document that has
  // round-tripped through the API (Task 10's caller) can differ from what
  // Tiptap emits in key order and in absent-vs-null attrs while still
  // meaning the same document — `canonical()` exists precisely to make that
  // kind of difference invisible (see its comment in `lib/rich-text.ts`).
  // Comparing raw JSON here would treat those as real changes and fire
  // `setContent` mid-typing, resetting the cursor for no reason.
  useEffect(() => {
    if (!editor) return;
    const next = value ?? EMPTY_DOC;
    if (canonical(editor.getJSON() as RichNode) !== canonical(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  const used = textLength(editor.getJSON() as RichNode);
  const over = used > RICH_LIMITS.maxText;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="data text-[0.65625rem] tracking-[0.1em] text-muted">{label}</span>
        {tag && <span className="data text-[0.65625rem] tracking-[0.1em] text-muted">{tag}</span>}
      </div>

      <div className="overflow-hidden rounded-(--radius-control) border border-line focus-within:border-brand">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1.5">
          <Tool editor={editor} active="bold" label={strings.bold} onClick={() => editor.chain().focus().toggleBold().run()}><BoldIcon size={14} strokeWidth={2.5} /></Tool>
          <Tool editor={editor} active="italic" label={strings.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><ItalicIcon size={14} strokeWidth={2.5} /></Tool>
          <Divider />
          <Tool editor={editor} active="heading" label={strings.heading} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={14} strokeWidth={2} /></Tool>
          <Tool editor={editor} active="bulletList" label={strings.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} strokeWidth={2} /></Tool>
          <Tool editor={editor} active="orderedList" label={strings.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} strokeWidth={2} /></Tool>
          <Tool editor={editor} active="callout" label={strings.note} onClick={() => editor.chain().focus().toggleWrap("callout").run()}><StickyNote size={14} strokeWidth={2} /></Tool>
          <Divider />
          <Tool editor={editor} label={strings.photo} onClick={() => onInsertPhoto((url, asFigure) =>
            editor.chain().focus().insertContent(asFigure ? { type: "photoFigure", attrs: { url } } : { type: "photoRef", attrs: { url } }).run())}><ImageIcon size={14} strokeWidth={2} /></Tool>
          <Tool editor={editor} label={strings.place} onClick={() => onInsertPlace((entryId, asCard) =>
            editor.chain().focus().insertContent(asCard ? { type: "placeCard", attrs: { entryId } } : { type: "placeRef", attrs: { entryId } }).run())}><MapPin size={14} strokeWidth={2} /></Tool>
          <span className={`data ml-auto text-[0.65625rem] ${over ? "text-danger" : "text-muted"}`}>
            {used.toLocaleString()} / {RICH_LIMITS.maxText.toLocaleString()}
          </span>
        </div>

        {/* The `Placeholder` extension (@tiptap/extensions under the hood in
            v3) decorates the empty node with `is-editor-empty`/`is-empty`
            classes and a `data-placeholder` attribute — it renders no CSS of
            its own. `.rte-empty` scopes the rule to this wrapper so it can't
            leak onto an unrelated element elsewhere in the app that happens
            to share the (very generic) upstream class names. */}
        <div className="rte-empty">
          <style>{`
            .rte-empty :where(.is-editor-empty):before {
              content: attr(data-placeholder);
              float: left;
              height: 0;
              pointer-events: none;
              color: var(--muted);
            }
          `}</style>
          <EditorContent editor={editor} />
        </div>
      </div>
      {hint && <p className="text-xs leading-[1.4] text-muted">{hint}</p>}
    </div>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px bg-line" aria-hidden />;

function Tool({ editor, active, label, onClick, children }: {
  editor: Editor; active?: string; label: string; onClick: () => void; children: React.ReactNode;
}) {
  const on = active ? editor.isActive(active) : false;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active ? on : undefined}
      className={`rounded-(--radius-control) px-2 py-1.5 transition-[background-color] duration-(--dur-standard) hover:bg-surface-2 ${on ? "bg-surface-2 text-ink" : "text-muted"}`}
    >
      {children}
    </button>
  );
}

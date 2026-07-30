// The listing description document (ADR pending; design 2026-07-29).
//
// This module is PURE — no React, no fetching, no Tiptap. It is the shared
// definition of what a description IS, and it is deliberately readable by
// three consumers that must agree: the editor, the renderer, and the section
// differ. The C# walk in `HostWrites.cs` mirrors it and is the one that counts.

export const RICH_MARKS = ["bold", "italic"] as const;
export type RichMarkType = (typeof RICH_MARKS)[number];
export type RichMark = { type: RichMarkType };

export const RICH_NODES = [
  "doc", "paragraph", "heading", "bulletList", "orderedList", "listItem",
  "callout", "photoFigure", "placeCard", "text", "photoRef", "placeRef",
] as const;
export type RichNodeType = (typeof RICH_NODES)[number];

/** Only the attributes we name. Anything else a client sends is dropped —
 *  structurally on the server, where System.Text.Json has no member for it. */
export type RichAttrs = {
  level?: 3;
  url?: string;
  caption?: string;
  entryId?: string;
};

export type RichNode = {
  type: RichNodeType;
  content?: RichNode[];
  text?: string;
  marks?: RichMark[];
  attrs?: RichAttrs;
};

export type BilingualDoc = { es: RichNode | null; en: RichNode | null };

export const RICH_LIMITS = {
  // Mirrors `LIMITS.maxCopy` in `lib/listing.ts`, duplicated rather than
  // imported: `lib/listing.ts`'s differ needs `canonical()`/`isEmptyDoc()`
  // from this file, and importing `LIMITS` back from there would make the two
  // modules import each other — this file is meant to be the pure base the
  // editor, the renderer AND the differ all sit on top of, so the dependency
  // only runs one way.
  maxText: 4_000,
  maxCaption: 200,
  maxNodes: 400,
  maxDepth: 5,
} as const;

/** What each node may contain. `null` marks an atom — a node with no children
 *  at all, which is why a photo reference can never hold text and a caption is
 *  an attribute rather than a content slot. */
export const CONTENT_MODEL: Record<RichNodeType, readonly RichNodeType[] | null> = {
  doc: ["paragraph", "heading", "bulletList", "orderedList", "callout", "photoFigure", "placeCard"],
  paragraph: ["text", "photoRef", "placeRef"],
  heading: ["text"],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  // Paragraphs and nothing else, so lists cannot nest.
  listItem: ["paragraph"],
  callout: ["paragraph"],
  photoFigure: null,
  placeCard: null,
  text: null,
  photoRef: null,
  placeRef: null,
};

export const EMPTY_DOC: RichNode = { type: "doc", content: [] };

export const isEmptyDoc = (node: RichNode | null | undefined): boolean =>
  !node || !node.content?.length || textLength(node) === 0;

/** Text characters only. References and captions are NOT charged — their
 *  labels live on other records, so charging them would let renaming a nearby
 *  place change the length of a description nobody touched. */
export function textLength(node: RichNode): number {
  let total = node.type === "text" ? (node.text?.length ?? 0) : 0;
  for (const child of node.content ?? []) total += textLength(child);
  return total;
}

/** A stable string for two documents that mean the same thing.
 *
 *  `FIELDS.description` compares documents to decide whether the section
 *  changed, and raw JSON.stringify would depend on key order and on
 *  absent-versus-undefined at EVERY node — the same hazard `bi()` documents
 *  for a two-key record, multiplied by the tree. Without this the "changed"
 *  indicator lights on a freshly opened page. */
export function canonical(node: RichNode | null | undefined): string {
  if (!node) return "null";
  return JSON.stringify(canonicalNode(node));
}

// Keys are written in alphabetical order; JSON.stringify preserves insertion
// order, so the output is deterministic.
const canonicalNode = (n: RichNode): unknown => ({
  attrs: n.attrs
    ? {
        caption: n.attrs.caption ?? null,
        entryId: n.attrs.entryId ?? null,
        level: n.attrs.level ?? null,
        url: n.attrs.url ?? null,
      }
    : null,
  content: n.content ? n.content.map(canonicalNode) : null,
  // Sorted: Tiptap emits marks in application order, the API in stored order.
  marks: n.marks ? [...n.marks].map((m) => m.type).sort() : null,
  text: n.text ?? null,
  type: n.type,
});

/** Plain text → a one-paragraph document. Used by the style-book fixtures and
 *  by anything that needs to start a document from a string. */
export function paragraphDoc(text: string): RichNode {
  const trimmed = text.trim();
  return trimmed === ""
    ? { type: "doc", content: [] }
    : { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: trimmed }] }] };
}

/** The ten rejections. Identical strings on both sides, so the client can
 *  pre-empt one and the server's answer is recognisable when it cannot. */
export type RichError =
  | "copy_bad_root"
  | "copy_bad_node"
  | "copy_bad_mark"
  | "copy_bad_heading"
  | "copy_bad_caption"
  | "copy_too_long"
  | "copy_too_deep"
  | "copy_too_many_nodes"
  | "copy_photo_unknown"
  | "copy_place_unknown";

export type RichRefs = { photoUrls: ReadonlySet<string>; entryIds: ReadonlySet<string> };

/** Walks the tree, rejecting on the first failure — never repairing. Silent
 *  repair would delete an owner's words with no explanation, and the editor
 *  makes every rejection here unreachable, so one means a bug or tampering.
 *
 *  Depth and node count are checked as soon as the walk reaches them, so a
 *  nesting bomb is refused mid-walk rather than after the tree is fully
 *  validated. (The JSON itself is still parsed in full first — this is
 *  about the walk, not about deserialization.)
 *
 *  `node` is nullable to match `HostValidation.RichText`: `BilingualDoc.Es`/
 *  `.En` are nullable, and an editor holding no document for a language is a
 *  legitimate state, not a malformed one (fix round 2). */
export function validateDoc(node: RichNode | null, refs: RichRefs): RichError | null {
  if (node === null) return null;
  if (node.type !== "doc") return "copy_bad_root";
  let budget = RICH_LIMITS.maxNodes;

  const walk = (n: RichNode, depth: number): RichError | null => {
    if (depth > RICH_LIMITS.maxDepth) return "copy_too_deep";
    if (--budget < 0) return "copy_too_many_nodes";
    if (!RICH_NODES.includes(n.type)) return "copy_bad_node";

    const allowed = CONTENT_MODEL[n.type];
    // `!= null` rather than `!== undefined`: a server payload's JSON `null`
    // and an absent key both deserialize to C# `null` on a typed record — the
    // API cannot tell them apart, so neither can this walk if the two are to
    // agree on every input (D9 follow-up, fix-round 1).
    if (allowed === null && (n.content?.length || (n.type !== "text" && n.text != null)))
      return "copy_bad_node";
    if (allowed !== null && n.text != null) return "copy_bad_node";

    // `!m` also catches a null array element (`"marks":[null]`) — without it
    // that shape throws instead of failing closed with copy_bad_mark.
    for (const m of n.marks ?? [])
      if (!m || !RICH_MARKS.includes(m.type)) return "copy_bad_mark";

    if (n.type === "heading" && n.attrs?.level !== 3) return "copy_bad_heading";
    if ((n.attrs?.caption?.length ?? 0) > RICH_LIMITS.maxCaption) return "copy_bad_caption";

    if (n.type === "photoRef" || n.type === "photoFigure")
      if (!n.attrs?.url || !refs.photoUrls.has(n.attrs.url)) return "copy_photo_unknown";
    if (n.type === "placeRef" || n.type === "placeCard")
      if (!n.attrs?.entryId || !refs.entryIds.has(n.attrs.entryId)) return "copy_place_unknown";

    // `!child` also catches a null array element (`"content":[null]`), same
    // reasoning as the marks guard above.
    for (const child of n.content ?? []) {
      if (!child || allowed === null || !allowed.includes(child.type)) return "copy_bad_node";
      const err = walk(child, depth + 1);
      if (err) return err;
    }
    return null;
  };

  const err = walk(node, 1);
  if (err) return err;
  return textLength(node) > RICH_LIMITS.maxText ? "copy_too_long" : null;
}

const collect = (node: RichNode, types: RichNodeType[], key: "url" | "entryId"): Set<string> => {
  const out = new Set<string>();
  const walk = (n: RichNode) => {
    if (types.includes(n.type) && n.attrs?.[key]) out.add(n.attrs[key]!);
    for (const c of n.content ?? []) walk(c);
  };
  walk(node);
  return out;
};

/** Which photos this document uses. The "used in the description" fact is
 *  DERIVED, never stored — storing it is a denormalised copy that goes stale
 *  on the next edit. */
export const referencedPhotoUrls = (node: RichNode): Set<string> =>
  collect(node, ["photoRef", "photoFigure"], "url");

/** Which nearby entries this document points at. */
export const referencedEntryIds = (node: RichNode): Set<string> =>
  collect(node, ["placeRef", "placeCard"], "entryId");

/** Rewrite place references through `map`, leaving every other node — and all
 *  prose — untouched. Ids absent from the map are kept as they are.
 *
 *  The client twin of `HostValidation.RemapPlaceIds` in the API, and it exists
 *  for the same reason on the other side of the wire: a place the owner adds
 *  and mentions in the SAME editing session is referenced by a temporary id
 *  the client minted, and the server answers with the real one it assigned.
 *  The stored document is rewritten server-side; this is what stops the OPEN
 *  form from carrying the dead temporary id into the next save.
 *
 *  Returns the identical node when nothing changed, so a caller can use the
 *  result to decide whether any state update is needed at all. */
export function remapPlaceIds(
  node: RichNode,
  map: ReadonlyMap<string, string>,
): RichNode {
  if (map.size === 0) return node;

  const rewrite = (n: RichNode): RichNode => {
    const id = n.attrs?.entryId;
    const replacement =
      (n.type === "placeRef" || n.type === "placeCard") && id ? map.get(id) : undefined;

    const content = n.content?.map(rewrite);
    const contentChanged = content?.some((c, i) => c !== n.content![i]) ?? false;

    if (!replacement && !contentChanged) return n;
    return {
      ...n,
      ...(replacement ? { attrs: { ...n.attrs, entryId: replacement } } : {}),
      ...(content ? { content } : {}),
    };
  };

  return rewrite(node);
}

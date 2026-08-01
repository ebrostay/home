# Listing Description Rich-Text Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the listing's plain-textarea `copy` field with a constrained rich-text editor whose documents are stored as ProseMirror JSON, validated by a C# tree walk, and rendered to React elements without ever building an HTML string.

**Architecture:** Tiptap 3 lives only inside the authenticated host editor and is code-split away from the guest bundle. The stored document is a plain JSON tree that neither the C# validator nor the React renderer imports Tiptap to read. Photo and place references store an identifier — a URL already on the property document, or a nearby entry id — and resolve to names, distances and image sources at render time.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript, Tailwind v4, Tiptap 3.29.2 (MIT), .NET 9 isolated Azure Functions, Cosmos DB. Tests: vitest (`app/lib/**/*.test.ts`, node env) and a new xunit project for the validator.

**Design spec:** [`docs/superpowers/specs/2026-07-29-rich-text-editor-design.md`](../specs/2026-07-29-rich-text-editor-design.md). Where this plan and the spec disagree, the spec wins.

## Global Constraints

- **Bilingual ES/EN is a hard requirement.** Every user-facing string goes in `app/messages/es.json` **and** `app/messages/en.json`. Checkpoint 1 (Tasks 1–5) is English-only by explicit decision and adds no message keys; Task 10 adds every key in both locales.
- **Light and dark mode both first-class.** Theme is `data-theme` on `<html>`; use the Tailwind `dark:` variant. Never `@media (prefers-color-scheme)`.
- **Static export.** No middleware, no route handlers, no server components at runtime. Dynamic data is fetched client-side from `/api/*`.
- **No HTML strings.** `dangerouslySetInnerHTML` appears exactly once in the app — `app/app/not-found.tsx:40`, for the theme bootstrap, whose content is a project-authored constant. No user content may reach it or any new one. `@tiptap/html` / `generateHTML` must never be imported.
- **No links.** No `href` may be authorable anywhere in this feature.
- **Authorization is enforced in the C# functions**, never only in the UI.
- **Never import `Link`/`useRouter` from `next/link`/`next/navigation`** — use `@/i18n/navigation`.
- Node vocabulary, exact and closed: blocks `doc`, `paragraph`, `heading`, `bulletList`, `orderedList`, `listItem`, `callout`, `photoFigure`, `placeCard`; inline `text`, `photoRef`, `placeRef`; marks `bold`, `italic`.
- Limits, exact: text ≤ **4000** (`LIMITS.maxCopy`), caption ≤ **200**, nodes ≤ **400**, depth ≤ **5**, heading level always **3**.
- **Character count is over text nodes only.** References and markup are not charged.
- Build must stay green: `cd app && npm run build`, `tsc` clean, lint at the pre-existing errors.

## A note on the C# test project

The repo has **no C# tests today**, and `docs/DEVELOPMENT.md` records that verification is by running the app. Task 6 adds a minimal xunit project anyway, scoped to `HostValidation.RichText` alone. This is a deliberate departure, and the justification is narrow: the validator is the feature's security boundary, it has ten distinct rejection codes, and exercising ten codes by curl against `:4280` is both slow and easy to leave half-done. OD-1 already assumes a test gate will exist, so this moves toward a decision rather than pre-empting one. **It is not a mandate to backfill tests elsewhere** — nothing outside the validator gets a test project in this plan.

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `app/lib/rich-text.ts` | **Create.** Vocabulary, content model, limits, canonical serializer, text counter, reference extraction, client-side validation. Pure — no React, no fetching. | 1, 2 |
| `app/lib/rich-text.test.ts` | **Create.** vitest cover for all of the above. | 1, 2 |
| `app/components/ui/RichText.tsx` | **Create.** Document → React elements. Used by the guest page and the style book. | 3 |
| `app/components/host/fields/RichTextEditor.tsx` | **Create.** The only file importing Tiptap. Toolbar, node extensions, character count. | 4 |
| `app/components/host/fields/PhotoPicker.tsx` | **Create.** Grid of the listing's photos + upload with the gallery checkbox. | 5 |
| `app/components/host/fields/PlacePicker.tsx` | **Create.** List of the listing's nearby entries. | 5 |
| `app/app/[locale]/design/page.tsx` | **Modify.** Add a style-book section with fixtures. | 5 |
| `api/Models/RichText.cs` | **Create.** `RichNode`, `RichMark`, `RichAttrs`, `BilingualDoc`. | 6 |
| `api/Ebrostay.Api.Tests/` | **Create.** xunit project, validator tests only. | 6, 7 |
| `api/Models/HostWrites.cs` | **Modify.** `HostValidation.RichText`, `PhotoWrite.HiddenFromGallery`, `Copy` shape. | 7, 8, 9 |
| `api/Models/PropertyDoc.cs` | **Modify.** `PropertyPhoto.HiddenFromGallery`, `Copy` becomes `BilingualDoc?`. | 8, 9 |
| `api/Models/PublicModels.cs` | **Modify.** `PublicPhoto.HiddenFromGallery`, `PublicListing.Copy` shape, projection. | 8, 9 |
| `api/Functions/HostFunctions.cs` | **Modify.** Carry the new photo flag through the save merge. | 8 |
| `app/lib/api.ts` | **Modify.** `HostPhoto`/`PropertyPhoto` gain `hiddenFromGallery`; `copy` becomes `BilingualDoc`. | 9 |
| `app/lib/listing.ts` | **Modify.** `FIELDS.description` uses the canonical serializer; `FIELDS.photos` gains the flag. | 10 |
| `app/components/host/fields/DescriptionFields.tsx` | **Modify.** Two `TextAreaField`s for `copy` become `RichTextEditor`. | 10 |
| `app/components/host/fields/PhotoManager.tsx` | **Modify.** Gallery toggle + derived usage badges. | 10 |
| `app/app/[locale]/property/page.tsx` | **Modify.** Render the document instead of one `<p>`. | 11 |
| `app/messages/{es,en}.json` | **Modify.** All editor and picker strings, both locales. | 10 |
| `infra/local-bootstrap.mjs` | **Modify.** Seed `copy` as documents. | 12 |

---

# CHECKPOINT 1 — the style book (Tasks 1–5)

English only. No API, no persistence, no `PropertyDoc` change. Ends with something typeable on `/en/design`, which is the point: the node set gets judged before the validator is written against it.

---

### Task 1: The vocabulary, the canonical serializer, and the text counter

**Files:**
- Create: `app/lib/rich-text.ts`
- Test: `app/lib/rich-text.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RichNode`, `RichMark`, `RichAttrs`, `BilingualDoc`, `RICH_MARKS`, `RICH_LIMITS`, `CONTENT_MODEL`, `canonical(node: RichNode | null): string`, `textLength(node: RichNode): number`, `paragraphDoc(text: string): RichNode`.

- [ ] **Step 1: Write the failing test**

Create `app/lib/rich-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  RICH_LIMITS,
  RICH_MARKS,
  canonical,
  paragraphDoc,
  textLength,
  type RichNode,
} from "./rich-text";

const doc = (...content: RichNode[]): RichNode => ({ type: "doc", content });
const p = (...content: RichNode[]): RichNode => ({ type: "paragraph", content });
const t = (text: string, ...marks: string[]): RichNode =>
  marks.length ? { type: "text", text, marks: marks.map((m) => ({ type: m as "bold" })) } : { type: "text", text };

describe("limits", () => {
  it("keeps the text cap in step with LIMITS.maxCopy", async () => {
    const { LIMITS } = await import("./listing");
    expect(RICH_LIMITS.maxText).toBe(LIMITS.maxCopy);
  });

  it("allows exactly two marks", () => {
    expect([...RICH_MARKS]).toEqual(["bold", "italic"]);
  });
});

describe("textLength", () => {
  it("counts text nodes", () => {
    expect(textLength(doc(p(t("hello")), p(t(" world"))))).toBe(11);
  });

  // References are deliberately free: their label lives on another record, so
  // charging them would let a rename elsewhere break an untouched description.
  it("does not charge references or captions", () => {
    const d = doc(
      p(t("abc"), { type: "placeRef", attrs: { entryId: "e1" } }),
      { type: "photoFigure", attrs: { url: "/p/1.jpg", caption: "a long caption" } },
    );
    expect(textLength(d)).toBe(3);
  });
});

describe("canonical", () => {
  it("is stable across key order", () => {
    const a: RichNode = { type: "paragraph", content: [t("x")] };
    const b = { content: [{ text: "x", type: "text" }], type: "paragraph" } as RichNode;
    expect(canonical(a)).toBe(canonical(b));
  });

  // Tiptap emits marks in application order; the API returns stored order.
  // Bold-then-italic and italic-then-bold are the same document.
  it("is stable across mark order", () => {
    expect(canonical(p(t("x", "bold", "italic")))).toBe(canonical(p(t("x", "italic", "bold"))));
  });

  it("treats an absent field and an explicit undefined alike", () => {
    expect(canonical({ type: "paragraph" })).toBe(canonical({ type: "paragraph", content: undefined }));
  });

  it("distinguishes genuinely different documents", () => {
    expect(canonical(p(t("x")))).not.toBe(canonical(p(t("y"))));
  });

  it("renders a null document without throwing", () => {
    expect(canonical(null)).toBe("null");
  });
});

describe("paragraphDoc", () => {
  it("wraps plain text in a one-paragraph document", () => {
    expect(paragraphDoc("hi")).toEqual(doc(p(t("hi"))));
  });

  it("returns an empty doc for blank text", () => {
    expect(paragraphDoc("   ")).toEqual(doc());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && npx vitest run lib/rich-text.test.ts
```

Expected: FAIL — `Failed to resolve import "./rich-text"`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/rich-text.ts`:

```ts
import { LIMITS } from "./listing";

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
  maxText: LIMITS.maxCopy,
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && npx vitest run lib/rich-text.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/rich-text.ts app/lib/rich-text.test.ts
git commit -m "feat(app): the description document vocabulary and canonical form"
```

---

### Task 2: Client-side validation and reference extraction

**Files:**
- Modify: `app/lib/rich-text.ts`
- Test: `app/lib/rich-text.test.ts`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `validateDoc(node, refs): RichError | null`, `type RichError`, `referencedPhotoUrls(node): Set<string>`, `referencedEntryIds(node): Set<string>`.

`RichError` is the union of the ten codes the C# walk returns; both sides use the same strings so the client can pre-empt a rejection and the server's answer is recognisable.

- [ ] **Step 1: Write the failing test**

Append to `app/lib/rich-text.test.ts`:

```ts
import { referencedEntryIds, referencedPhotoUrls, validateDoc } from "./rich-text";

const refs = { photoUrls: new Set(["/p/1.jpg"]), entryIds: new Set(["e1"]) };
const ok = (n: RichNode) => validateDoc(n, refs);

describe("validateDoc", () => {
  it("accepts a document using every node type", () => {
    expect(
      ok(
        doc(
          { type: "heading", attrs: { level: 3 }, content: [t("Kitchen")] },
          p(t("Refitted in "), t("2024", "bold"), { type: "photoRef", attrs: { url: "/p/1.jpg" } }),
          { type: "bulletList", content: [{ type: "listItem", content: [p(t("Lift"))] }] },
          { type: "orderedList", content: [{ type: "listItem", content: [p(t("One"))] }] },
          { type: "callout", content: [p(t("Good to know"))] },
          { type: "photoFigure", attrs: { url: "/p/1.jpg", caption: "North" } },
          { type: "placeCard", attrs: { entryId: "e1" } },
          p({ type: "placeRef", attrs: { entryId: "e1" } }),
        ),
      ),
    ).toBeNull();
  });

  it("rejects a root that is not a doc", () => {
    expect(ok(p(t("x")))).toBe("copy_bad_root");
  });

  it("rejects an unknown node type", () => {
    expect(ok(doc({ type: "iframe" as "paragraph" }))).toBe("copy_bad_node");
  });

  it("rejects a legal node in an illegal place", () => {
    expect(ok(doc(p({ type: "paragraph", content: [t("nested")] })))).toBe("copy_bad_node");
  });

  it("rejects an unknown mark", () => {
    expect(ok(doc(p(t("x", "link"))))).toBe("copy_bad_mark");
  });

  it("rejects a heading that is not level 3", () => {
    expect(ok(doc({ type: "heading", attrs: { level: 1 as 3 }, content: [t("x")] }))).toBe("copy_bad_heading");
  });

  it("rejects text past the cap", () => {
    expect(ok(doc(p(t("x".repeat(RICH_LIMITS.maxText + 1)))))).toBe("copy_too_long");
  });

  it("rejects a caption past the cap", () => {
    expect(ok(doc({ type: "photoFigure", attrs: { url: "/p/1.jpg", caption: "c".repeat(201) } }))).toBe(
      "copy_bad_caption",
    );
  });

  it("rejects a photo reference to a url not on the listing", () => {
    expect(ok(doc({ type: "photoFigure", attrs: { url: "https://evil.example/x.jpg" } }))).toBe(
      "copy_photo_unknown",
    );
  });

  it("rejects a place reference to an unknown entry", () => {
    expect(ok(doc(p({ type: "placeRef", attrs: { entryId: "nope" } })))).toBe("copy_place_unknown");
  });

  it("rejects a text node carrying children", () => {
    expect(ok(doc(p({ type: "text", text: "x", content: [t("y")] })))).toBe("copy_bad_node");
  });

  it("rejects a nesting bomb before it is fully walked", () => {
    let n: RichNode = p(t("deep"));
    for (let i = 0; i < 40; i++) n = { type: "bulletList", content: [{ type: "listItem", content: [n] }] };
    expect(ok(doc(n))).toBe("copy_too_deep");
  });

  it("rejects more nodes than the cap", () => {
    expect(ok(doc(...Array.from({ length: RICH_LIMITS.maxNodes + 1 }, () => p(t("x")))))).toBe(
      "copy_too_many_nodes",
    );
  });

  it("accepts an empty document", () => {
    expect(ok(doc())).toBeNull();
  });
});

describe("reference extraction", () => {
  const d = doc(
    p({ type: "photoRef", attrs: { url: "/p/1.jpg" } }, { type: "placeRef", attrs: { entryId: "e1" } }),
    { type: "photoFigure", attrs: { url: "/p/2.jpg" } },
    { type: "placeCard", attrs: { entryId: "e2" } },
  );

  it("finds photo urls in both node types", () => {
    expect([...referencedPhotoUrls(d)].sort()).toEqual(["/p/1.jpg", "/p/2.jpg"]);
  });

  it("finds entry ids in both node types", () => {
    expect([...referencedEntryIds(d)].sort()).toEqual(["e1", "e2"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && npx vitest run lib/rich-text.test.ts
```

Expected: FAIL — `validateDoc is not exported`.

- [ ] **Step 3: Write the implementation**

Append to `app/lib/rich-text.ts`:

```ts
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
 *  Depth and node count are checked DURING the walk, so a nesting bomb is
 *  refused rather than fully parsed. */
export function validateDoc(node: RichNode, refs: RichRefs): RichError | null {
  if (node.type !== "doc") return "copy_bad_root";
  let budget = RICH_LIMITS.maxNodes;

  const walk = (n: RichNode, depth: number): RichError | null => {
    if (depth > RICH_LIMITS.maxDepth) return "copy_too_deep";
    if (--budget < 0) return "copy_too_many_nodes";
    if (!RICH_NODES.includes(n.type)) return "copy_bad_node";

    const allowed = CONTENT_MODEL[n.type];
    if (allowed === null && (n.content?.length || (n.type !== "text" && n.text !== undefined)))
      return "copy_bad_node";
    if (allowed !== null && n.text !== undefined) return "copy_bad_node";

    for (const m of n.marks ?? [])
      if (!RICH_MARKS.includes(m.type)) return "copy_bad_mark";

    if (n.type === "heading" && n.attrs?.level !== 3) return "copy_bad_heading";
    if ((n.attrs?.caption?.length ?? 0) > RICH_LIMITS.maxCaption) return "copy_bad_caption";

    if (n.type === "photoRef" || n.type === "photoFigure")
      if (!n.attrs?.url || !refs.photoUrls.has(n.attrs.url)) return "copy_photo_unknown";
    if (n.type === "placeRef" || n.type === "placeCard")
      if (!n.attrs?.entryId || !refs.entryIds.has(n.attrs.entryId)) return "copy_place_unknown";

    for (const child of n.content ?? []) {
      if (allowed === null || !allowed.includes(child.type)) return "copy_bad_node";
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

export const referencedEntryIds = (node: RichNode): Set<string> =>
  collect(node, ["placeRef", "placeCard"], "entryId");
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && npx vitest run lib/rich-text.test.ts
```

Expected: PASS, 26 tests total.

- [ ] **Step 5: Commit**

```bash
git add app/lib/rich-text.ts app/lib/rich-text.test.ts
git commit -m "feat(app): validate description documents and extract their references"
```

---

### Task 3: The renderer

**Files:**
- Create: `app/components/ui/RichText.tsx`

**Interfaces:**
- Consumes: `RichNode`, `RichAttrs` from `@/lib/rich-text`.
- Produces: `<RichText doc photos nearby profile onPhoto onPlace />` and `type RichTextProps`.

There is no DOM test runner in this repo (`vitest.config.ts` includes `lib/**` only, node environment). This component is verified in the style book in Task 5 and on the real page in Task 11 — that is this project's established idiom, not a gap.

- [ ] **Step 1: Create the renderer**

Create `app/components/ui/RichText.tsx`:

```tsx
"use client";

import { Fragment } from "react";
import { Image as ImageIcon, MapPin } from "lucide-react";
import type { PropertyPhoto, PublicNearbyEntry } from "@/lib/api";
import { reachFor, type NearbyProfile } from "@/lib/nearby";
import type { RichNode } from "@/lib/rich-text";

// Renders a description document as React ELEMENTS. There is no HTML string
// anywhere in this file, and there must never be one: that absence is the
// whole security argument (design §8). No dangerouslySetInnerHTML, and no
// import of @tiptap/html.
//
// A reference resolves against the listing's own records, so the text can only
// ever show a photo the listing already publishes and a distance it already
// measured.

export type RichTextProps = {
  doc: RichNode | null;
  photos: PropertyPhoto[];
  nearby: PublicNearbyEntry[];
  profile: NearbyProfile;
  /** Open the gallery overlay at this photo. */
  onPhoto?: (url: string) => void;
  /** Select this entry in the neighbourhood section. */
  onPlace?: (entryId: string) => void;
};

export function RichText({ doc, photos, nearby, profile, onPhoto, onPlace }: RichTextProps) {
  if (!doc?.content?.length) return null;
  const byUrl = new Map(photos.map((p) => [p.url, p]));
  const byId = new Map(nearby.map((n) => [n.id, n]));
  const ctx = { byUrl, byId, profile, onPhoto, onPlace };
  return <div className="flex flex-col gap-3">{doc.content.map((n, i) => <Block key={i} node={n} ctx={ctx} />)}</div>;
}

type Ctx = {
  byUrl: Map<string, PropertyPhoto>;
  byId: Map<string, PublicNearbyEntry>;
  profile: NearbyProfile;
  onPhoto?: (url: string) => void;
  onPlace?: (entryId: string) => void;
};

const PROSE = "text-[0.96875rem] leading-relaxed";

function Block({ node, ctx }: { node: RichNode; ctx: Ctx }) {
  switch (node.type) {
    case "paragraph":
      return <p className={PROSE}><Inline nodes={node.content} ctx={ctx} /></p>;

    // Always h3: the page owns h1 and h2, so an owner cannot outrank it.
    case "heading":
      return <h3 className="text-[1.0625rem] font-semibold text-ink"><Inline nodes={node.content} ctx={ctx} /></h3>;

    case "bulletList":
      return <ul className="flex list-disc flex-col gap-1.5 pl-5">{listItems(node, ctx)}</ul>;
    case "orderedList":
      return <ol className="flex list-decimal flex-col gap-1.5 pl-5">{listItems(node, ctx)}</ol>;

    // A quiet aside, deliberately NOT alert-shaped. A callout that looks like a
    // warning invites owners to restate terms the booking engine enforces, and
    // prose contradicting ADR-022 is a dispute with our own UI as evidence.
    case "callout":
      return (
        <div className="rounded-(--radius-control) border-l-2 border-river bg-river-soft py-2.5 pl-3.5 pr-3">
          {(node.content ?? []).map((c, i) => (
            <p key={i} className={`${PROSE} text-river-deep`}><Inline nodes={c.content} ctx={ctx} /></p>
          ))}
        </div>
      );

    case "photoFigure": {
      const photo = node.attrs?.url ? ctx.byUrl.get(node.attrs.url) : undefined;
      // A missing target renders NOTHING — no broken image, no placeholder. A
      // guest has no use for the knowledge that a listing is inconsistent.
      if (!photo) return null;
      return (
        <figure className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => ctx.onPhoto?.(photo.url)}
            className="overflow-hidden rounded-(--radius-control)"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.detailUrl ?? photo.url}
              alt=""
              loading="lazy"
              className="w-full object-cover transition-[filter] duration-(--dur-standard) hover:brightness-95"
            />
          </button>
          {node.attrs?.caption && (
            <figcaption className="text-xs text-muted">{node.attrs.caption}</figcaption>
          )}
        </figure>
      );
    }

    case "placeCard": {
      const place = node.attrs?.entryId ? ctx.byId.get(node.attrs.entryId) : undefined;
      if (!place) return null;
      const reach = reachFor(place.reach, ctx.profile);
      return (
        <button
          type="button"
          onClick={() => ctx.onPlace?.(place.id)}
          className="flex items-center justify-between gap-3 rounded-(--radius-control) border border-line px-3.5 py-2.5 text-left transition-[filter] duration-(--dur-standard) hover:brightness-95"
        >
          <span className="flex items-center gap-2 text-sm text-ink">
            <MapPin size={14} strokeWidth={2} aria-hidden />
            {place.name}
          </span>
          {reach && (
            <span className="data text-xs text-muted">
              {reach.minutes} min · {reach.metres} m
            </span>
          )}
        </button>
      );
    }

    default:
      return null;
  }
}

const listItems = (node: RichNode, ctx: Ctx) =>
  (node.content ?? []).map((li, i) => (
    <li key={i} className={PROSE}>
      {(li.content ?? []).map((c, j) => <Inline key={j} nodes={c.content} ctx={ctx} />)}
    </li>
  ));

function Inline({ nodes, ctx }: { nodes?: RichNode[]; ctx: Ctx }) {
  return (
    <>
      {(nodes ?? []).map((n, i) => {
        if (n.type === "text") {
          let el = <>{n.text}</>;
          // Marks are applied outward, so bold+italic nests either way round.
          for (const m of n.marks ?? []) {
            if (m.type === "bold") el = <strong className="font-semibold">{el}</strong>;
            if (m.type === "italic") el = <em>{el}</em>;
          }
          return <Fragment key={i}>{el}</Fragment>;
        }

        if (n.type === "photoRef") {
          const photo = n.attrs?.url ? ctx.byUrl.get(n.attrs.url) : undefined;
          if (!photo) return null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => ctx.onPhoto?.(photo.url)}
              className="mx-0.5 inline-flex items-baseline gap-1 rounded-(--radius-chip) bg-surface-2 px-1.5 py-0.5 text-[0.875em] text-ink transition-[filter] duration-(--dur-standard) hover:brightness-95"
            >
              <ImageIcon size={12} strokeWidth={2} aria-hidden />
              {photo.isFloorplan ? "floorplan" : "photo"}
            </button>
          );
        }

        if (n.type === "placeRef") {
          const place = n.attrs?.entryId ? ctx.byId.get(n.attrs.entryId) : undefined;
          if (!place) return null;
          const reach = reachFor(place.reach, ctx.profile);
          return (
            <button
              key={i}
              type="button"
              onClick={() => ctx.onPlace?.(place.id)}
              className="mx-0.5 inline-flex items-baseline gap-1 rounded-(--radius-chip) bg-meadow-soft px-1.5 py-0.5 text-[0.875em] text-meadow-deep transition-[filter] duration-(--dur-standard) hover:brightness-95"
            >
              <MapPin size={12} strokeWidth={2} aria-hidden />
              {place.name}
              {reach && <span className="data opacity-70">{reach.minutes} min</span>}
            </button>
          );
        }

        return null;
      })}
    </>
  );
}
```

- [ ] **Step 2: Confirm the classes and helpers referenced here actually exist**

The class tokens above are guesses at this codebase's vocabulary and **must be checked**, not assumed:

```bash
cd app && grep -oE "\-\-radius-(control|chip)|(bg|text|border)-(river|river-soft|river-deep|meadow-soft|meadow-deep|surface-2|line|ink|muted)" app/globals.css | sort -u
grep -n "export function reachFor\|export const reachFor" lib/nearby.ts
grep -n "id:" lib/api.ts | sed -n '1,5p'
```

Replace any token that does not exist with its real counterpart from `app/app/[locale]/property/page.tsx`, which is the page this renderer has to sit inside. If `--radius-chip` does not exist, use `--radius-control`.

- [ ] **Step 3: Verify it compiles**

```bash
cd app && npx tsc --noEmit
```

Expected: no errors from `RichText.tsx`. (`PropertyPhoto` and `PublicNearbyEntry` come from `@/lib/api`; if `reachFor`'s signature differs, adapt the two call sites rather than changing `nearby.ts`.)

- [ ] **Step 4: Commit**

```bash
git add app/components/ui/RichText.tsx
git commit -m "feat(app): render description documents as React elements"
```

---

### Task 4: The editor

**Files:**
- Create: `app/components/host/fields/RichTextEditor.tsx`
- Modify: `app/package.json`

**Interfaces:**
- Consumes: `RichNode`, `RICH_LIMITS`, `textLength` from `@/lib/rich-text`.
- Produces: `<RichTextEditor value onChange photos nearby onInsertPhoto onInsertPlace label tag />`.

- [ ] **Step 1: Install Tiptap**

```bash
cd app && npm i @tiptap/react@3.29.2 @tiptap/core@3.29.2 @tiptap/pm@3.29.2 \
  @tiptap/extension-document@3.29.2 @tiptap/extension-paragraph@3.29.2 \
  @tiptap/extension-text@3.29.2 @tiptap/extension-bold@3.29.2 \
  @tiptap/extension-italic@3.29.2 @tiptap/extension-heading@3.29.2 \
  @tiptap/extension-list@3.29.2 @tiptap/extension-history@3.29.2 \
  @tiptap/extension-placeholder@3.29.2
```

Do **not** install `@tiptap/starter-kit` (it pulls in link, code block, blockquote and horizontal rule — all of which are out of the vocabulary and would then need disabling) and never `@tiptap/html`.

If a package name 404s, check the real one with `npm view @tiptap/extension-list version` and adjust; Tiptap 3 consolidated the list extensions, so `bulletList`/`orderedList`/`listItem` may come from one package.

- [ ] **Step 2: Create the editor**

Create `app/components/host/fields/RichTextEditor.tsx`:

```tsx
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
import { RICH_LIMITS, textLength, type RichNode } from "@/lib/rich-text";

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
const PhotoRef = Node.create({
  name: "photoRef",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ url: { default: null } }),
  parseHTML: () => [{ tag: "span[data-photo-ref]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "span",
    mergeAttributes({ "data-photo-ref": HTMLAttributes.url, class: chipClass("bg-surface-2 text-ink") }),
    "▣ photo",
  ],
});

const PlaceRef = Node.create({
  name: "placeRef",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ entryId: { default: null } }),
  parseHTML: () => [{ tag: "span[data-place-ref]" }],
  renderHTML: ({ HTMLAttributes, node }) => [
    "span",
    mergeAttributes({ "data-place-ref": HTMLAttributes.entryId, class: chipClass("bg-meadow-soft text-meadow-deep") }),
    `◎ ${node.attrs.label ?? "place"}`,
  ],
});

const PhotoFigure = Node.create({
  name: "photoFigure",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({ url: { default: null }, caption: { default: null } }),
  parseHTML: () => [{ tag: "figure[data-photo-figure]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "figure",
    mergeAttributes({ "data-photo-figure": HTMLAttributes.url, class: "rounded-(--radius-control) border border-line p-2 text-xs text-muted" }),
    "▣ photo",
  ],
});

const PlaceCard = Node.create({
  name: "placeCard",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({ entryId: { default: null } }),
  parseHTML: () => [{ tag: "div[data-place-card]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes({ "data-place-card": HTMLAttributes.entryId, class: "rounded-(--radius-control) border border-line p-2 text-xs text-muted" }),
    "◎ place",
  ],
});

const chipClass = (tone: string) => `mx-0.5 inline-flex items-baseline gap-1 rounded-(--radius-control) px-1.5 py-0.5 text-[0.875em] ${tone}`;

export type RichTextEditorProps = {
  value: RichNode | null;
  onChange: (next: RichNode) => void;
  label: string;
  tag?: string;
  placeholder?: string;
  /** Opens the pickers. The parent owns them so both editors share one. */
  onInsertPhoto: (insert: (url: string, asFigure: boolean) => void) => void;
  onInsertPlace: (insert: (entryId: string, asCard: boolean) => void) => void;
  /** Toolbar button labels, so this component holds no untranslated copy. */
  strings: Record<"bold" | "italic" | "heading" | "bullet" | "ordered" | "note" | "photo" | "place", string>;
};

export function RichTextEditor({
  value, onChange, label, tag, placeholder, onInsertPhoto, onInsertPlace, strings,
}: RichTextEditorProps) {
  const editor = useEditor({
    // Static export: the editor must not render on the server.
    immediatelyRender: false,
    extensions: [
      Document, Paragraph, Text, Bold, Italic,
      Heading.configure({ levels: [3] }),
      BulletList, OrderedList, ListItem, History,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Callout, PhotoRef, PlaceRef, PhotoFigure, PlaceCard,
    ],
    content: value ?? { type: "doc", content: [] },
    editorProps: {
      attributes: {
        class: "min-h-40 px-3.5 py-3 text-[0.9375rem] leading-relaxed outline-none [&_h3]:text-[1.0625rem] [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichNode),
  });

  // Re-sync when the parent replaces the document wholesale — a discard, or a
  // reload after save. Guarded, or every keystroke would reset the cursor.
  useEffect(() => {
    if (!editor || !value) return;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) {
      editor.commands.setContent(value, { emitUpdate: false });
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
        <EditorContent editor={editor} />
      </div>
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
```

- [ ] **Step 3: Verify it compiles and the build stays green**

```bash
cd app && npx tsc --noEmit && npm run build
```

Expected: clean. If `@tiptap/extension-list` does not export all three, import `ListItem` from `@tiptap/extension-list-item` — check with `npm view @tiptap/extension-list`.

- [ ] **Step 4: Commit**

```bash
git add app/package.json app/package-lock.json app/components/host/fields/RichTextEditor.tsx
git commit -m "feat(app): the description editor, with the schema as its allowlist"
```

---

### Task 5: The pickers and the style-book section

**Files:**
- Create: `app/components/host/fields/PhotoPicker.tsx`, `app/components/host/fields/PlacePicker.tsx`
- Modify: `app/app/[locale]/design/page.tsx`

**Interfaces:**
- Consumes: `RichTextEditor`, `RichText`, `HostPhoto`, `HostNearbyEntry`.
- Produces: `<PhotoPicker photos open onClose onPick onUpload />`, `<PlacePicker entries open onClose onPick />`.

`onPick` for photos is `(url: string, asFigure: boolean, alsoInGallery: boolean) => void`. `onUpload` is `(file: File, alsoInGallery: boolean) => Promise<string>` returning the new URL — Task 5 passes a fixture implementation, Task 10 passes the real one.

- [ ] **Step 1: Create the photo picker**

Create `app/components/host/fields/PhotoPicker.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { HostPhoto } from "@/lib/api";

// Picks a photo already on the listing, or uploads a new one through the
// EXISTING endpoint. There is deliberately no second upload path: a second
// path is a second place to get EXIF stripping wrong, and that shipped once
// already (PropertyDoc.cs:14).

export type PhotoPickerProps = {
  open: boolean;
  photos: HostPhoto[];
  onClose: () => void;
  onPick: (url: string, asFigure: boolean) => void;
  onUpload: (file: File, alsoInGallery: boolean) => Promise<string>;
  strings: Record<"title" | "asChip" | "asFigure" | "upload" | "alsoInGallery" | "uploading" | "failed" | "empty", string>;
};

export function PhotoPicker({ open, photos, onClose, onPick, onUpload, strings }: PhotoPickerProps) {
  const [asFigure, setAsFigure] = useState(false);
  // NOT pre-ticked: an upload begun inside the description is a description
  // photo until someone says otherwise, and this checkbox is the moment the
  // owner thinks about it at all.
  const [alsoInGallery, setAlsoInGallery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setBusy(true);
    setFailed(false);
    try {
      const url = await onUpload(f, alsoInGallery);
      onPick(url, asFigure);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={strings.title}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Choice on={!asFigure} onClick={() => setAsFigure(false)}>{strings.asChip}</Choice>
          <Choice on={asFigure} onClick={() => setAsFigure(true)}>{strings.asFigure}</Choice>
        </div>

        {photos.length === 0 ? (
          <p className="text-sm text-muted">{strings.empty}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p) => (
              <li key={p.url}>
                <button
                  type="button"
                  onClick={() => { onPick(p.url, asFigure); onClose(); }}
                  className="block w-full overflow-hidden rounded-(--radius-control) border border-line transition-[filter] duration-(--dur-standard) hover:brightness-95"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.cardUrl ?? p.url} alt="" className="aspect-4/3 w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={alsoInGallery}
              onChange={(e) => setAlsoInGallery(e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            {strings.alsoInGallery}
          </label>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => file.current?.click()}
            className="w-fit rounded-(--radius-control) bg-brand px-3.5 py-2 text-[0.78125rem] font-semibold text-white transition-[filter] duration-(--dur-standard) hover:brightness-95 disabled:opacity-45"
          >
            {busy ? strings.uploading : strings.upload}
          </button>
          {failed && <p className="text-xs text-danger">{strings.failed}</p>}
        </div>
      </div>
    </Dialog>
  );
}

const Choice = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={`rounded-(--radius-control) px-3 py-1.5 text-[0.78125rem] font-semibold ${on ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}
  >
    {children}
  </button>
);
```

- [ ] **Step 2: Create the place picker**

Create `app/components/host/fields/PlacePicker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import type { HostNearbyEntry } from "@/lib/api";

export type PlacePickerProps = {
  open: boolean;
  entries: HostNearbyEntry[];
  onClose: () => void;
  onPick: (entryId: string, asCard: boolean) => void;
  strings: Record<"title" | "asChip" | "asCard" | "empty", string>;
};

export function PlacePicker({ open, entries, onClose, onPick, strings }: PlacePickerProps) {
  const [asCard, setAsCard] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={strings.title}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Choice on={!asCard} onClick={() => setAsCard(false)}>{strings.asChip}</Choice>
          <Choice on={asCard} onClick={() => setAsCard(true)}>{strings.asCard}</Choice>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">{strings.empty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => { onPick(e.id, asCard); onClose(); }}
                  className="flex w-full items-center gap-2 rounded-(--radius-control) px-3 py-2 text-left text-sm text-body hover:bg-surface-2"
                >
                  <MapPin size={14} strokeWidth={2} aria-hidden />
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

const Choice = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={`rounded-(--radius-control) px-3 py-1.5 text-[0.78125rem] font-semibold ${on ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}
  >
    {children}
  </button>
);
```

- [ ] **Step 3: Check `Dialog`'s real props before wiring anything**

```bash
cd app && grep -n "export function Dialog" -A 15 components/ui/Dialog.tsx
```

Adapt both pickers to the real signature — do **not** change `Dialog` to suit them.

- [ ] **Step 4: Add the style-book section**

Add to `app/app/[locale]/design/page.tsx`, following the file's existing section pattern (read the surrounding sections first and match them). English fixture strings are fine here and only here — this page is the internal style book, and Task 10 is where translated copy lands.

```tsx
// --- Description editor (design 2026-07-29, checkpoint 1) -------------------
// Fixtures, not real data: the point of this section is to judge the NODE SET
// before the C# validator is written against it.

const FIXTURE_PHOTOS: HostPhoto[] = [
  { url: "/brand/sample-home-1.jpg", cardUrl: null, detailUrl: null, isFloorplan: false, sortOrder: 0 },
  { url: "/brand/sample-home-2.jpg", cardUrl: null, detailUrl: null, isFloorplan: true, sortOrder: 1 },
];

const FIXTURE_PLACES = [
  { id: "e1", group: "transport", type: "tram", customType: null, name: "Tranvía L1 · Plaza España",
    lat: 41.6528, lng: -0.8829, reach: { foot: { metres: 340, minutes: 4 } }, osmId: null, measuredAt: null, needsCheck: false },
  { id: "e2", group: "outdoors", type: "park", customType: null, name: "Parque del Agua",
    lat: 41.6702, lng: -0.9011, reach: { foot: { metres: 480, minutes: 6 } }, osmId: null, measuredAt: null, needsCheck: false },
] as unknown as HostNearbyEntry[];

function RichTextDemo() {
  const [doc, setDoc] = useState<RichNode | null>(paragraphDoc(
    "A quiet third-floor flat in El Arrabal, five minutes from the river.",
  ));
  const [photoPick, setPhotoPick] = useState<((url: string, asFigure: boolean) => void) | null>(null);
  const [placePick, setPlacePick] = useState<((id: string, asCard: boolean) => void) | null>(null);

  return (
    <div className="grid gap-6 min-[64rem]:grid-cols-2">
      <RichTextEditor
        value={doc}
        onChange={setDoc}
        label="Description"
        tag="EN"
        placeholder="What makes this home worth living in?"
        onInsertPhoto={(insert) => setPhotoPick(() => insert)}
        onInsertPlace={(insert) => setPlacePick(() => insert)}
        strings={{ bold: "Bold", italic: "Italic", heading: "Heading", bullet: "Bulleted list",
                   ordered: "Numbered list", note: "Good to know", photo: "Insert photo", place: "Insert place" }}
      />

      <div className="rounded-(--radius-control) border border-line p-4">
        <p className="data mb-3 text-[0.65625rem] tracking-[0.1em] text-muted">AS A GUEST SEES IT</p>
        <RichText
          doc={doc}
          photos={FIXTURE_PHOTOS as never}
          nearby={FIXTURE_PLACES as never}
          profile="foot"
          onPhoto={(url) => console.log("open gallery at", url)}
          onPlace={(id) => console.log("select place", id)}
        />
      </div>

      <PhotoPicker
        open={photoPick !== null}
        photos={FIXTURE_PHOTOS}
        onClose={() => setPhotoPick(null)}
        onPick={(url, asFigure) => photoPick?.(url, asFigure)}
        onUpload={async () => { throw new Error("no upload in the style book"); }}
        strings={{ title: "Insert a photo", asChip: "As a chip", asFigure: "As a figure", upload: "Upload",
                   alsoInGallery: "Also show in the gallery", uploading: "Uploading…", failed: "Upload failed",
                   empty: "No photos on this listing yet." }}
      />
      <PlacePicker
        open={placePick !== null}
        entries={FIXTURE_PLACES}
        onClose={() => setPlacePick(null)}
        onPick={(id, asCard) => placePick?.(id, asCard)}
        strings={{ title: "Insert a place", asChip: "As a chip", asCard: "As a card",
                   empty: "No nearby places on this listing yet." }}
      />
    </div>
  );
}
```

Both fixture image paths exist (`ls app/public/brand`); `sample-home-2.jpg` stands in for a floorplan.

- [ ] **Step 5: Run it and look at it**

```bash
cd app && npm run dev
```

Open `http://localhost:3000/en/design` and check, in both themes and at narrow width:

1. Every toolbar button works and reflects state (`aria-pressed`).
2. `- `, `1. `, `**bold**` and `### ` input rules fire.
3. Inserting a photo chip, a figure, a place chip and a place card updates the live preview beside it.
4. The character count charges text only — inserting references does not move it.
5. **Paste a page containing `<script>`, an `<iframe>`, an external `<img>` and coloured text.** Only representable content survives, and the console shows no error.
6. Undo/redo across all of it.

This is the checkpoint. **Stop here and get sign-off on the node set before starting Task 6** — a change to the vocabulary after the validator exists means writing the validator twice.

- [ ] **Step 6: Commit**

```bash
git add app/components/host/fields/PhotoPicker.tsx app/components/host/fields/PlacePicker.tsx "app/app/[locale]/design/page.tsx"
git commit -m "feat(app): style-book section for the description editor"
```

---

# CHECKPOINT 2 — the vertical slice (Tasks 6–12)

---

### Task 6: C# document models and the test project

**Files:**
- Create: `api/Models/RichText.cs`, `api/Ebrostay.Api.Tests/Ebrostay.Api.Tests.csproj`, `api/Ebrostay.Api.Tests/RichTextValidationTests.cs`
- Modify: `api/Ebrostay.Api.csproj` (only if it needs `InternalsVisibleTo`)

**Interfaces:**
- Consumes: nothing.
- Produces: `RichNode`, `RichMark`, `RichAttrs`, `BilingualDoc` in `Ebrostay.Api.Models`.

- [ ] **Step 1: Create the models**

Create `api/Models/RichText.cs`:

```csharp
namespace Ebrostay.Api.Models;

// The listing description document — design 2026-07-29. A plain tree, walked
// by HostValidation.RichText and rendered by the client. NOTHING here knows
// about Tiptap or ProseMirror; the shape is just what those happen to emit.

/// One node. `Attrs` is a TYPED record rather than a dictionary on purpose:
/// System.Text.Json silently drops any JSON property it has no member for, so
/// attribute stripping is structural and there is no allowlist to maintain.
public record RichNode(
    string? Type,
    RichNode[]? Content,
    string? Text,
    RichMark[]? Marks,
    RichAttrs? Attrs);

/// Marks carry NO attributes. A link mark is not rejected — it is
/// unrepresentable, because there is nowhere for an href to live.
public record RichMark(string? Type);

public record RichAttrs(
    int? Level,
    string? Url,
    string? Caption,
    string? EntryId);

/// The bilingual pair. Distinct from `Bilingual`, which stays a pair of plain
/// strings for `details`, `beds` and `priceNote`.
public record BilingualDoc(RichNode? Es, RichNode? En);
```

- [ ] **Step 2: Create the test project**

```bash
cd api && ~/.dotnet/dotnet new xunit -o Ebrostay.Api.Tests --force
~/.dotnet/dotnet add Ebrostay.Api.Tests reference Ebrostay.Api.csproj
```

Then set `api/Ebrostay.Api.Tests/Ebrostay.Api.Tests.csproj` to target `net9.0` to match the API, and delete the generated `UnitTest1.cs`.

- [ ] **Step 3: Write the failing test**

Create `api/Ebrostay.Api.Tests/RichTextValidationTests.cs`:

```csharp
using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

// The validator is this feature's security boundary. It is the one place in
// the API with its own tests, and the reason is narrow: ten rejection codes
// are too many to check by curl and too important to leave unchecked.
public class RichTextValidationTests
{
    private static readonly HashSet<string> Photos = new(StringComparer.Ordinal) { "/p/1.jpg" };
    private static readonly HashSet<string> Entries = new(StringComparer.Ordinal) { "e1" };

    private static string? Check(RichNode doc) => HostValidation.RichText(doc, Photos, Entries);

    private static RichNode Doc(params RichNode[] content) => new("doc", content, null, null, null);
    private static RichNode P(params RichNode[] content) => new("paragraph", content, null, null, null);
    private static RichNode T(string text, params string[] marks) =>
        new("text", null, text, marks.Length == 0 ? null : marks.Select(m => new RichMark(m)).ToArray(), null);

    [Fact]
    public void AcceptsEveryNodeType() => Assert.Null(Check(Doc(
        new("heading", [T("Kitchen")], null, null, new RichAttrs(3, null, null, null)),
        P(T("Refitted in "), T("2024", "bold")),
        new("bulletList", [new("listItem", [P(T("Lift"))], null, null, null)], null, null, null),
        new("orderedList", [new("listItem", [P(T("One"))], null, null, null)], null, null, null),
        new("callout", [P(T("Good to know"))], null, null, null),
        new("photoFigure", null, null, null, new RichAttrs(null, "/p/1.jpg", "North", null)),
        new("placeCard", null, null, null, new RichAttrs(null, null, null, "e1")),
        P(new RichNode("placeRef", null, null, null, new RichAttrs(null, null, null, "e1"))))));

    [Fact]
    public void AcceptsNull() => Assert.Null(HostValidation.RichText(null, Photos, Entries));

    [Fact]
    public void RejectsBadRoot() => Assert.Equal("copy_bad_root", Check(P(T("x"))));

    [Fact]
    public void RejectsUnknownNode() => Assert.Equal("copy_bad_node", Check(Doc(new("iframe", null, null, null, null))));

    [Fact]
    public void RejectsLegalNodeInIllegalPlace() =>
        Assert.Equal("copy_bad_node", Check(Doc(P(P(T("nested"))))));

    [Fact]
    public void RejectsUnknownMark() => Assert.Equal("copy_bad_mark", Check(Doc(P(T("x", "link")))));

    [Fact]
    public void RejectsNonLevel3Heading() =>
        Assert.Equal("copy_bad_heading", Check(Doc(new("heading", [T("x")], null, null, new RichAttrs(1, null, null, null)))));

    [Fact]
    public void RejectsOverlongText() =>
        Assert.Equal("copy_too_long", Check(Doc(P(T(new string('x', HostValidation.MaxCopyLength + 1))))));

    [Fact]
    public void RejectsOverlongCaption() =>
        Assert.Equal("copy_bad_caption", Check(Doc(new("photoFigure", null, null, null, new RichAttrs(null, "/p/1.jpg", new string('c', 201), null)))));

    // The load-bearing one. An off-document URL would render in a public <img>.
    [Fact]
    public void RejectsOffDocumentPhoto() =>
        Assert.Equal("copy_photo_unknown", Check(Doc(new("photoFigure", null, null, null, new RichAttrs(null, "https://evil.example/x.jpg", null, null)))));

    [Fact]
    public void RejectsUnknownPlace() =>
        Assert.Equal("copy_place_unknown", Check(Doc(P(new RichNode("placeRef", null, null, null, new RichAttrs(null, null, null, "nope"))))));

    [Fact]
    public void RejectsTextNodeWithChildren() =>
        Assert.Equal("copy_bad_node", Check(Doc(P(new RichNode("text", [T("y")], "x", null, null)))));

    // Expects copy_bad_node, NOT copy_too_deep. The content model already
    // bounds depth: the longest legal chain is doc>bulletList>listItem>
    // paragraph>text, which is exactly MaxCopyDepth, and listItem admits only
    // paragraph so lists cannot nest. A bomb therefore becomes content-model
    // illegal at depth ~4 and is refused there. That IS the property under
    // test — the other 38 wraps are never visited. The depth guard stays as
    // defence in depth for a future content-model change; it is unreachable
    // today by construction. (Established in Task 2; TS behaves identically.)
    [Fact]
    public void RejectsNestingBomb()
    {
        var n = P(T("deep"));
        for (var i = 0; i < 40; i++)
            n = new RichNode("bulletList", [new("listItem", [n], null, null, null)], null, null, null);
        Assert.Equal("copy_bad_node", Check(Doc(n)));
    }

    [Fact]
    public void RejectsTooManyNodes() =>
        Assert.Equal("copy_too_many_nodes",
            Check(Doc(Enumerable.Range(0, HostValidation.MaxCopyNodes + 1).Select(_ => P(T("x"))).ToArray())));

    [Fact]
    public void AcceptsEmptyDocument() => Assert.Null(Check(Doc()));
}
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd api && ~/.dotnet/dotnet test Ebrostay.Api.Tests
```

Expected: compile error — `HostValidation.RichText` does not exist. That is the correct failure.

- [ ] **Step 5: Commit**

```bash
git add api/Models/RichText.cs api/Ebrostay.Api.Tests
git commit -m "test(api): the description validator's cases, ahead of the validator"
```

---

### Task 7: The validator

**Files:**
- Modify: `api/Models/HostWrites.cs`
- Test: `api/Ebrostay.Api.Tests/RichTextValidationTests.cs` (already written)

**Interfaces:**
- Consumes: `RichNode`, `RichMark`, `RichAttrs` from Task 6.
- Produces: `HostValidation.RichText(RichNode? doc, IReadOnlySet<string> photoUrls, IReadOnlySet<string> entryIds) → string?` (null = valid), and the constants `MaxCopyNodes = 400`, `MaxCopyDepth = 5`, `MaxCaptionLength = 200`.

- [ ] **Step 1: Write the implementation**

Add to `api/Models/HostWrites.cs`, inside `HostValidation`:

```csharp
    public const int MaxCopyNodes = 400;
    public const int MaxCopyDepth = 5;
    public const int MaxCaptionLength = 200;

    private static readonly string[] CopyMarks = ["bold", "italic"];

    /// What each node may contain. An empty array is an ATOM — no children at
    /// all — which is why a photo reference can never hold text.
    private static readonly Dictionary<string, string[]> CopyModel = new(StringComparer.Ordinal)
    {
        ["doc"] = ["paragraph", "heading", "bulletList", "orderedList", "callout", "photoFigure", "placeCard"],
        ["paragraph"] = ["text", "photoRef", "placeRef"],
        ["heading"] = ["text"],
        ["bulletList"] = ["listItem"],
        ["orderedList"] = ["listItem"],
        // Paragraphs only, so lists cannot nest.
        ["listItem"] = ["paragraph"],
        ["callout"] = ["paragraph"],
        ["photoFigure"] = [],
        ["placeCard"] = [],
        ["text"] = [],
        ["photoRef"] = [],
        ["placeRef"] = [],
    };

    /// Walks a description document, returning an error code or null.
    ///
    /// REJECTS, never repairs (design D8): silent repair would delete an
    /// owner's words with no explanation, and the editor makes every rejection
    /// here unreachable — so one means a bug or a tampered payload.
    ///
    /// `photoUrls` and `entryIds` MUST come from the INCOMING payload, not the
    /// stored document (D9). One save can both delete a photo and reference
    /// it; validating against the stored arrays would let a dangling reference
    /// through while DropBlobsAsync deletes the blob underneath it.
    ///
    /// Depth and node count are checked DURING the walk, so a nesting bomb is
    /// refused rather than fully parsed.
    public static string? RichText(RichNode? doc, IReadOnlySet<string> photoUrls, IReadOnlySet<string> entryIds)
    {
        if (doc is null) return null;
        if (doc.Type != "doc") return "copy_bad_root";

        var budget = MaxCopyNodes;
        var text = 0;

        string? Walk(RichNode n, int depth)
        {
            if (depth > MaxCopyDepth) return "copy_too_deep";
            if (--budget < 0) return "copy_too_many_nodes";
            if (n.Type is null || !CopyModel.TryGetValue(n.Type, out var allowed)) return "copy_bad_node";

            var isAtom = allowed.Length == 0;
            if (isAtom && n.Content is { Length: > 0 }) return "copy_bad_node";
            if (n.Type != "text" && n.Text is not null) return "copy_bad_node";
            if (n.Type == "text") text += n.Text?.Length ?? 0;

            foreach (var m in n.Marks ?? [])
                if (m.Type is null || !CopyMarks.Contains(m.Type, StringComparer.Ordinal)) return "copy_bad_mark";

            if (n.Type == "heading" && n.Attrs?.Level != 3) return "copy_bad_heading";
            if ((n.Attrs?.Caption?.Length ?? 0) > MaxCaptionLength) return "copy_bad_caption";

            if (n.Type is "photoRef" or "photoFigure")
                if (n.Attrs?.Url is null || !photoUrls.Contains(n.Attrs.Url)) return "copy_photo_unknown";
            if (n.Type is "placeRef" or "placeCard")
                if (n.Attrs?.EntryId is null || !entryIds.Contains(n.Attrs.EntryId)) return "copy_place_unknown";

            foreach (var child in n.Content ?? [])
            {
                if (child.Type is null || !allowed.Contains(child.Type, StringComparer.Ordinal)) return "copy_bad_node";
                var err = Walk(child, depth + 1);
                if (err is not null) return err;
            }
            return null;
        }

        var result = Walk(doc, 1);
        if (result is not null) return result;
        // Text only — references and captions are NOT charged, because their
        // labels live on other records and renaming one must not change the
        // length of a description nobody touched.
        return text > MaxCopyLength ? "copy_too_long" : null;
    }
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
cd api && ~/.dotnet/dotnet test Ebrostay.Api.Tests
```

Expected: PASS, 15 tests.

- [ ] **Step 3: Verify the API still builds**

```bash
~/.dotnet/dotnet build api
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add api/Models/HostWrites.cs
git commit -m "feat(api): walk description documents, rejecting rather than repairing"
```

---

### Task 8: `HiddenFromGallery` through the stack

**Files:**
- Modify: `api/Models/PropertyDoc.cs`, `api/Models/HostWrites.cs`, `api/Models/PublicModels.cs`, `api/Functions/HostFunctions.cs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PropertyPhoto.HiddenFromGallery`, `PhotoWrite.HiddenFromGallery`, `PublicPhoto.HiddenFromGallery` — all `bool`, all defaulting to `false`.

- [ ] **Step 1: Add the field to the three records**

In `api/Models/PropertyDoc.cs`, add to `PropertyPhoto` **after** `SortOrder` and **before** the existing optional parameters, keeping every existing default:

```csharp
public record PropertyPhoto(
    string Url,
    bool IsFloorplan,
    int SortOrder,
    /// Kept out of the gallery — a photo that exists to be referenced from the
    /// description. NEGATIVE on purpose: a C# bool defaults to false and no
    /// stored document carries this field, so `InGallery` would deserialize to
    /// false and empty every gallery on the site. Reads worse; fails safe.
    bool HiddenFromGallery = false,
    string? CardUrl = null,
    string? DetailUrl = null,
    double? CapturedLat = null,
    double? CapturedLng = null,
    string? CapturedAt = null);
```

In `api/Models/HostWrites.cs`: `public record PhotoWrite(string? Url, bool IsFloorplan, bool HiddenFromGallery = false);`

In `api/Models/PublicModels.cs`: add `bool HiddenFromGallery` to `PublicPhoto` after `IsFloorplan`.

- [ ] **Step 2: Carry it through the save merge and the projection**

In `api/Functions/HostFunctions.cs` around line 173, the save rebuilds `doc.Photos` from the write payload. Read that block and add `HiddenFromGallery` to the fields taken from the incoming write — it is owner intent, like `IsFloorplan`, not server-derived like `CardUrl`.

In `PublicProjection`, pass the field through to `PublicPhoto`.

- [ ] **Step 3: Verify it builds and every construction site is updated**

```bash
~/.dotnet/dotnet build api
```

Expected: clean. Positional-record changes break every `new PropertyPhoto(...)` with positional args — fix each by name rather than by position.

- [ ] **Step 4: Commit**

```bash
git add api/Models api/Functions/HostFunctions.cs
git commit -m "feat(api): a photo can be kept out of the gallery"
```

---

### Task 9: `Copy` becomes a document

**Files:**
- Modify: `api/Models/PropertyDoc.cs`, `api/Models/PublicModels.cs`, `api/Models/HostWrites.cs`, `app/lib/api.ts`

**Interfaces:**
- Consumes: `BilingualDoc` (Task 6), `HostValidation.RichText` (Task 7).
- Produces: `PropertyDoc.Copy: BilingualDoc?`, `PublicListing.Copy: BilingualDoc?`, `HostDetailsUpdate.Copy: BilingualDoc?`; client `HostListing.copy: BilingualDoc | null` and `PropertyDetail.copy: BilingualDoc | null`.

- [ ] **Step 1: Change the shape on all three C# records**

`PropertyDoc.Copy`, `PublicListing.Copy` and the `Copy` member of the host update record all change from `Bilingual?`/`BilingualWrite?` to `BilingualDoc?`. `Bilingual` itself is untouched — `Details`, `Beds` and `PriceNote` keep it.

**Every call site, enumerated after the `feat/property-wizard` merge** (2026-07-29). This list is exhaustive as of that merge — verify with `grep -rn "\.Copy\b" api/` before starting, since the wizard added three of these:

| Site | What it needs |
|---|---|
| `api/Models/HostModels.cs:100` | record member → `BilingualDoc?` |
| **`api/Models/HostModels.cs:162`** | **`p => Both(p.Copy)`** — the wizard's section-completeness check. See below. |
| `api/Models/HostModels.cs:236` | projection, pass through |
| `api/Models/HostWrites.cs:68` | `BilingualWrite? Copy` → `BilingualDoc?` |
| `api/Models/HostWrites.cs:244` | `TooLong(u.Copy, MaxCopyLength)` — delete; Step 2 replaces it |
| `api/Models/PublicModels.cs:47` | record member → `BilingualDoc?` |
| `api/Models/PublicModels.cs:182` | projection, pass through |
| `api/Functions/HostFunctions.cs:223` | `doc.Copy = ToBilingual(update.Copy)` — needs a document equivalent |

**`Both(p.Copy)` is the one that needs a decision, not just a retype.** It decides whether the description section counts as *done* for the wizard's progress bar and for whether a draft may be submitted. `Both` currently means "both locales are non-empty strings". The document equivalent must mean **both locales contain actual words** — use `textLength(doc) > 0`, not merely "the document exists". A `doc` node with an empty `content` array, or one holding only a photo chip, is not a written description, and letting either satisfy the check would let an owner submit a listing whose description is blank or wordless. This is the same text-versus-structure distinction that cost Task 4 two fix rounds; here the text-only reading is the correct one.

- [ ] **Step 2: Replace the old length check with the walk**

In `HostValidation`, the existing `TooLong(u.Copy, MaxCopyLength)` term (around line 227) no longer type-checks. Remove it and call the walk instead, **after** the photo and nearby loops so their sets are already built:

```csharp
        // Built from the INCOMING payload, not the document (D9): one save can
        // both delete a photo and reference it.
        var photoUrls = photos.Select(p => p.Url!).ToHashSet(StringComparer.Ordinal);
        var entryIds = nearby.Select(n => n.Id!).ToHashSet(StringComparer.Ordinal);

        var copyError = RichText(u.Copy?.Es, photoUrls, entryIds)
                     ?? RichText(u.Copy?.En, photoUrls, entryIds);
        if (copyError is not null) return copyError;
```

Read the surrounding method first — the local names for the photo and nearby arrays are `photos` and `nearby`, and `NearbyEntry.Id` is server-generated, so confirm how ids are assigned before assuming `n.Id` is populated on the write shape. If ids are assigned later in the save, build `entryIds` from whichever value the incoming entries actually carry.

- [ ] **Step 3: Update the client types**

In `app/lib/api.ts`:

```ts
import type { BilingualDoc } from "@/lib/rich-text";

// HostListing
copy: BilingualDoc | null;

// PropertyDetail
copy: BilingualDoc | null;

// HostPhoto and PropertyPhoto both gain:
hiddenFromGallery: boolean;
```

- [ ] **Step 4: Verify both sides build**

```bash
~/.dotnet/dotnet build api
cd app && npx tsc --noEmit
```

Expected: the API is clean; `tsc` reports errors **only** at `DescriptionFields.tsx` and `property/page.tsx`, which Tasks 10 and 11 fix. Note them and move on.

- [ ] **Step 5: Commit**

```bash
git add api/Models app/lib/api.ts
git commit -m "feat: the listing description is a document, not a string"
```

---

### Task 10: Wire the editor into the real listing

**Files:**
- Modify: `app/components/host/fields/DescriptionFields.tsx`, `app/components/host/fields/PhotoManager.tsx`, `app/lib/listing.ts`, `app/lib/api.ts`, `app/messages/es.json`, `app/messages/en.json`

**Interfaces:**
- Consumes: `RichTextEditor`, `PhotoPicker`, `PlacePicker`, `canonical`, `referencedPhotoUrls`, `uploadHostPhoto`.
- Produces: no new exports.

- [ ] **Step 0: Carry `hiddenFromGallery` into the OWNER's models — found during Task 8's survey**

Task 8 stopped at `PropertyDoc`, `PhotoWrite` and `PublicPhoto`. The owner-facing path was not in its brief and is still missing the flag: **`HostPhoto` and its `ToListing` mapping in `api/Models/HostModels.cs`**, plus `HostPhoto` in `app/lib/api.ts`. Without these the editor cannot read or set the flag at all, and `PhotoPicker`'s checkbox has nowhere to write to.

- [ ] **Step 1: Fix the section differ first**

In `app/lib/listing.ts`:

```ts
import { canonical } from "./rich-text";

  description: (l) => [
    // Documents, not strings: raw JSON.stringify would depend on key order and
    // on absent-versus-undefined at EVERY node — the hazard `bi()` documents
    // for a two-key record, multiplied by the tree. Without the canonical form
    // the "changed" indicator lights on a freshly opened page.
    canonical(l.copy?.es),
    canonical(l.copy?.en),
    l.copyEnApproved,
    ...bi(l.details),
    ...bi(l.beds),
  ],
```

And `FIELDS.photos` gains the new flag, which is owner intent like `isFloorplan`:

```ts
  photos: (l) => l.photos.map((p) => `${p.url}|${p.isFloorplan}|${p.hiddenFromGallery}`),
```

- [ ] **Step 2: Add every string to both locales**

Note: `detail.richText.photo` / `detail.richText.floorplan` were already added in **both** locales during Task 3, when the renderer's guest-facing chip labels needed them. Do not duplicate them here.

Add under `host.edit.description` in **both** `app/messages/es.json` and `app/messages/en.json`. English:

```json
"toolbar": {
  "bold": "Bold", "italic": "Italic", "heading": "Heading",
  "bullet": "Bulleted list", "ordered": "Numbered list", "note": "Good to know",
  "photo": "Insert photo", "place": "Insert place"
},
"photoPicker": {
  "title": "Insert a photo", "asChip": "As a chip", "asFigure": "As a figure",
  "upload": "Upload a photo", "alsoInGallery": "Also show in the gallery",
  "uploading": "Uploading…", "failed": "That upload failed. Try again.",
  "empty": "This listing has no photos yet."
},
"placePicker": {
  "title": "Insert a place", "asChip": "As a chip", "asCard": "As a card",
  "empty": "Add nearby places in the section above first."
},
"aboutPlaceholder": "What makes this home worth living in?"
```

Spanish:

```json
"toolbar": {
  "bold": "Negrita", "italic": "Cursiva", "heading": "Encabezado",
  "bullet": "Lista con viñetas", "ordered": "Lista numerada", "note": "Bueno saberlo",
  "photo": "Insertar foto", "place": "Insertar lugar"
},
"photoPicker": {
  "title": "Insertar una foto", "asChip": "Como etiqueta", "asFigure": "Como imagen",
  "upload": "Subir una foto", "alsoInGallery": "Mostrar también en la galería",
  "uploading": "Subiendo…", "failed": "La subida ha fallado. Inténtalo de nuevo.",
  "empty": "Esta vivienda aún no tiene fotos."
},
"placePicker": {
  "title": "Insertar un lugar", "asChip": "Como etiqueta", "asCard": "Como tarjeta",
  "empty": "Añade primero lugares cercanos en la sección anterior."
},
"aboutPlaceholder": "¿Qué hace que merezca la pena vivir aquí?"
```

- [ ] **Step 3: Swap the two textareas**

In `DescriptionFields.tsx`, replace the two `TextAreaField`s bound to `copy` with `RichTextEditor`, keeping **everything else exactly as it is** — the river-toned English panel, the `copyEnApproved` button and its disabled-when-empty rule, and the plain `details`/`beds` grid.

The component now needs `photos`, `nearby` and the property id, so widen its props (`value`/`onChange` already carry `HostListing`; add `propertyId: string`). Both editors share one pair of pickers, held in `DescriptionFields` state. The upload handler is the existing endpoint:

```tsx
const upload = async (file: File, alsoInGallery: boolean) => {
  // The existing endpoint — the only path by which bytes reach storage.
  const photos = await uploadHostPhoto(propertyId, file, false);
  const added = photos[photos.length - 1];
  onChange({
    ...value,
    photos: photos.map((p) => (p.url === added.url ? { ...p, hiddenFromGallery: !alsoInGallery } : p)),
  });
  return added.url;
};
```

`setBi` stays for `details` and `beds`; `copy` gets its own setter, since it holds documents rather than strings:

```tsx
const setCopyDoc = (locale: "es" | "en", next: RichNode) =>
  onChange({ ...value, copy: { es: value.copy?.es ?? null, en: value.copy?.en ?? null, [locale]: next } });
```

- [ ] **Step 4: Show photo usage in `PhotoManager`**

Add a gallery toggle per photo (mirroring the existing floorplan toggle at line ~170) and a derived usage badge. "Used in the description" is **computed, never stored** (D11):

```tsx
// Derived from both documents on every render — storing it would be a
// denormalised copy that goes stale on the next edit.
const referenced = useMemo(() => {
  const out = new Set<string>();
  for (const d of [listing.copy?.es, listing.copy?.en])
    if (d) for (const url of referencedPhotoUrls(d)) out.add(url);
  return out;
}, [listing.copy]);
```

A photo with `hiddenFromGallery && !referenced.has(photo.url)` is an **orphan** — stored, counted against `MaxPhotos`, rendered nowhere — and must be badged, not left silent.

- [ ] **Step 5: Verify**

```bash
cd app && npx tsc --noEmit && npm run build && npx vitest run
```

Then with the full stack (`swa start app/out --api-location api`) on **:4280**:

1. Edit a description, save, reload → the document survives.
2. Reload and save with no edits → the "changed" indicator stays **off**.
3. Upload from the picker with the box unticked → in the description, absent from the gallery, badged description-only.
4. Delete that reference from the text → the photo is badged as an orphan.
5. Both locales, both themes.

- [ ] **Step 6: Commit**

```bash
git add app/components/host app/lib/listing.ts app/lib/api.ts app/messages
git commit -m "feat(app): the listing editor writes description documents"
```

---

### Task 11: The guest page

**Files:**
- Modify: `app/app/[locale]/property/page.tsx`

- [ ] **Step 1: Replace the paragraph with the renderer**

At line 281, the About section currently renders `{biText(p.copy, locale)}` in a `<p>`. Replace **only** the `copy` half; `details` stays a plain paragraph, since it is still a plain string:

```tsx
{/* 2 — About */}
<Section title={td("about")} plain>
  <RichText
    doc={locale === "es" ? (p.copy?.es ?? null) : (p.copy?.en ?? null)}
    photos={p.photos}
    nearby={p.nearby}
    profile={profile}
    onPhoto={openGalleryAt}
    onPlace={selectNearbyEntry}
  />
  {biText(p.details, locale) && (
    <p className="mt-3 text-[0.96875rem] leading-relaxed">{biText(p.details, locale)}</p>
  )}
</Section>
```

- [ ] **Step 2: Wire the two callbacks to what the page already has**

`openGalleryAt` and `selectNearbyEntry` are names this plan invents — the page already owns both behaviours. Find them:

```bash
cd app && grep -n "Gallery\|setActiveEntry\|profile" "app/[locale]/property/page.tsx" | head -30
```

Use the page's real gallery-open handler and the real nearby-selection setter (ADR-028 already built route drawing on entry selection), and the real active-profile state. If the gallery indexes by position rather than URL, map the URL to its index via `p.photos.findIndex`.

- [ ] **Step 3: Filter hidden photos out of the gallery**

Anywhere the page or `Gallery.tsx` builds the gallery list, exclude `hiddenFromGallery` photos. The cover-photo choice must skip them too.

**Two concrete sites, found during Task 8's survey:**

1. `app/app/[locale]/property/page.tsx:125` filters the gallery on `isFloorplan` alone — add the new flag.
2. **`PublicProjection.ToSummary` in `api/Models/PublicModels.cs` picks a listing's cover photo without excluding `HiddenFromGallery`.** This is the one that actually bites: a photo an owner deliberately kept out of the gallery — a close-up of a hob, a diagram — could become the cover image on a search card, which is the most prominent photo on the site. Fix it in the same pass, and note it is an API change, so it belongs in this task's commit even though the rest of the task is frontend.
3. **`HostProjection.ToHostProperty` in `api/Models/HostModels.cs:208-212` has the identical bug on the owner's side** — it computes `CoverUrl` filtering on `!IsFloorplan` alone, so a hidden photo sorted first becomes the owner's own portfolio-row thumbnail. Found by Task 8's reviewer, not by Task 8's own survey, which additionally misattributed `PropertyRow.tsx` as reading `PropertySummary` when it reads `HostProperty`. Lower severity than the guest-facing one — no visitor sees it — but it is the same bug class and both cover selections should be fixed together, not one now and one when someone notices.

- [ ] **Step 4: Verify**

```bash
cd app && npx tsc --noEmit && npm run build
```

On **:4280**, on a listing with a rich description:

1. Chips, figures, lists, headings and the callout all render in the page's own type.
2. A place chip shows the same figures as the neighbourhood section; clicking selects that entry.
3. A photo chip opens the gallery at that photo.
4. The profile toggle re-labels place chips.
5. A description-only photo does **not** appear in the gallery.
6. Both locales, both themes, narrow width.
7. **No editor code in the guest bundle:**

```bash
cd app && grep -rl "tiptap\|prosemirror" out/ | head
```

Expected: **no output**. Any hit means the editor is not code-split and Task 4's import graph needs breaking — dynamic-import `RichTextEditor` from `DescriptionFields`.

- [ ] **Step 5: Commit**

```bash
git add "app/app/[locale]/property/page.tsx" app/components/detail
git commit -m "feat(app): the guest page renders description documents"
```

---

### Task 12: Re-seed, and the adversarial pass

**Files:**
- Modify: `infra/local-bootstrap.mjs`
- Modify: `docs/spec/02-data-model.md`, `docs/spec/05-decision-log.md`

- [ ] **Step 1: Seed `copy` as documents**

A stored plain-string `copy` **throws on read** — `{"es": "…"}` cannot deserialize into `BilingualDoc`, so it is a `JsonException` that takes the whole property with it, not a null. Every environment holding one must be re-seeded.

In `infra/local-bootstrap.mjs`, change every seeded `copy` from `{ es: "…", en: "…" }` to document form:

```js
const doc = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
// …
copy: { es: doc("Piso luminoso en el Arrabal…"), en: doc("A bright flat in El Arrabal…") },
```

- [ ] **Step 2: Re-seed and confirm nothing throws**

```bash
node infra/local-bootstrap.mjs
```

Then load every seeded listing's detail page on :4280 and confirm none 500s. **Staging must be re-seeded before the API deploys** — note it in the PR description.

- [ ] **Step 3: The adversarial pass**

With the stack running, POST tampered payloads directly to the save endpoint — bypassing the editor, which is the whole point:

```bash
# Each should be rejected with its own code and change nothing.
# 1. a link mark          → copy_bad_mark
# 2. an unknown node type → copy_bad_node
# 3. photoRef to an off-document URL → copy_photo_unknown
# 4. a 40-deep nesting bomb → copy_too_deep
# 5. 10,000 characters      → copy_too_long
# 6. delete a photo while the description still references it → copy_photo_unknown,
#    and confirm the blob still exists afterwards
```

Write these as a checked-in script under `api/Ebrostay.Api.Tests/` or as documented `curl` commands in the PR — do not leave them as one-off shell history.

- [ ] **Step 4: Write the ADR**

Add an ADR to `docs/spec/05-decision-log.md` following ADR-029's format, carrying D1–D14 from the design. That ADR is the record; the design document elaborates it. Update `docs/spec/02-data-model.md` §2.2 with the document shape and `HiddenFromGallery`.

- [ ] **Step 5: Full verification sweep**

Work through §11 of the design document, all twelve items.

```bash
cd app && npm run build && npx tsc --noEmit && npx vitest run && npx eslint
cd .. && ~/.dotnet/dotnet build api && ~/.dotnet/dotnet test api/Ebrostay.Api.Tests
```

- [ ] **Step 6: Commit**

```bash
git add infra/local-bootstrap.mjs docs/spec
git commit -m "feat: seed description documents, and record the decision"
```

---

## Self-review notes

- **Spec coverage:** §5.1 → Tasks 6, 9. §5.2 → Task 8. §6 → Tasks 1, 4, 7. §7.1 → Tasks 4, 5, 10. §7.2 → Tasks 3, 11. §7.3 → Tasks 3, 4. §8 → Tasks 2, 7. §9 → Tasks 5, 7, 10, 12. §10 → the checkpoint split. §11 → Task 12 step 5. §13's deferred items are correctly absent.
- **Known soft spots, flagged rather than hidden:** the Tailwind token names in Tasks 3–5 and the Tiptap 3 list-package layout in Task 4 are the two places this plan guesses at facts it could not verify without running the code. Both have an explicit verification step attached rather than being presented as settled.
- **Type consistency:** `RichNode`/`RichAttrs`/`BilingualDoc` are named identically in TS and C#; the ten error codes are one list used by both sides; `hiddenFromGallery`/`HiddenFromGallery` is the single spelling throughout.

---

## Addendum, 2026-07-30 — remapping nearby ids on save (Task 9)

**The bug.** `NearbyEditor` mints client temp ids (`local-…`). On save,
`HostFunctions.cs` assigns a fresh server id to any entry it does not already
know, discarding the temp id. The description validator builds its reference
set from the *incoming* payload (D9), so a `placeRef` to a just-added place
passes validation, is stored holding the temp id, and then matches nothing.
Silent orphaning on the most ordinary flow there is: add a place, mention it,
save. Photos are unaffected — their identity is a URL the server assigns at
upload and never re-mints.

**The decision (user, 2026-07-30): the server remaps.** While rebuilding the
nearby array, record `incoming id → final id` for every entry whose id was
newly generated. Then rewrite `placeRef`/`placeCard` `entryId` attributes in
both `Copy.Es` and `Copy.En` through that map before storing.

**Why this does not violate D8 (reject, never repair).** D8 protects the
owner's *words* — silently repairing invalid content would delete what someone
wrote, with no explanation. This rewrites an identifier the server itself
minted, to point at the entry the owner actually chose. The prose is untouched
and the reference keeps its meaning; without the remap it would lose it.

**Why not accept the client's id.** ADR-028 makes entry ids server-generated so
a caller cannot point the route cache at an entry it does not own. That rule
stands; the remap works with it rather than around it.

**Order.** Validation still runs first, against the incoming ids — so a
reference to an entry that is not in the payload at all is still rejected with
`copy_place_unknown`. The remap runs after the rebuild, on already-valid data.

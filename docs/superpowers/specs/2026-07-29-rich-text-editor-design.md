# The listing description editor — design

**Date:** 2026-07-29
**Branch:** `redesign/v2`
**Status:** approved design, not yet implemented
**Scope:** `copy` on the property listing. Nothing else.

---

## 1. What this is

The listing description is a plain textarea today, and the guest page renders it
as one `<p>` ([`page.tsx:283`](../../../app/app/[locale]/property/page.tsx)).
An owner describing a kitchen cannot show it, and an owner mentioning the tram
cannot point at the stop the listing already knows the walking time to.

This replaces that field with a constrained rich-text editor whose document is a
**closed set of node types**, two of which are references into data the listing
already holds: its photos and its nearby entries. A reference stores an
identifier, never a URL, a name or a distance — those are resolved at render
from the stored document, so the text cannot carry a claim the listing does not
already make.

### Goals

- A description that is pleasant to write and reads as part of the page rather
  than as pasted content.
- References to this property's photos and nearby places, by identity.
- A style ceiling the owner cannot exceed — no colours, fonts or sizes.
- No class of user content that can execute, embed or navigate.
- A backend that re-validates everything and trusts none of it.

### Non-goals

- Rich text on any other field. `details`, `beds` and `priceNote` stay plain
  (§2 D3). Other surfaces get a slimmed-down variant later; it is not designed
  here.
- Collaborative editing, comments, suggestions, version history.
- Owner-authored links of any kind.
- Machine translation between the two languages (ADR-020 still owns that).

---

## 2. Decisions

Settled in conversation on 2026-07-29. Not open in the implementation plan.

| # | Decision | Rationale |
|---|---|---|
| D1 | **Tiptap** (ProseMirror), headless, MIT | §3. The schema *is* the allowlist, and headless means the editing surface uses our own tokens rather than fighting a vendor's chrome. |
| D2 | **Store the ProseMirror JSON document. Never HTML.** | No HTML string is ever built, on either side. The injection sink does not exist rather than being defended. §8. |
| D3 | **`copy` only.** `details` stays a plain textarea | `details` is *"short, factual, and read on the detail page as a table rather than as prose"* — the comment in `DescriptionFields.tsx` is also the reason ADR-027 leaves it ungated. A formatted block would undermine that. |
| D4 | **Replace `Copy`'s shape.** No compatibility field | ADR-016's fresh start already paid for this. A `CopyDoc`-beside-`Copy` fallback would outlive everyone who remembers why it exists, and would keep `Copy` writable and therefore validated forever. No conversion script; the seed regenerates. |
| D5 | **References store an id, resolved at render** | A photo reference holds a URL already on the document; a place reference holds a nearby entry id. Names and distances come from the stored records, so a place chip is bilingual for free and a measured distance cannot be inflated — the same posture as ADR-028 D12. |
| D6 | **No links** | Removes `href` entirely: no URL to validate, no scheme allowlist, no `rel` policy, no link-spam queue. |
| D7 | **Six block types, four reference types, two marks. Closed.** | §6. Anything absent is absent because it was decided against, not overlooked. |
| D8 | **Invalid documents are rejected, not repaired** | The existing validator returns error codes and refuses (`photo_unknown`); silent repair would delete an owner's words with no explanation. The client makes invalid states unreachable, so a rejection means a bug or tampering. |
| D9 | **References validate against the *incoming* photo and nearby arrays**, not the stored ones | One save can both delete a photo and reference it. Validating against `doc.Photos` would let a dangling reference through while `DropBlobsAsync` deletes the blob underneath it. |
| D10 | **`HiddenFromGallery`, defaulting to `false`** | Not `InGallery`. A C# `bool` defaults to `false` and no existing Cosmos document carries the field, so `InGallery` would deserialize to `false` and empty every gallery on the site. The negative name reads worse and fails safe. |
| D11 | **"Used in the description" is derived, never stored** | It is a fact about the document body. Storing it is a denormalised copy that goes stale on the next edit, and then there is a reconciliation bug to own. |
| D12 | **The callout is "Good to know", styled as an aside** | §7.3. A callout that looks like a warning invites owners to restate terms the booking engine enforces, and prose that contradicts ADR-022 is a dispute with our own UI as evidence. |
| D13 | **The guest page downloads no editor code** | The renderer is ours, ~80 lines, zero dependencies. Tiptap is loaded only inside the authenticated host editor. §4. |
| D14 | **Two checkpoints: style book first, then the vertical slice** | §10. The schema and the component are identical either way; the style-book page is fixtures. A feel-check that changes the node set after the C# validator is written means writing it twice. |

---

## 3. Library

**Tiptap 3.29.2**, MIT. `@tiptap/react`, `@tiptap/core`, `@tiptap/pm`, plus
individually-imported extensions rather than the whole starter kit.

### Why this one

**A ProseMirror schema is an allowlist that is also the data structure.** A
document cannot hold a node the schema has no definition for. Pasting from Word,
from a competitor's listing, or from a crafted page produces the same result:
everything representable is kept, everything else is dropped at the door. That
is not a filter someone has to maintain in step with the attack surface.

**Headless is the whole point of the styling constraint.** Tiptap ships no CSS.
The editing surface renders the classes we hand it, so it uses the same Tailwind
tokens as the guest page. Quill, TinyMCE and CKEditor arrive with a look and a
colour picker that then has to be removed — the constraint would be enforced by
deleting things rather than by never having them.

**Licensing is clean for this use.** Editor and extensions are MIT, including
the ten formerly-Pro extensions open-sourced in mid-2025. Only the cloud
services are paid — Comments, Snapshots, conversion, the collaboration backend —
and none are used. The removal of the free *cloud* plan in June 2025 does not
touch a self-hosted editor.

### What was rejected

- **Lexical** — a higher performance ceiling that a 4,000-character description
  will never approach, paid for in a smaller extension ecosystem and a
  lower-level plugin model.
- **Plate/Slate** — comparable capability, thinner ground under the schema.
- **Quill, TinyMCE, CKEditor** — not headless. TinyMCE is paid; CKEditor is
  GPL-or-paid.
- **A Markdown subset** — reference syntax would have to be invented, and the
  parser would be a strictly worse ProseMirror.

### Engine independence

The stored document is ProseMirror JSON, a plain tree. The C# validator and the
React renderer both walk it directly and **neither imports Tiptap**. Replacing
the editor library would change one component; it would not change the data,
the validator, the renderer or the guest page.

---

## 4. Architecture

```
HOST EDITOR (authenticated, code-split)
  DescriptionFields
    └─ RichTextEditor  ×2 (es, en)      ← Tiptap lives only here
         ├─ toolbar
         ├─ PhotoPicker    → GET photos from the working listing
         │                  → POST /api/host/properties/{id}/photos  (existing)
         └─ PlacePicker    → nearby entries from the working listing

SAVE
  PUT /api/host/properties/{id}   (existing single-save endpoint)
    └─ HostValidation.RichText    ← rejects; never repairs

GUEST PAGE (anonymous, no editor code)
  RichText renderer  ──resolves──▶ PublicPhoto[] / PublicNearby[]
```

Nothing new is added to the request path. The description saves through the
existing single-save endpoint, and the existing photo upload endpoint is the
only way bytes reach Blob Storage — the picker's Upload button calls it. A
second upload path would be a second place to get EXIF stripping wrong, and the
comment at [`PropertyDoc.cs:14`](../../../api/Models/PropertyDoc.cs) exists
because that already shipped once.

### Files

| Path | Responsibility |
|---|---|
| `app/lib/rich-text.ts` | The node vocabulary, the canonical serializer, the text-length counter. Pure — no fetching, no React. Matches `lib/nearby.ts` and `lib/pricing.ts`. |
| `app/components/ui/RichText.tsx` | The renderer. Document + resolvers → React elements. Used by the guest page. |
| `app/components/host/fields/RichTextEditor.tsx` | The editing surface. The only file that imports Tiptap. |
| `app/components/host/fields/PhotoPicker.tsx` | Pick or upload a photo, with the gallery checkbox. |
| `app/components/host/fields/PlacePicker.tsx` | Pick a nearby entry. |
| `api/Models/RichText.cs` | `RichNode`, `RichMark`, `RichAttrs`, `BilingualDoc`. |
| `api/Models/HostWrites.cs` | `HostValidation.RichText` — the walk. |

---

## 5. Data model

### 5.1 The document

```csharp
/// One node of a ProseMirror document. The shape is deliberately narrow:
/// `Attrs` is a typed record rather than a dictionary, so System.Text.Json
/// silently drops every attribute we do not name. Attribute stripping is
/// therefore structural — there is no allowlist to keep in step.
public record RichNode(
    string Type,
    RichNode[]? Content,
    string? Text,
    RichMark[]? Marks,
    RichAttrs? Attrs);

/// Marks carry no attributes at all. A link mark is not "rejected"; it is
/// unrepresentable — there is nowhere for an href to live. (D6)
public record RichMark(string Type);

public record RichAttrs(
    int? Level,       // heading, always 3
    string? Url,      // photoRef, photoFigure — must already be on the document
    string? Caption,  // photoFigure, plain text, ≤200
    string? EntryId); // placeRef, placeCard

public record BilingualDoc(RichNode? Es, RichNode? En);
```

On `PropertyDoc`, replacing the `Bilingual? Copy` field (D4):

```csharp
public BilingualDoc? Copy { get; set; }
```

`Bilingual` itself is untouched — `details`, `beds` and `priceNote` keep using
it.

**Size.** 4,000 characters of text with markup overhead is a few KB, read with
the property on every detail page load and written only on owner save. That is
an embed, like `Photos` and `Nearby`. The `properties` indexing policy should
exclude `/copy/*` for the same reason ADR-028 excluded `/nearby/*`: it is never
queried on, and every save would otherwise index the tree.

### 5.2 The photo flag

```csharp
public record PropertyPhoto(
    string Url,
    bool IsFloorplan,
    int SortOrder,
    bool HiddenFromGallery = false,   // NEW — see D10
    string? CardUrl = null,
    …);
```

`PhotoWrite` gains the same field, and `PublicPhoto` gains it so the guest
gallery can filter. `IsFloorplan` is deliberately **not** overloaded for this:
today it only stops a photo being chosen as cover
([`PhotoManager.tsx:116`](../../../app/components/host/fields/PhotoManager.tsx)),
and it does not filter the gallery at all. It is a role bit, not a visibility
bit.

**Four combinations of one stored flag and one derived fact** (D11):

| Shown in gallery | Referenced in description | Meaning |
|---|---|---|
| yes | no | ordinary listing photo |
| yes | yes | in both, which is fine |
| no | yes | a description photo — the case the flag exists for |
| **no** | **no** | **orphan** — stored, counted against `MaxPhotos`, rendered nowhere |

The fourth row is what the flag creates, and it must not be silent.
`PhotoManager` shows each photo's status, computed by walking both documents,
and badges the orphan.

---

## 6. The schema

Six block types, four reference types, two marks. Closed (D7).

### Blocks

| Node | Content | Notes |
|---|---|---|
| `doc` | block+ | root |
| `paragraph` | inline* | |
| `heading` | inline* | `level` is **always 3**. The page owns h1 and h2. |
| `bulletList` / `orderedList` | `listItem+` | |
| `listItem` | `paragraph+` | a list item holds paragraphs and nothing else, so lists cannot nest |
| `callout` | `paragraph+` | "Good to know". One variant, no type attribute. |
| `photoFigure` | atom | `url`, optional `caption` (plain text ≤200) |
| `placeCard` | atom | `entryId` |

### Inline

| Node | Notes |
|---|---|
| `text` | |
| `photoRef` | atom, `url`. Renders as a chip; opens the gallery at that photo. |
| `placeRef` | atom, `entryId`. Renders name + measured reach from `PublicNearby`. |

### Marks

`bold`, `italic`. That is the entire list.

### Absent by decision

Colour, font family, font size, text alignment, highlight — the styling ceiling
(D7). Links (D6). Tables, code blocks, horizontal rules, blockquote-as-quote,
images by URL, embeds, iframes, mentions of anything that is not this
property's own data.

### Caption is an attribute, not a content slot

A caption holds one line of plain text, so making it inline content would admit
marks, references and — through the content model — a nesting level. As an
attribute it is a length-capped string and the validator needs no special case.

---

## 7. Surfaces

### 7.1 The editor

`DescriptionFields` keeps its current structure exactly — the Spanish field, the
English panel with its `copyEnApproved` gate, and the plain `details`/`beds`
grid below. Only the two `TextAreaField`s for `copy` become `RichTextEditor`.
The approval gate is untouched: ADR-027's argument that a paragraph is the one
field long enough for a bad rendering to mislead applies more strongly to a
formatted one, not less.

```
┌ B  I │ H  • List  1. List  ▭ Note │ ▣ Photo  ◎ Place ──── 1,284 / 4,000 ─┐
│                                                                          │
│  A quiet third-floor flat in **El Arrabal**, five minutes from the river │
│  ◎ Parque del Agua · 6 min  and a short walk from the tram.              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Insertion.** `#` opens the photo picker, `@` the place picker, via Tiptap's
Suggestion utility; the toolbar buttons open the same two components. Both
pickers read from the **working listing in the editor's state**, not from the
server — so a photo uploaded a moment ago, or a nearby entry added in the
section above and not yet saved, is immediately referenceable.

**The photo picker** shows the property's photos as a grid, with an Upload
button that calls the existing endpoint. New uploads carry a checkbox, *"Also
show in the gallery"*, **not pre-ticked** — an upload begun inside the
description is a description photo until someone says otherwise, and the
checkbox is the moment the owner thinks about it at all.

**Character count is over text nodes only.** Markup is not charged, and
**neither are references** — even though a guest reads a place chip as its name.
Charging them looks fairer and is a trap: the name lives on the nearby entry, so
renaming a place in the section above would silently change the length of a
description written weeks ago, and could push it past the cap and make an
unrelated save fail with an error pointing at the wrong section. Bounding
reference count is the node cap's job (§8), not the character counter's.

**Input rules** carry most of what "pleasant to write in" means: `- ` starts a
bullet, `1. ` a numbered list, `**x**` bolds, `###` makes the heading. Free with
Tiptap and worth naming as a requirement, because it is the difference between
an editor people use and a toolbar people ignore.

**Paste** needs no custom handling. Anything the schema cannot represent is
dropped by ProseMirror on the way in — including `<img>`, which has nowhere to
land: our photo nodes take a `url` that must already be on the document, so a
pasted external image cannot become one.

**Diff and review.** `description` is already in `SECTIONS` and already
reviewable, so nothing is wired. But `FIELDS.description` currently flattens
`copy` with `bi()`, whose own comment warns that comparing objects directly
makes the result depend on key order. **That hazard is larger for a document
than for a two-key record**: a tree built by Tiptap and a tree parsed from the
API can differ in key order and in absent-versus-null at every node. So
`rich-text.ts` owns a **canonical serializer** — sorted keys, absent normalised
to null — and the differ compares that string. Without it the "changed"
indicator lights on a freshly opened page.

`FIELDS.photos` also gains `hiddenFromGallery`; it is content, like
`isFloorplan`.

### 7.2 The guest page

The About section renders the document through `RichText` instead of one `<p>`.
Everything else on the page is unchanged.

- A **`placeRef`** renders the entry's name and its reach in the guest's active
  profile, from `PublicNearby`. It is a button; clicking it scrolls to the
  neighbourhood section and selects that entry — the route-drawing behaviour
  ADR-028 already built.
- A **`photoRef`** is a chip that opens the gallery overlay at that photo.
- A **`photoFigure`** renders inline, using `DetailUrl` with the existing
  fallback to `Url`, and opens the overlay when clicked.
- A **`placeCard`** reuses the nearby card treatment.

**A reference whose target is missing renders nothing at all** — no broken
image, no placeholder, no error text. D9 makes this unreachable through the save
path, but an admin photo deletion or a projection change could still produce it,
and a guest has no use for the knowledge that a listing is internally
inconsistent.

### 7.3 The callout

Labelled **"Good to know"**, rendered as a quiet aside — a left rule and a
faint tint, no icon, no alert colour, at body size.

This is a deliberate design constraint rather than taste. The callout is
structurally the most authoritative element an owner can place on the page, and
the obvious thing to put in the most authoritative element is a rule. But stay
duration, pets, smoking and check-in are structured fields the booking engine
enforces (ADR-022, and the `terms` section), and prose that contradicts them is
a dispute in which our own UI is the evidence. ADR-027's re-review on content
edits is the backstop; the styling decides whether the backstop is exercised
ten times a day or almost never.

---

## 8. Security

The claim is not that user content is filtered well. It is that the dangerous
representations do not exist.

**No HTML is ever constructed.** The editor produces a JSON tree; the server
validates a JSON tree; the renderer maps it to React elements.
`dangerouslySetInnerHTML` appears **exactly once** in the app today —
`app/app/not-found.tsx:40`, injecting the pre-paint theme bootstrap, whose
content is a project-authored constant. **No user content reaches it, and this
feature must not add the first that does.** `@tiptap/html`'s `generateHTML` is deliberately
unused. Consequently `<script>`, `<iframe>`, `<object>`, `javascript:`,
`data:`, `srcdoc`, `onerror=` and the mXSS family have nowhere to be written
down — this is not a blocklist, it is an absence of the field.

**No URL comes from user content.** `photoRef`/`photoFigure` carry a URL that
must already be on the property document — the existing `photo_unknown` rule
([`HostWrites.cs:244`](../../../api/Models/HostWrites.cs)), reused verbatim
against the incoming array (D9). Every rendered `src` therefore originates from
`PhotoStore`. There is no user-controlled `href` at all (D6).

**Unknown attributes are dropped structurally.** `RichAttrs` is a typed record;
System.Text.Json ignores JSON properties it has no member for. An attribute we
have not named cannot survive a round trip, without an allowlist to maintain.

**The server-side walk** (`HostValidation.RichText`), rejecting on the first
failure (D8):

| Check | Code |
|---|---|
| root node is `doc` | `copy_bad_root` |
| every node type in the vocabulary, and legal for its parent | `copy_bad_node` |
| every mark in `{bold, italic}` | `copy_bad_mark` |
| `heading.level == 3` | `copy_bad_heading` |
| depth ≤ 5, node count ≤ 400 | `copy_too_deep` / `copy_too_many_nodes` |
| total text length ≤ `MaxCopyLength` (4,000) | `copy_too_long` |
| caption ≤ 200 chars, plain | `copy_bad_caption` |
| `text` nodes have no children; container nodes have no text | `copy_bad_node` |
| every `url` in the **incoming** photo set | `copy_photo_unknown` |
| every `entryId` in the **incoming** nearby set | `copy_place_unknown` |

Depth and node caps exist because recursion over an attacker-shaped tree is the
one denial-of-service this format admits; both are checked during the walk, not
after it, so a nesting bomb is refused rather than parsed.

**Related, and independent of this feature:**
`app/public/staticwebapp.config.json` defines no `globalHeaders`, so the site
ships **no Content-Security-Policy**. Nothing in this design depends on one —
that is the point of D2 — but a CSP is the backstop for the class of bug this
design is trying to make unreachable, and it should be added regardless.
Tracked separately; not in this plan.

---

## 9. Errors and limits

| Failure | Consequence |
|---|---|
| Document fails validation on save | The whole save is rejected with the specific code. Nothing is silently altered. |
| Photo upload fails inside the picker | Reported on that photo; the picker stays open; the document is untouched. |
| Reference target missing at render | That node renders nothing. §7.2. |
| Owner exceeds 4,000 characters | The editor stops accepting input at the cap and says so; the server re-checks. |
| Owner deletes a photo that the description references | The save is rejected with `copy_photo_unknown`, naming the photo. The alternative — dropping the reference silently — edits the owner's words on their behalf. |
| Legacy plain-string `copy` in a stored document | **Throws on read**, and takes the whole property with it — `{"es": "…"}` cannot deserialize into `BilingualDoc`, so it is a `JsonException`, not a null. This is not a degraded description; it is a 500 on the detail page. D4 is therefore conditional on **re-seeding every environment that holds one**: `infra/local-bootstrap.mjs` locally, and a re-seed of the staging listings as a deployment step. Verified by §11.12 before the API ships. |

---

## 10. Delivery — two checkpoints (D14)

**Checkpoint 1 — the style book. ~2 days.**
`app/lib/rich-text.ts`, `RichTextEditor.tsx`, `RichText.tsx`, and a section on
`/en/design` with fixture photos and places. English only. No API, no
persistence, no `PropertyDoc` change. The deliverable is something typeable, to
answer whether the node set is right *before* the validator is written against
it.

**Checkpoint 2 — the vertical slice. ~1.5 weeks.**
`BilingualDoc` on `PropertyDoc`, `HostValidation.RichText`, `HiddenFromGallery`
through the write path and the public projection, the two pickers wired to the
real listing, `DescriptionFields` switched over, the guest page rendering it,
the canonical serializer in the differ. Both languages. Spanish strings for the
editor chrome land here — bilingual UI is a hard requirement and the editor's
own labels are user-facing.

The schema and both components are identical across the two; checkpoint 1 is
those files plus fixtures.

---

## 11. Verification

Local stack as usual — Cosmos emulator, Azurite, SWA on **:4280** (not :3000).

1. Type a description using every node type; reload; identical document.
2. Paste a page containing `<script>`, `<iframe>`, an inline `<img>`, coloured
   and sized text → only representable content survives, no console error.
3. Insert a photo from the picker with the gallery box **unticked** → appears in
   the description, absent from the gallery, `PhotoManager` shows it as
   description-only.
4. Delete that photo's reference from the text → `PhotoManager` badges it as an
   orphan.
5. Delete a referenced photo and save → `copy_photo_unknown`, and the blob is
   **not** deleted.
6. **Tampered payload**: a `link` mark, an unknown node type, a `photoRef` to an
   off-document URL, a 40-deep nesting bomb, 10,000 characters → each rejected
   with its own code, none accepted, none repaired.
7. Reload the editor and save with no edits → the "changed" indicator stays off
   (the canonical serializer works).
8. Guest page: a `placeRef` shows the same figures as the neighbourhood section
   and selects that entry when clicked; the profile toggle re-labels it.
9. Guest bundle contains no Tiptap (`out/` grep, D13).
10. A document referencing an entry removed from `nearby` renders without it and
    without a gap.
11. Both locales, both themes, narrow width, `npm run build` green, `tsc` clean,
    lint at the pre-existing errors.
12. **No environment still holds a plain-string `copy`** — every seeded and
    staging listing loads without a `JsonException` (§9). Checked before the API
    is deployed, not after.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| **The callout becomes where owners restate terms** the engine enforces | D12: labelled "Good to know", styled as an aside, not a banner. ADR-027 re-review is the backstop. Worth re-examining after the first dozen real listings. |
| Owners format badly and listings stop looking like one site | The ceiling is the schema: no colour, no size, one heading level. The remaining failure mode is over-use of headings in a 4,000-character field, which is a copy-guidance problem, not a technical one. |
| Tiptap's bundle in the host editor | Code-split behind the authenticated route; guests download none of it (D13). Verified in §11.9. |
| ProseMirror's schema is the security boundary on the client | It is not the boundary that matters. The server walk (§8) assumes the client is hostile and re-derives every reference. |
| Two more surfaces later want this component | D3 kept the scope to one field precisely so the slim variant is designed against a real second surface rather than guessed at. |
| A photo's URL is its identity | Already true across the codebase (`photo_unknown`, `kept[p.Url]`). Consistency beats introducing a second identity scheme for one feature. |

---

## 13. Deferred

- **The slimmed-down variant** for other text surfaces. Designed when there is a
  real second surface.
- **Machine translation** between the two documents. ADR-020 keeps DeepSeek for
  it; a document-aware translation that preserves references is a harder problem
  than translating a string, and is not started here.
- **A plain-text projection of `copy`** for SEO, cards or search. Nothing
  consumes plain text today; adding it now would be speculative.
- **CSP `globalHeaders`** (§8) — worth doing, independent of this.
- **Owner copy guidance** — a short "what makes a good description" note beside
  the editor.

---

## 14. Relationship to the decision log

This design should get an **ADR in `docs/spec/05-decision-log.md`** carrying
D1–D14 in the project's own format, following ADR-029. That ADR is the record;
this document is the working design that elaborates it — the shapes, the
schema table, the failure codes, the verification list. Where the two ever
disagree, the ADR wins and this document is wrong.

It amends two existing records rather than contradicting them: **ADR-027**
(the editor's one-diff-one-save shape and the English approval gate, both
preserved) and **ADR-019** (the photo pipeline, whose upload endpoint stays the
only way bytes reach storage). `docs/spec/02-data-model.md` §2.2 gains the
document shape and the `HiddenFromGallery` field.

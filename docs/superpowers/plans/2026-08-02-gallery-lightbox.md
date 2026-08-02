# Gallery Lightbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the detail page's two half-galleries with one lightbox carrying carousel, zoom/pan, thumbnails, counter and captions, leaving a slot for the floor-plan mini-map.

**Architecture:** A single `components/detail/Lightbox.tsx` wraps `yet-another-react-lightbox`, owns our theming and label translations, and exposes an `overlay(index)` render prop through YARL's `controls` slot. Both existing entry points — the mosaic in `Gallery.tsx` and the description photo-reference in `property/page.tsx` — collapse onto it. A pure `slidesFor` mapper in `lib/photos.ts` keeps the `PropertyPhoto` → slide conversion unit-testable.

**Tech Stack:** Next.js 16 App Router (`output: "export"`), React 19.2, TypeScript, Tailwind v4 (CSS-first), next-intl, `yet-another-react-lightbox` 3.32.2 (MIT, zero deps), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-02-gallery-lightbox-design.md`

## Global Constraints

- **Bilingual ES/EN is a hard requirement.** Every user-facing string goes in `app/messages/es.json` **and** `app/messages/en.json`. Spanish is the default.
  - *Exception, already established on this page:* `app/[locale]/design/page.tsx` is an internal style book not linked from navigation, and its newer sections use literal English (see the existing `description editor` and `gallery (current)` sections). Follow that precedent there; everywhere else, translate.
- **Light and dark mode are both first-class.** Theme is `data-theme` on `<html>`; use the Tailwind `dark:` variant or `[data-theme="dark"]` in CSS. **Never** `@media (prefers-color-scheme)`.
- **Static export.** No middleware, no route handlers, no server components at runtime. `cd app && npm run build` must stay green.
- **Import `Link`/`useRouter` from `@/i18n/navigation`**, never from `next/link` or `next/navigation`.
- **`app/lib` is the only place vitest looks** (`vitest.config.ts` sets `include: ["lib/**/*.test.ts"]`, `environment: "node"`). Logic that needs a test goes in `lib/`, pure, with no DOM or React import.
- **Do not fabricate image dimensions.** YARL's `ImageSource` requires `width` *and* `height` as numbers and we store neither; the spec defers that schema change. See Task 1.
- Run `npm run lint` before every commit; it is currently clean and must stay so.
- Commit messages: lowercase `type(scope): subject` in the imperative, and end with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

## File Structure

| File | Responsibility |
| --- | --- |
| `app/lib/photos.ts` *(modify)* | Add pure `slidesFor`; fix `SIZES.lightbox`; update the deferred-`srcset` comment. |
| `app/lib/photos.test.ts` *(create)* | Unit tests for `slidesFor`. First test file for this module. |
| `app/components/detail/Lightbox.tsx` *(create)* | The only place that imports YARL. Owns plugins, labels, theming class, overlay slot. |
| `app/app/globals.css` *(modify)* | Map YARL's CSS variables onto our tokens, under `.ebrostay-lightbox`. |
| `app/messages/{es,en}.json` *(modify)* | `detail.lightbox.*` labels. |
| `app/components/detail/Gallery.tsx` *(modify)* | Mosaic tiles become buttons; chip rule fixed; grid `Dialog` deleted. |
| `app/app/[locale]/property/page.tsx` *(modify)* | Second `Dialog` deleted; photo references open the `Lightbox`. |
| `app/app/[locale]/design/page.tsx` *(modify)* | Demo section. |
| `app/e2e/pages.spec.ts` *(modify)* | One focused open/advance/close spec. |

Task order is deliberate: Task 3 puts a working lightbox on screen before either real page is touched, so the interaction can be judged early and cheaply.

---

### Task 1: `slidesFor` — the pure mapper

**Files:**
- Modify: `app/lib/photos.ts`
- Test: `app/lib/photos.test.ts` (create)

**Interfaces:**
- Consumes: `Sized` (already in `photos.ts`), `SIZES` (already exported).
- Produces:
  ```ts
  export type LightboxSlide = { src: string; alt: string };
  export function slidesFor(
    photos: readonly Sized[],
    alt: (n: number, total: number) => string,
  ): LightboxSlide[]
  ```
  Task 2 is the only consumer.

**Why `alt` is a callback:** `lib/` is pure and vitest runs it in `environment: "node"`. Importing `next-intl` here would drag React into a node test. The caller passes `(n, total) => t("photoOf", { n, total })`, matching the existing key.

**Why no `srcSet`:** YARL's `SlideImage.srcSet` is `readonly ImageSource[]` where `ImageSource.width` and `.height` are **required numbers**. We store neither — `PhotoPipeline.Encode` computes each variant's real width and discards it, which is the same gap that makes the `srcset` descriptors wrong today. So one source per slide: `detailUrl` (1600 px long edge) falling back to `url`. That is sharp on any phone and on a 1280 desktop; it is soft only when zoomed on a very large display. When the deferred schema change lands, this function grows a `srcSet` array and nothing else changes.

- [ ] **Step 1: Write the failing test**

Create `app/lib/photos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slidesFor } from "@/lib/photos";

const photo = (url: string, detailUrl: string | null = null) => ({
  url,
  cardUrl: null,
  detailUrl,
});

// The alt formatter stands in for next-intl's t("photoOf"), which cannot be
// imported here — lib/ is pure and vitest runs it under `environment: "node"`.
const alt = (n: number, total: number) => `Photo ${n} of ${total}`;

describe("slidesFor", () => {
  it("prefers the detail variant over the full-size original", () => {
    expect(slidesFor([photo("/full.webp", "/detail.webp")], alt)[0].src).toBe(
      "/detail.webp",
    );
  });

  it("falls back to url for photos that predate the pipeline", () => {
    expect(slidesFor([photo("/legacy.jpg")], alt)[0].src).toBe("/legacy.jpg");
  });

  it("numbers the alt text from one, against the total", () => {
    const slides = slidesFor([photo("/a.jpg"), photo("/b.jpg")], alt);
    expect(slides.map((s) => s.alt)).toEqual([
      "Photo 1 of 2",
      "Photo 2 of 2",
    ]);
  });

  it("preserves the order it is given", () => {
    const slides = slidesFor(
      [photo("/a.jpg"), photo("/b.jpg"), photo("/c.jpg")],
      alt,
    );
    expect(slides.map((s) => s.src)).toEqual(["/a.jpg", "/b.jpg", "/c.jpg"]);
  });

  it("handles the single-photo case the description reference uses", () => {
    expect(slidesFor([photo("/one.jpg")], alt)).toEqual([
      { src: "/one.jpg", alt: "Photo 1 of 1" },
    ]);
  });

  it("returns nothing for no photos rather than throwing", () => {
    expect(slidesFor([], alt)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

```bash
cd app && npx vitest run lib/photos.test.ts
```

Expected: failure importing `slidesFor` — *"No export named 'slidesFor'"* or similar. If it fails on the `@/lib/photos` path instead, the alias is broken and that is a different problem.

- [ ] **Step 3: Implement it**

Append to `app/lib/photos.ts`:

```ts
/** One slide as the lightbox wants it. Deliberately not YARL's `Slide` type:
 *  `lib/` stays free of component dependencies so vitest can run it in node. */
export type LightboxSlide = { src: string; alt: string };

/**
 * `PropertyPhoto`s as lightbox slides.
 *
 * One source per slide, not a `srcSet`. YARL's `ImageSource` requires a real
 * `width` AND `height` per candidate, and we store neither — `PhotoPipeline.
 * Encode` computes each variant's true width and throws it away, which is the
 * same gap behind the descriptor bug documented on `srcSet` above. Inventing
 * numbers here would put a second wrong measurement in the codebase to keep
 * the first one company.
 *
 * So: the `detail` variant (1600 px long edge), falling back to `url` for
 * photos that predate the pipeline. Sharp on any phone and on a 1280 px
 * desktop; soft only when zoomed hard on a very large display. When the real
 * dimensions are stored, this grows a `srcSet` array and nothing else moves.
 *
 * `alt` is a callback rather than a string because this module is pure — see
 * the test file for why importing next-intl here is not an option.
 */
export function slidesFor(
  photos: readonly Sized[],
  alt: (n: number, total: number) => string,
): LightboxSlide[] {
  return photos.map((photo, i) => ({
    src: photo.detailUrl ?? photo.url,
    alt: alt(i + 1, photos.length),
  }));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd app && npx vitest run lib/photos.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Fix `SIZES.lightbox`, which is about to become wrong**

In `app/lib/photos.ts`, replace the `lightbox` entry of `SIZES` (its current comment describes `ui/Dialog`'s 28rem cap, which the lightbox replaces):

```ts
  /** The lightbox draws one photo across the whole viewport. This used to say
   *  `(min-width: 28rem) 28rem, 92vw`, describing `ui/Dialog`'s fixed
   *  `w-[min(92vw,28rem)]` box — which is why "all photos" opened into a
   *  448 px window on a 1280 px screen and got SMALLER the more you asked to
   *  see. The box is gone; so is the cap. */
  lightbox: "100vw",
```

- [ ] **Step 6: Re-point the deferred-`srcset` note**

Still in `app/lib/photos.ts`, inside the long `srcSet` doc comment, replace the final sentence — *"Deliberately deferred until the gallery control is rebuilt: `SIZES` below is half of this calculation, and fixing descriptors against a layout that is about to change means measuring twice."* — with:

```
 * Deliberately deferred. The gallery control has now been rebuilt (see
 * `components/detail/Lightbox.tsx`) and this is still blocked on the same
 * thing: real per-variant widths on the photo record. It now has two
 * consumers waiting on it — these descriptors, and `slidesFor` below, which
 * cannot build a YARL `srcSet` without heights either.
```

- [ ] **Step 7: Run the whole unit suite and lint**

```bash
cd app && npm test && npm run lint
```

Expected: all suites pass, lint silent. `SIZES.lightbox` has no other consumer yet, so nothing else should move.

- [ ] **Step 8: Commit**

```bash
cd app && git add lib/photos.ts lib/photos.test.ts
git commit -m "$(cat <<'EOF'
feat(photos): photos as slides, and a sizes hint that matches the surface

slidesFor takes one source per slide rather than a srcSet: YARL's
ImageSource needs a real width AND height per candidate and we store
neither, so the alternative was inventing numbers to sit beside the
descriptors that are already wrong for the same reason.

SIZES.lightbox described ui/Dialog's 28rem box. The lightbox is
full-viewport, so the old value would have fetched a thumbnail to fill a
screen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The `Lightbox` component

**Files:**
- Create: `app/components/detail/Lightbox.tsx`
- Modify: `app/app/globals.css` (append a themed block)
- Modify: `app/messages/es.json`, `app/messages/en.json`
- Modify: `app/package.json` (the dependency)

**Interfaces:**
- Consumes: `slidesFor`, `LightboxSlide` from Task 1; `PropertyPhoto` from `@/lib/api`.
- Produces:
  ```ts
  export function Lightbox(props: {
    photos: readonly PropertyPhoto[];
    index: number | null;      // null = closed
    onClose: () => void;
    overlay?: (index: number) => React.ReactNode;
  }): React.ReactElement
  ```
  Tasks 3, 4, 5 and 6 all consume exactly this.

**Two API facts confirmed against `node_modules/yet-another-react-lightbox/dist/types.d.ts`, both of which shape the code below:**

1. `render.controls` is `RenderFunction<void>` — **it receives no arguments**. It cannot be handed the current index, so we track it ourselves through `on.view` and close over it. This is why `overlay` is `(index: number) => ReactNode` and not a plain node.
2. `carousel.imageProps` is `Omit<ImgHTMLAttributes, "src" | "alt" | "sizes" | "srcSet" | ...>` — YARL owns those four attributes, so a native `srcSet`/`sizes` string cannot be smuggled through. Task 1's single-source decision is forced, not preferred.

- [ ] **Step 1: Install the dependency**

```bash
cd app && npm install yet-another-react-lightbox
```

Expected: `yet-another-react-lightbox@^3.32.2` in `dependencies`. It has zero runtime dependencies and no postinstall script, so the `npm warn allow-scripts` notice on this machine does not apply to it. Confirm nothing else moved:

```bash
cd app && git diff --stat package.json package-lock.json
```

- [ ] **Step 2: Add the label strings**

In `app/messages/en.json`, inside the existing `detail` object (alongside `photoOf`, `allPhotos`, `floorPlan`), add:

```json
    "lightbox": {
      "previous": "Previous photo",
      "next": "Next photo",
      "close": "Close",
      "zoomIn": "Zoom in",
      "zoomOut": "Zoom out",
      "thumbnails": "Thumbnails",
      "showThumbnails": "Show thumbnails",
      "hideThumbnails": "Hide thumbnails",
      "gallery": "Photo gallery"
    },
```

And the same key in `app/messages/es.json`:

```json
    "lightbox": {
      "previous": "Foto anterior",
      "next": "Foto siguiente",
      "close": "Cerrar",
      "zoomIn": "Acercar",
      "zoomOut": "Alejar",
      "thumbnails": "Miniaturas",
      "showThumbnails": "Mostrar miniaturas",
      "hideThumbnails": "Ocultar miniaturas",
      "gallery": "Galería de fotos"
    },
```

- [ ] **Step 3: Write the component**

Create `app/components/detail/Lightbox.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import YARL from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import type { PropertyPhoto } from "@/lib/api";
import { slidesFor } from "@/lib/photos";

import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

// The one place that imports the lightbox library. Everything else on the
// detail page hands it photos and an index; if this is ever swapped out, the
// blast radius is this file.
export function Lightbox({
  photos,
  index,
  onClose,
  overlay,
}: {
  photos: readonly PropertyPhoto[];
  /** `null` is closed. Any number opens on that slide. */
  index: number | null;
  onClose: () => void;
  /** Drawn over the slide through YARL's `controls` slot — where the
   *  floor-plan mini-map will live. That slot is a zero-argument render
   *  function, so the index it needs cannot come from the library; it comes
   *  from `on.view` below. Use absolute or fixed positioning. */
  overlay?: (index: number) => React.ReactNode;
}) {
  const t = useTranslations("detail");
  const [current, setCurrent] = useState(0);

  return (
    <YARL
      /* `index` is a STARTING index only — YARL keeps its own after that.
         Without a fresh mount per opening, clicking tile 6 having previously
         opened tile 2 reopens on 2. */
      key={index ?? "closed"}
      open={index !== null}
      index={index ?? 0}
      close={onClose}
      slides={slidesFor(photos, (n, total) => t("photoOf", { n, total }))}
      plugins={[Captions, Counter, Thumbnails, Zoom]}
      on={{ view: ({ index: i }) => setCurrent(i) }}
      className="ebrostay-lightbox"
      counter={{ container: { className: "ebrostay-lightbox__counter" } }}
      thumbnails={{
        width: 96,
        height: 64,
        border: 0,
        borderRadius: 6,
        gap: 8,
        padding: 0,
        vignette: false,
      }}
      /* `scrollToZoom` makes a trackpad pinch zoom the photo instead of
         scrolling the page behind it — the gesture a laptop user will try
         first. `maxZoomPixelRatio: 2` is the honest ceiling for a 1600 px
         source (Task 1): past that it is upscaling, not zooming. */
      zoom={{ maxZoomPixelRatio: 2, scrollToZoom: true }}
      captions={{ descriptionTextAlign: "start", showToggle: false }}
      labels={{
        Previous: t("lightbox.previous"),
        Next: t("lightbox.next"),
        Close: t("lightbox.close"),
        "Zoom in": t("lightbox.zoomIn"),
        "Zoom out": t("lightbox.zoomOut"),
        Thumbnails: t("lightbox.thumbnails"),
        "Show thumbnails": t("lightbox.showThumbnails"),
        "Hide thumbnails": t("lightbox.hideThumbnails"),
        "Photo gallery": t("lightbox.gallery"),
      }}
      render={{ controls: () => overlay?.(current) ?? null }}
    />
  );
}
```

- [ ] **Step 4: Theme it**

Append to `app/app/globals.css`. Variable names are copied from the package's own CSS (`styles.css` and `plugins/*.css`) — do not guess others:

```css
/* The lightbox surround is FIXED DARK in both themes, on the same reasoning
   as the gallery chips in Gallery.tsx: it sits on photography, and a surface
   token that flips with the theme would tint the one thing the visitor came
   to look at. Chrome — thumbnails, counter, captions — still takes our radius
   and type tokens, so it reads as ours rather than as the library's. */
.ebrostay-lightbox {
  --yarl__color_backdrop: rgba(4, 8, 6, 0.94);
  --yarl__color_button: rgba(255, 255, 255, 0.82);
  --yarl__color_button_active: #ffffff;
  --yarl__color_button_disabled: rgba(255, 255, 255, 0.28);

  --yarl__counter_color: rgba(255, 255, 255, 0.9);
  --yarl__counter_top: 0;
  --yarl__counter_bottom: unset;

  --yarl__slide_title_color: #ffffff;
  --yarl__slide_description_color: rgba(255, 255, 255, 0.78);
  --yarl__slide_captions_container_background: linear-gradient(
    to top,
    rgba(4, 8, 6, 0.72),
    transparent
  );

  --yarl__thumbnails_container_background_color: rgba(4, 8, 6, 0.94);
  --yarl__thumbnails_thumbnail_background: transparent;
  --yarl__thumbnails_thumbnail_border_radius: var(--radius-control);
  --yarl__thumbnails_thumbnail_active_border_color: #ffffff;
}

/* The counter is a measurement, so it uses the same face as every other
   number on the detail page rather than the library's default. */
.ebrostay-lightbox__counter {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.8125rem;
  letter-spacing: 0.04em;
}
```

Before writing this, check what the project's mono face is actually called:

```bash
cd app && grep -n "font-mono\|--font-" app/globals.css | head
```

If the token has a different name, use the real one and drop the fallback. If the page has no mono token, delete the `font-family` line rather than inventing a variable.

- [ ] **Step 5: Verify it compiles and the bundle is sane**

```bash
cd app && npm run lint && npm run build
```

Expected: lint silent, build green. Nothing renders the component yet, so this only proves the imports, the CSS and the types.

- [ ] **Step 6: Commit**

```bash
cd app && git add package.json package-lock.json components/detail/Lightbox.tsx app/globals.css messages/es.json messages/en.json
git commit -m "$(cat <<'EOF'
feat(detail): one lightbox, and one file that knows which library it is

Wraps yet-another-react-lightbox with our plugins, labels and theming.
render.controls takes no arguments, so the current index is tracked here
and closed over — that is what makes overlay(index) the shape the
floor-plan mini-map can later plug into without reopening this file.

The surround is fixed dark in both themes, on the same reasoning the
gallery chips already use: it sits on photography.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: See it work — the design-page demo

Deliberately before the real pages: this is the cheapest place to judge the interaction, and if something about YARL is wrong we find out having touched nothing a visitor can reach.

**Files:**
- Modify: `app/app/[locale]/design/page.tsx`

**Interfaces:**
- Consumes: `Lightbox` from Task 2; the existing `GALLERY_PHOTOS` constant added on 2026-08-02.

- [ ] **Step 1: Import the component**

Add beside the existing `Gallery` import near the top of `app/app/[locale]/design/page.tsx`:

```tsx
import { Lightbox } from "@/components/detail/Lightbox";
```

- [ ] **Step 2: Add the open-index state**

Inside the page component, beside the existing `const [dialogOpen, setDialogOpen] = useState(false);`:

```tsx
const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
```

- [ ] **Step 3: Add the section**

Insert immediately **after** the existing `{/* Gallery — the control the lightbox spec replaces */}` section and before `{/* Description editor */}`:

```tsx
      {/* Lightbox — the replacement */}
      <section className="mt-14">
        <div className="ledger-rule"><span>lightbox</span></div>
        <p className="mt-4 max-w-2xl text-sm text-muted">
          The same eight photos. Carousel, pinch/scroll zoom with pan,
          thumbnail strip, counter, and arrow-key and Esc handling. The
          captions below are invented — the field does not exist on{" "}
          <code>PropertyPhoto</code> yet, and wiring it is deferred with the
          rest of the photo-to-plan model. The fixed panel bottom-right is a
          stand-in for the floor-plan mini-map, drawn through the{" "}
          <code>overlay</code> slot to prove the position is usable.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {GALLERY_PHOTOS.map((photo, i) => (
            <button
              key={photo.url}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="overflow-hidden rounded-(--radius-control) border border-line"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-20 w-28 object-cover" />
            </button>
          ))}
        </div>
        <Lightbox
          photos={GALLERY_PHOTOS}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          overlay={(i) => (
            <div className="absolute bottom-28 right-4 rounded-(--radius-card) bg-white/95 px-4 py-3 text-[0.8125rem] font-semibold text-[#15251f] shadow-(--shadow-card)">
              floor plan slot · photo {i + 1}
            </div>
          )}
        />
      </section>
```

- [ ] **Step 4: Verify in the browser**

The dev stack should already be running on `:4280` (`app-dev` and `swa` in `.claude/launch.json`). Open `http://localhost:4280/en/design`, scroll to `LIGHTBOX`, and confirm each of these by hand:

1. Clicking the third thumbnail opens on photo 3, and the counter reads `3 / 8`.
2. Arrow keys advance; `Esc` closes.
3. Scroll/trackpad-pinch zooms the photo rather than scrolling the page behind it; dragging pans while zoomed.
4. The thumbnail strip highlights the active slide and jumps when clicked.
5. The `floor plan slot` panel stays put while slides change, and its number tracks the counter — this is what proves `on.view` is feeding `render.controls`.
6. Switch to `/es/design` and confirm the button titles are Spanish (hover the arrows).
7. Toggle light/dark with the header control: the surround stays dark in both, and nothing else on the page breaks.
8. Narrow the window to phone width and confirm the strip and toolbar stay usable.

Check the browser console is clean, allowing only the known dev-only theme-bootstrap script-tag error.

- [ ] **Step 5: Lint, build, and the full test suites**

```bash
cd app && npm run lint && npm run build && npm test && npm run test:e2e
```

Expected: all green. The design page is already in the e2e route sweep, so this catches a render-time throw immediately. If e2e goes broadly red across unrelated pages, redirect the whole run to a file and grep for `Unexpected non-whitespace` before diagnosing — that signature is a known torn-manifest race, not this change.

- [ ] **Step 6: Commit**

```bash
cd app && git add "app/[locale]/design/page.tsx"
git commit -m "$(cat <<'EOF'
feat(design): the lightbox next to the thing it replaces

Side by side on the style book, on the same eight photos, so the
before/after is one scroll apart. The overlay slot is exercised with a
stand-in panel — the point is proving the position is usable and that
render.controls tracks the active slide, since it takes no arguments and
learns the index only from on.view.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rewire `Gallery` — and fix the mobile dead end

**Files:**
- Modify: `app/components/detail/Gallery.tsx`

**Interfaces:**
- Consumes: `Lightbox` from Task 2.
- Produces: no signature change — `Gallery({ photos, hasFloorplan, name })` keeps its props. `name` becomes unused once the `Dialog` goes; **keep the prop and mark it** rather than changing the call site in this task (Task 5 owns that file).

**The bug being fixed (spec §1):** the chip is gated on `photos.length > tiles.length + 1` where `tiles = rest.slice(0, 4)`, so it counts what the *desktop* mosaic hides. The four tiles are `hidden sm:block`, so below `40rem` only the hero renders. A five-photo home on a phone therefore shows one photo, offers no chip, and has no clickable tiles — four photos with no route to them.

- [ ] **Step 1: Replace the file body**

Rewrite `app/components/detail/Gallery.tsx` as follows. The `Frame` component keeps its `sizes` reasoning intact; what changes is that it is now wrapped in a button, the `Dialog` is gone, and the chip's condition counts photos rather than tiles.

```tsx
"use client";

import { useState } from "react";
import { Images, Ruler } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PropertyPhoto } from "@/lib/api";
import { SIZES, srcSet } from "@/lib/photos";
import { Lightbox } from "@/components/detail/Lightbox";

// A 2fr/1fr/1fr mosaic: one hero frame plus four supporting tiles. Anything
// past the fifth photo lives behind "All N photos" rather than making the
// visitor scrub a carousel to find out what the kitchen looks like.
export function Gallery({
  photos,
  hasFloorplan,
}: {
  photos: PropertyPhoto[];
  hasFloorplan: boolean;
}) {
  const t = useTranslations("detail");
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (photos.length === 0) return null;
  const [hero, ...rest] = photos;
  const tiles = rest.slice(0, 4);

  // The mosaic only earns its shape with enough photos to fill it; with one or
  // two, a grid of empty tracks is just dead space around the picture.
  const layout =
    tiles.length >= 3
      ? "sm:grid-cols-[2fr_1fr_1fr] sm:grid-rows-2"
      : tiles.length >= 1
        ? "sm:grid-cols-2"
        : "";

  return (
    <>
      <div className="relative">
        <div
          className={`grid h-[380px] grid-cols-1 gap-2.5 overflow-hidden rounded-(--radius-card) ${layout}`}
        >
          <Frame
            photo={hero}
            alt={t("photoOf", { n: 1, total: photos.length })}
            className={tiles.length >= 3 ? "sm:row-span-2" : ""}
            sizes={SIZES.hero}
            onClick={() => setOpenAt(0)}
          />
          {tiles.map((photo, i) => (
            <Frame
              key={photo.url}
              photo={photo}
              alt={t("photoOf", { n: i + 2, total: photos.length })}
              className="hidden sm:block"
              onClick={() => setOpenAt(i + 1)}
            />
          ))}
        </div>

        <div className="absolute bottom-3 right-3 flex gap-2">
          {/* Counts PHOTOS, not tiles. The previous rule compared against the
              four supporting tiles — which are `hidden sm:block` — so a
              five-photo home on a phone showed one photo, hid the chip, and
              left the other four unreachable. */}
          {photos.length > 1 && (
            <PhotoButton onClick={() => setOpenAt(0)}>
              <Images size={15} strokeWidth={2} aria-hidden />
              {t("allPhotos", { count: photos.length })}
            </PhotoButton>
          )}
          {hasFloorplan && (
            <PhotoButton
              onClick={() =>
                document
                  .getElementById("floor-plan")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <Ruler size={15} strokeWidth={2} aria-hidden />
              {t("floorPlan")}
            </PhotoButton>
          )}
        </div>
      </div>

      <Lightbox
        photos={photos}
        index={openAt}
        onClose={() => setOpenAt(null)}
      />
    </>
  );
}

function Frame({
  photo,
  alt,
  className = "",
  sizes = SIZES.tile,
  onClick,
}: {
  photo: PropertyPhoto;
  alt: string;
  className?: string;
  /** How wide this frame is actually drawn. The hero is twice the others, and
   *  one shared value would make the tiles fetch the hero's size. */
  sizes?: string;
  onClick: () => void;
}) {
  return (
    /* A button, not a div: these open the lightbox, so they must be
       focusable and answer Enter and Space. They were bare divs until
       2026-08-02, which meant a keyboard user had no way into the gallery
       at all. */
    <button
      type="button"
      onClick={onClick}
      aria-label={alt}
      className={`block cursor-zoom-in overflow-hidden bg-surface-2 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized */}
      <img
        src={photo.detailUrl ?? photo.url}
        srcSet={srcSet(photo)}
        sizes={sizes}
        alt=""
        decoding="async"
        className="h-full w-full object-cover"
      />
    </button>
  );
}

function PhotoButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      /* Sits on photography in both themes, so the chip is fixed white/ink
         rather than a theme-flipping surface token. */
      className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-[0.8125rem] font-semibold text-[#15251f] shadow-(--shadow-card) transition-colors duration-(--dur-standard) hover:bg-white"
    >
      {children}
    </button>
  );
}
```

Three details in the above that are easy to get wrong:

- The `alt` moved from the `<img>` to the button's `aria-label`, and the image is now `alt=""`. A labelled button wrapping a labelled image announces the same text twice.
- `loading="lazy"` is gone with the `Dialog` that needed it. The mosaic is above the fold; the comment that justified `lazy` described photos behind a click, which no longer exist here.
- `name` is dropped from the props. `property/page.tsx` still passes it — that is a TypeScript error you will fix in Task 5, and it is deliberate that the compiler points at it.

- [ ] **Step 2: Confirm the expected compile error, and only that one**

```bash
cd app && npx tsc --noEmit
```

Expected: exactly one error, in `app/[locale]/property/page.tsx`, saying `name` is not assignable to the `Gallery` props. Any other error is yours to fix now.

- [ ] **Step 3: Fix the call site**

In `app/app/[locale]/property/page.tsx`, at the `<Gallery …>` usage (around line 414), drop the `name` prop:

```tsx
        <Gallery photos={gallery} hasFloorplan={!!floorplan} />
```

- [ ] **Step 4: Verify in the browser**

```bash
cd app && npx tsc --noEmit && npm run lint
```

Then open a property with several photos. The seeded homes carry one photo each, so use the design page's `GALLERY (CURRENT)` section — which renders this same component — at `http://localhost:4280/en/design`:

1. Clicking the hero opens the lightbox on photo 1; clicking the fourth tile opens on photo 4.
2. Tab reaches every tile and Enter opens it.
3. Narrow below `40rem`: only the hero shows, **and the chip is still there** — this is the bug fixed. Click it and reach all eight photos.
4. With exactly one photo the chip is absent and the hero still opens on click.

- [ ] **Step 5: Full suites**

```bash
cd app && npm run build && npm test && npm run test:e2e
```

- [ ] **Step 6: Commit**

```bash
cd app && git add components/detail/Gallery.tsx "app/[locale]/property/page.tsx"
git commit -m "$(cat <<'EOF'
fix(detail): a photo you cannot reach is a photo you do not have

The chip counted what the DESKTOP mosaic hides, but the four supporting
tiles are hidden below 40rem — so a five-photo home on a phone showed one
photo, hid the chip, and left the rest with no route at all. It now counts
photos.

The tiles become buttons, so they open the lightbox and answer a keyboard;
as bare divs they did neither. The grid dialog is gone: the strip inside
the lightbox is the same answer to "how do I reach photo 14", and keeping
both meant keeping two galleries.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Rewire the property page's second dialog

**Files:**
- Modify: `app/app/[locale]/property/page.tsx`

**Interfaces:**
- Consumes: `Lightbox` from Task 2.

**Context:** the page keeps a `lightboxPhoto` state and a separate `Dialog` (around line 764) opened when a description references a photo via `components/ui/RichText.tsx`. Because `ui/Dialog` is a fixed `w-[min(92vw,28rem)]`, that reference currently opens a 448 px thumbnail. A referenced photo may be `hiddenFromGallery`, so it is not necessarily in the `gallery` array — which is why this opens a one-photo lightbox rather than seeking within the gallery.

- [ ] **Step 1: Read the current wiring before changing it**

```bash
cd app && grep -n "lightboxPhoto\|setLightboxPhoto" "app/[locale]/property/page.tsx"
```

Note every occurrence: the `useState`, whatever passes the setter into `RichText`, and the `Dialog` at the bottom. All of them are in play.

- [ ] **Step 2: Swap the state's type**

Change the declaration from a photo to a list-plus-index, because `Lightbox` takes photos and an index:

```tsx
  // A photo referenced from the description. Its own one-item lightbox rather
  // than an index into `gallery`, because a referenced photo may be
  // hiddenFromGallery and so absent from that array entirely.
  const [referenced, setReferenced] = useState<PropertyPhoto | null>(null);
```

Rename every `setLightboxPhoto` call to `setReferenced`, and every `lightboxPhoto` read to `referenced`.

- [ ] **Step 3: Replace the `Dialog` with the `Lightbox`**

Delete the whole `<Dialog open={!!lightboxPhoto} …>` block at the end of the file and put this in its place:

```tsx
      <Lightbox
        photos={referenced ? [referenced] : []}
        index={referenced ? 0 : null}
        onClose={() => setReferenced(null)}
      />
```

- [ ] **Step 4: Remove imports that are now unused**

`Dialog`, and `SIZES`/`srcSet` if the deleted block was their last use in this file. Let lint tell you rather than guessing:

```bash
cd app && npm run lint
```

Expected: it names any now-unused import. Remove exactly those.

- [ ] **Step 5: Verify**

```bash
cd app && npx tsc --noEmit && npm run lint && npm run build
```

Then in the browser: open a property whose description references a photo (the local seed's `pedro1` description contains a place reference; if no photo reference exists in seed data, add one temporarily through the host editor's description field, check the behaviour, and revert it). The referenced photo must open **full-screen**, not at 28rem.

- [ ] **Step 6: Full suites and commit**

```bash
cd app && npm test && npm run test:e2e
git add "app/[locale]/property/page.tsx"
git commit -m "$(cat <<'EOF'
fix(detail): a photo named in the description opens at full size

It opened into ui/Dialog's fixed 28rem box, so following a reference in
the text gave you a thumbnail. It gets the same lightbox as everything
else now — as a one-item list, because a referenced photo can be
hiddenFromGallery and so is not always in the gallery array.

Second of the two half-galleries; the page now has one photo surface.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The open animation (spec §5 — the part that may not work)

**Files:**
- Modify: `app/components/detail/Gallery.tsx`
- Modify: `app/app/globals.css`

**This task is allowed to fail.** Spec §5 states the risk plainly: `document.startViewTransition` needs the destination slide painted in the same frame the state flips, and YARL mounts through a portal and loads its image asynchronously. If the transition captures an empty slide, **revert this task and say so** — the fallback is YARL's default cross-fade, which is where we are after Task 4. Do not spend more than a timebox on rescuing it, and do not ship a flicker to avoid admitting it did not land.

**Interfaces:**
- Consumes: the `openAt` state from Task 4.

- [ ] **Step 1: Add the helper**

At the top of `app/components/detail/Gallery.tsx`, below the imports:

```tsx
/** Flip state inside a View Transition where the browser has one.
 *
 *  Progressive enhancement, deliberately with no fallback branch: without
 *  `startViewTransition` this is a plain call and the lightbox cross-fades,
 *  which is exactly YARL's default. Support is ~88% (Chrome/Edge 111+,
 *  Safari 18+, Firefox 144+), so the enhanced path is the common one and the
 *  plain path is still correct.
 *
 *  `flushSync` is required: the transition snapshots the DOM when the
 *  callback returns, and React would otherwise batch the update to after
 *  that, capturing the old frame twice. */
function withTransition(update: () => void) {
  const start = (
    document as Document & {
      startViewTransition?: (cb: () => void) => unknown;
    }
  ).startViewTransition;
  if (!start) return update();
  start.call(document, () => flushSync(update));
}
```

Add `import { flushSync } from "react-dom";` to the imports.

- [ ] **Step 2: Route the openers through it**

Replace each `onClick={() => setOpenAt(n)}` in `Gallery.tsx` with `onClick={() => withTransition(() => setOpenAt(n))}` — the hero, the tiles, and the chip. Leave `onClose` alone for now; closing is Step 5.

- [ ] **Step 3: Name the shared elements**

In `app/app/globals.css`:

```css
/* The clicked tile and the slide it becomes are the SAME element as far as
   the browser is concerned, which is what makes the photo appear to grow out
   of the mosaic rather than fade in on top of it. */
.ebrostay-lightbox .yarl__slide_current img {
  view-transition-name: lightbox-photo;
}

@media (prefers-reduced-motion: reduce) {
  /* A photo flying across the viewport is exactly the kind of motion this
     setting exists to refuse. */
  .ebrostay-lightbox .yarl__slide_current img {
    view-transition-name: none;
  }
}
```

The clicked tile needs the same name, applied only while it is the one being opened. In `Gallery.tsx`, give `Frame` an `active: boolean` prop and set `style={active ? { viewTransitionName: "lightbox-photo" } : undefined}` on its `<img>`; a tile is active when its index equals `openAt`. **Two elements must never hold the same `view-transition-name` in the same captured frame** — if the console warns about a duplicate, that is this invariant being violated, and the fix is to clear the tile's name once the lightbox is open.

- [ ] **Step 4: Measure whether it actually landed**

This is the whole point of the task, so measure rather than eyeball. In the browser on `/en/design`:

```js
// Paste in the console, then click a tile.
performance.getEntriesByType("paint");
```

Better: record a slow-motion capture with DevTools' Performance panel at 4× CPU throttling and step the frames. What you are looking for is the photo **scaling from the tile's rect to the slide's rect**. What tells you it failed is the photo appearing at full size on frame one with only the backdrop fading, or a single blank frame at the start.

Test on: Chrome (enhanced), and Firefox or Safari if available (either enhanced on current versions, or the plain fallback — both acceptable).

- [ ] **Step 5: If it landed, do the closing transition too; if not, revert**

If Step 4 shows the growth: route `onClose` through `withTransition` as well and re-measure the close.

If Step 4 shows a blank frame or no scaling:

```bash
cd app && git checkout components/detail/Gallery.tsx app/globals.css
```

and record the outcome in the spec — append to §5 what you measured, on which browsers, and that D7 is withdrawn. **That is a successful outcome of this task, not a failure of it.**

- [ ] **Step 6: Verify and commit (either way)**

```bash
cd app && npm run lint && npm run build && npm test && npm run test:e2e
```

If it landed:

```bash
cd app && git add components/detail/Gallery.tsx app/globals.css
git commit -m "$(cat <<'EOF'
feat(detail): the photo grows out of the mosaic instead of appearing over it

View Transitions where the browser has them (~88%), and the library's own
cross-fade where it does not — so there is no fallback branch to keep
working. flushSync is load-bearing: the transition snapshots when the
callback returns, and a batched update would capture the old frame twice.

Honoured prefers-reduced-motion, which is what a photo flying across the
viewport is for.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

If it did not, commit only the spec amendment, with a message saying what was measured and on what.

---

### Task 7: The e2e spec

**Files:**
- Modify: `app/e2e/pages.spec.ts`

**Context:** the existing sweep enumerates routes and asserts each *renders* without a console error. It never interacts, so nothing in it would catch a lightbox that opens blank or a counter stuck at 1. This adds one focused test against the design page, which already serves eight photos from `public/brand` and needs no fixture.

- [ ] **Step 1: Read the file's existing conventions first**

```bash
cd app && sed -n '130,220p' e2e/pages.spec.ts
```

Match how it builds URLs, how it applies `stubBackend`, and how it asserts console cleanliness. Do not invent a second style beside it.

- [ ] **Step 2: Append the test**

At the end of `app/e2e/pages.spec.ts`:

```ts
// The route sweep above only LOADS pages. This is the one interaction test:
// the lightbox is the detail page's main control and every failure mode worth
// having (opens blank, counter stuck, Esc dead) survives a page that renders
// fine. The design page is the target because it serves eight photos from
// public/brand with no fixture and no seeded data behind it.
test("the lightbox opens, advances and closes", async ({ page }) => {
  await stubBackend(page);
  await page.goto("/en/design/");

  const strip = page.locator("section", { hasText: "lightbox" }).last();
  await strip.getByRole("button").nth(2).click();

  const counter = page.locator(".yarl__counter");
  await expect(counter).toHaveText("3 / 8");

  await page.keyboard.press("ArrowRight");
  await expect(counter).toHaveText("4 / 8");

  // The overlay slot gets no arguments from the library and learns the index
  // from on.view — if that wiring breaks, this is the assertion that notices.
  await expect(strip.getByText("floor plan slot · photo 4")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(counter).toHaveCount(0);
});
```

- [ ] **Step 3: Run it alone first**

```bash
cd app && npx playwright test -g "lightbox opens"
```

Expected: PASS. If the counter text does not match, read what it actually renders — the separator is YARL's default and this asserts `3 / 8`; adjust the assertion to the real separator rather than forcing the separator to match the test.

- [ ] **Step 4: Run the whole suite**

```bash
cd app && npm run test:e2e 2>&1 | tee /tmp/e2e.log | tail -20
```

Expected: green. If it goes broadly red across unrelated pages, `grep "Unexpected non-whitespace" /tmp/e2e.log` — hits mean the known torn-manifest race, not this change; zero hits mean it is something real.

- [ ] **Step 5: Commit**

```bash
cd app && git add e2e/pages.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): the sweep loads pages, so nothing watched the lightbox work

Opens on the clicked photo, advances, checks the counter and the overlay's
index, and closes on Esc. Every one of those fails silently on a page that
renders perfectly, which is all the route sweep can see.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The Fancybox comparison — local only, never merged

The spec (§6, D2) commits to comparing against Fancybox before settling. Do this **after** Tasks 1–7, so the comparison is against a finished YARL implementation rather than a sketch.

**Licence constraint, and it is not optional:** `@fancyapps/ui` is not free for commercial use. The design page deploys with the app, so this work **must not reach `redesign/v2` or any deployed environment** before a €29 Single licence is bought. Local evaluation is permitted; deployment is use.

**Files:**
- Create: nothing on `redesign/v2`. Work on a throwaway branch.

- [ ] **Step 1: Branch, so this cannot be merged by accident**

```bash
cd /Users/raphael/Documents/Projects/home && git checkout -b spike/fancybox-comparison
```

- [ ] **Step 2: Install and build the smallest possible comparison**

```bash
cd app && npm install @fancyapps/ui
```

Add a second section to `app/[locale]/design/page.tsx` driving Fancybox over the same `GALLERY_PHOTOS`, with the same four things enabled: thumbnails, counter, zoom, captions. Fancybox is vanilla, so it needs a `useEffect` that binds on mount and destroys on unmount — that wrapper is itself part of what is being evaluated, so write it honestly rather than minimally.

- [ ] **Step 3: Answer the three questions from spec §6, and only those**

1. **Open animation.** Side by side with the YARL section: does Fancybox's native transition beat what Task 6 produced (or beat the plain cross-fade, if Task 6 was reverted)?
2. **Overlay slot.** Can the floor-plan stand-in be positioned and made interactive over the Fancybox slide as easily as `render.controls` allowed?
3. **Theming reach.** How close to our tokens does it get before the CSS turns into a fight with `!important`?

- [ ] **Step 4: Write up the comparison and stop**

Append a `§6.1 Prototype outcome` to `docs/superpowers/specs/2026-08-02-gallery-lightbox-design.md` answering those three, with a recommendation.

- [ ] **Step 5: Report and await a decision — do not merge either way**

```bash
cd /Users/raphael/Documents/Projects/home && git add -A && git commit -m "$(cat <<'EOF'
spike(detail): fancybox beside the shipped lightbox, for comparison only

NOT FOR MERGE. @fancyapps/ui is not free for commercial use and the design
page deploys with the app, so this branch must not reach redesign/v2 or a
deployed environment before a licence is bought.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git checkout redesign/v2
```

Present the write-up. If Fancybox wins, the licence gets bought **and** its terms confirmed in writing (spec §8) before any of it moves; if YARL wins, delete the branch.

---

## Self-Review

**Spec coverage.** §1's three defects → Tasks 4 (mobile dead end, unclickable tiles), 5 (28rem cap on references), 1 (`SIZES.lightbox`). §2 out-of-scope items stay out and are re-pointed in Task 1 Step 6. D1 → Task 2. D2 → Task 8. D4 `overlay` slot → Task 2, exercised in Task 3, asserted in Task 7. D5/D5a → Task 4. D6 fixed-dark → Task 2 Step 4. D7 View Transitions → Task 6, with the withdrawal path spelled out. §4's `slidesFor` → Task 1. §9's three test layers → Tasks 1 (vitest), 7 (Playwright), and the manual checks in Tasks 3, 4, 5, 6.

**Two spec claims corrected by reading the library's types**, both recorded in Task 1 and Task 2 rather than left to be discovered mid-implementation:

- The spec implied `srcSet` would carry over unchanged. It cannot: `ImageSource` requires `width` *and* `height`, and `carousel.imageProps` explicitly omits `src`/`srcSet`/`sizes`. One source per slide, and the deferred schema change gains a second consumer.
- The spec described `overlay(index)` without noting that `render.controls` takes **no arguments**. The index must be tracked locally through `on.view`. Task 2 does this and Task 7 asserts it, because it is exactly the kind of wiring that silently freezes at photo 1.

**Type consistency.** `slidesFor(photos, alt)` and `LightboxSlide` are defined in Task 1 and consumed only in Task 2. `Lightbox`'s four props are fixed in Task 2 and used identically in Tasks 3, 4 and 5. `openAt` is the state name in Task 4 and Task 6; `referenced` in Task 5. `Gallery`'s `name` prop is dropped in Task 4 with the resulting compile error made an explicit step rather than a surprise.

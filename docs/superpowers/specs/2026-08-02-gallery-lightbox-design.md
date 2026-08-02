# Gallery lightbox — one photo surface, with room for the plan

> Design spec, 2026-08-02. Branch `redesign/v2`.
> Resolves the deferral recorded in `app/lib/photos.ts` ("deliberately deferred
> until the gallery control is rebuilt"). This is that rebuild.

## 1. Why

The detail page has **two half-galleries and no lightbox**:

1. `components/detail/Gallery.tsx` renders a 2fr/1fr/1fr mosaic. "All N photos"
   opens a `Dialog` containing a scrollable **grid** — no carousel, no zoom, no
   captions, no keyboard navigation. Worse, `ui/Dialog`'s class is a fixed
   `w-[min(92vw,28rem)]`, so on a 1280 px desktop the grid of every photo in
   the home is a **448 px box using a third of the screen** (measured
   2026-08-02 against the design-page demo). The photos get smaller when you
   ask to see more of them.
2. `app/[locale]/property/page.tsx` keeps a *second*, unrelated `Dialog` holding
   a **single** photo, opened when a description references a photo
   (`components/ui/RichText.tsx`). It is capped at `min(92vw, 28rem)` by
   `ui/Dialog`'s fixed class, so a photo reference opens a thumbnail.

**On a phone, some photos are unreachable entirely.** The mosaic's four
supporting tiles are `hidden sm:block`, so below `40rem` only the hero renders.
But the "All N photos" chip is gated on `photos.length > tiles.length + 1`,
where `tiles` is `rest.slice(0, 4)` — it counts what the *desktop* mosaic
hides. At exactly five photos that is `5 > 5`, false, so the chip does not
render; on desktop this is right, because all five are on screen. On a phone
four of those five are not on screen, the tiles are not clickable (`Frame` is a
bare `div` + `img` with no handler), and there is **no route to them at all**.

This closes with the rest of it: once both entry points open the lightbox, the
rule becomes "more than one photo" rather than "more than the desktop mosaic
shows". Written down here because the odd-looking condition is otherwise the
kind of thing that gets fixed silently and re-broken later.

A visitor who wants to see photo 14 of 20 has no path to it that is not
scrolling a grid and squinting. For a page whose entire job is to make someone
confident enough to commit to a month's rent sight-unseen, the photos are the
product, and they are currently the weakest surface on the page.

## 2. Scope

**In scope.** A single lightbox component replacing both dialogs; carousel,
zoom/pan, thumbnail strip, counter, caption wiring, lazy loading; theming to our
tokens in light and dark; ES/EN labels; the open animation; and the
`SIZES.lightbox` correction that falls out of the surface changing size.

**Out of scope**, needing its own spec — see §7:

- **The photo-to-plan model**: floors, rooms, photo→room mapping, pin
  coordinates on a plan, several plans per home, and the host UI to author all
  of it. The lightbox ships with the *slot* this renders into (D4) and the
  design-page demo fakes its contents, so the interaction can be judged before
  the data model is committed to.
- **The bilingual caption field** (`PropertyPhoto.caption`) end-to-end. The
  caption *plugin* is wired now against a field that does not exist yet, so
  landing it later is a projection change and nothing else.
- **The `srcset` descriptor bug** documented at length in `lib/photos.ts`.
  Fixing it needs each variant's real width stored on the photo record, which
  is the same schema change deferred above. The comment there is updated to
  point at this component rather than at a rebuild that has now happened.

## 3. Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | **`yet-another-react-lightbox`** (MIT, v3.32.2, ~480k/wk, zero runtime deps, 11.7 kB gz core) | The only permissively-licensed, actively-maintained candidate covering requirements #2–#8 out of the box, with React 19 in its peer range. (Its `srcSet` support turned out not to carry the existing `srcset`/`sizes` work over — see §4: it needs `width` and `height` per candidate, which we do not store — but the decision stands on the grounds above regardless.) |
| D2 | Evaluate **Fancybox v6** (`@fancyapps/ui`) as a paid alternative before committing | It ships the open transition (#1) natively rather than as our own View Transitions gamble, and is the more polished product. €29 one-time Single licence. See §6 for what the prototype must settle and §8 for the licence reading. |
| D3 | Rejected: **fslightbox-react** (thumbnails, captions and zoom are all paid Pro), **Swiper** (a carousel, not a lightbox — we would hand-build the shell and still ship 19 kB), **lightGallery** (GPLv3 or paid; copyleft on our bundle), **react-photo-view** (Apache-2.0 and it has the open animation natively, but last released 2025-01-05 with an open, unanswered *"It's not work in React19.x"* report), **PhotoSwipe** (requires predefined width/height per image, which we do not store — see D8) | Recorded so the next person does not re-run this search. |
| D4 | The lightbox takes an **`overlay(index)` render prop**, passed through YARL's `render.controls` slot | The mini-map becomes our own component layered on top. Nothing inside the lightbox knows what a floor plan is, so the deferred model in §7 lands without reopening this component. |
| D5a | The mosaic tiles become **buttons**, and the chip's visibility rule becomes `photos.length > 1` | Fixes the mobile dead end in §1. The tiles are focusable and keyboard-operable, which the current `div` + `img` is not. |
| D5 | **Delete** the grid `Dialog`; both entry points open the lightbox directly | The thumbnail strip and the grid are two answers to "how do I reach photo 14". Keeping both leaves two galleries in the codebase, which is the problem this spec exists to end. |
| D6 | The surround is **fixed dark in both themes** | Established precedent: the gallery chips at `Gallery.tsx:145` are already "fixed white/ink rather than a theme-flipping surface token" *because they sit on photography*. A lightbox is nothing but photography. Chrome — thumbnail rail, caption bar, buttons — still takes our radius and type tokens. |
| D7 | The open animation (#1) is the **View Transitions API**, as progressive enhancement | 88% global support (Chrome/Edge 111+, Safari 18+, Firefox 144+). Where absent it degrades to a cross-fade, which is YARL's default — so there is no fallback branch to maintain. Carries genuine risk; see §5. |
| D8 | Do **not** adopt PhotoSwipe, despite its best-in-class open transition and pan | It requires predefined image dimensions. `PhotoPipeline.Encode` computes each variant's real width and discards it, so adopting PhotoSwipe means a Cosmos schema change, both public and host projections, and a backfill *before* any lightbox code is written. Its core has not shipped since 2024-05. |

## 4. Shape

One new component, `components/detail/Lightbox.tsx`:

```ts
<Lightbox
  photos={PropertyPhoto[]}
  index={number | null}          // null = closed
  onClose={() => void}
  overlay?={(index: number) => ReactNode}
/>
```

Both call sites collapse onto it:

- `Gallery.tsx` keeps the mosaic and the chips, loses its `Dialog`, and opens
  the lightbox at the clicked tile's index.
- `property/page.tsx` drops its single-photo `Dialog` and opens the same
  component with a one-item list when a description photo reference is clicked.
  A photo hidden from the gallery is therefore still viewable at full size —
  today it opens at 28rem.

Plugins used: `Zoom` (#6), `Thumbnails` (#3), `Counter` (#5), `Captions` (#4).
Lazy loading (#2) is YARL's own bounded preload. WebP (#7) is free — these are
`<img>` elements.

`lib/photos.ts` gains a pure `slidesFor(photos)` mapper: `PropertyPhoto[]` to
YARL's slide shape, carrying `src` and `alt`. No `srcSet` — YARL's
`ImageSource` requires `width` and `height` per candidate, which the photo
record does not store (see D8's reasoning and the comment on `slidesFor`
itself); no caption either, since `PropertyPhoto` has no caption field yet
(§7). Pure, so it is unit-testable under vitest per the `app/lib`-only rule.

## 5. The one risky part

`document.startViewTransition` needs the destination slide **painted in the
same frame** the state flips. YARL mounts through a portal and loads its image
asynchronously. The mosaic tile is already decoded and the first slide resolves
to the same `srcSet` candidate, so it should come from cache — but "should" is
carrying weight in that sentence, and if the transition captures an empty slide
the effect is worse than no effect.

This is measured, not assumed. If it captures empty, D7 falls back to the plain
cross-fade and we say so rather than shipping a flicker.

### 5.1 What was measured (2026-08-02)

**D7 stands, but only because the transition holds itself open. Both
sentences above turned out to be wrong, in opposite directions.**

Method, repeatable: hook `document.startViewTransition`, record every element
whose computed `view-transition-name` is not `none` immediately before the call
(the "old" capture) and again inside the update callback (the "new" one), then
on `ready` read `document.getAnimations()` for effects whose `pseudoElement`
starts with `::view-transition` and dump their keyframes. The
`::view-transition-group(lightbox-photo)` keyframes ARE the answer: two
different rects means the photo scaled, one pseudo-element on its own means it
did not. Driven from Playwright against `next dev` behind the SWA emulator, on
`/en/property/?id=movera0` at 1280x800. Corroborated by pausing every
view-transition animation on `ready` and screenshotting at fixed offsets.

1. **The naive version does not work at all.** At the instant the state flip
   returns there is nothing in the document to capture: YARL's `Portal`
   renders `null` until a `useEffect` sets `mounted`, so `portalAtFlip` and
   `slideImgAtFlip` are both `false`. The only pseudo-element produced was
   `::view-transition-old(lightbox-photo)`, keyframes `opacity: 1 → 0`. The
   browser animated the clicked tile fading out where it stood. No group, no
   scaling, no growth.

2. **Returning a promise from the update callback fixes it.** Holding the
   callback open until `.yarl__slide_current img` is `complete` with a layout
   box produces the full pair plus
   `::view-transition-group(lightbox-photo)`: from `translate(953, 269)`
   `303x185` — the clicked tile's rect to the pixel — to `translate(451, 16)`
   `378x672`, the slide's. Identical geometry in Chromium, Firefox and WebKit.

3. **"The first slide resolves to the same `srcSet` candidate" is false.**
   `slidesFor` always asks for `detailUrl`; a mosaic tile's `sizes` (25vw for a
   tile) usually settles on `cardUrl`. On a cold cache the slide is a fresh
   fetch, and waiting it out measured 433 ms of frozen page followed by a
   transition with an `opacity: 0` destination in it — visibly worse than no
   transition, exactly the failure this section was written to catch. Hence
   two additions the spec did not anticipate: the gallery prefetches
   `slideSrc(photo)` on pointer-enter and focus, and the wait is capped
   (`SLIDE_BUDGET_MS`) with `skipTransition()` past it, which lands back on
   YARL's cross-fade.

Warm-path latency, six cold page loads: 75-92 ms between the click and the
animation starting (Chromium; Firefox 62 ms, WebKit 68 ms).

**The closing transition is deliberately not done**, and not because it was
untried. `Portal.handleClose` sets `visible = false` and only calls our
`onClose` after `animation.fade` has elapsed — traced live, the portal goes
`opacity` 1 → 0.075 over ~195 ms and is removed at ~263 ms — so a transition
started in `onClose` begins from a lightbox that has already faded out. Two
further blockers: `Gallery` is only told the *starting* index, so it cannot
know which slide to shrink back to after the visitor navigates; and any slide
past the fifth has no mosaic tile to shrink into. All three need
`Lightbox.tsx` reopened, which is where Task 2's navigation regression came
from. Left alone on purpose.

## 6. Prototype and evaluation

Both candidates are built as a section on `/[locale]/design` — no new route, no
new e2e case, consistent with how every other component is shown there. The
demo uses the three `public/brand` sample images repeated to ~20 slides with
invented captions, so it stays hermetic and survives static export; local blob
URLs would not.

The prototype exists to settle exactly three questions:

1. **Open animation.** Does the View Transitions path (YARL) actually land, or
   does Fancybox's native transition win on feel?
2. **Overlay slot.** Can a floor-plan mini-map be positioned and made
   interactive in `render.controls` without fighting the library's own layers?
3. **Theming reach.** How close does each get to our tokens before the CSS
   turns into a fight with `!important`?

Everything else is settled by §3 and does not need a prototype to decide.

**Licence constraint.** The design page deploys with the app. The Fancybox
prototype stays local: it must not reach the staging URL before either the €29
is paid or the option is dropped. Local evaluation is fine; deployed is use.

### 6.1 Prototype outcome

Built on `spike/fancybox-comparison` (never merged, per the licence
constraint above): a `FancyboxLightbox.tsx` wrapper with the same
`photos`/`index`/`onClose`/`overlay` contract as `Lightbox.tsx`, a second
section on `/[locale]/design` driving it over the same eight photos, and a
`.ebrostay-fancybox` theming pass in `globals.css` matching
`.ebrostay-lightbox`'s intent. Full write-up:
`.superpowers/sdd/2026-08-02-gallery-lightbox/task-8-report.md`.

**1. Open animation — YARL/Task 6 wins, and by more than expected.**
Fancybox's native "grow from origin" effect (`zoomEffect`) needs a
`slide.thumbEl` — a real DOM reference to the clicked thumbnail — populated
only when Fancybox drives itself off page markup (`Fancybox.bind()` /
`fromNodes()`). Called the way a props-driven React wrapper naturally calls
it (`Fancybox.show(slides, options)`, plain `{src, alt, caption}` objects, no
DOM refs), `thumbEl` is `undefined` and Fancybox silently falls back to a
centered zoom-and-fade with no relationship to the clicked tile — confirmed
by reading `fancybox.js`'s `we()`. Getting the real effect would mean
threading tile `<img>` refs from `Gallery.tsx` into the lightbox, coupling two
components the current split deliberately keeps apart. Separately, and
visible in side-by-side screenshots: **YARL's slide fills the viewport edge
to edge; Fancybox's default slide is letterboxed** (centered, contained,
visible margin) — a gap `zoomEffect` doesn't close even once wired up. Task
6's transition, by contrast, cost a 150 ms budget-with-skip and a hover
prefetch entirely inside `Gallery.tsx`, already shipped and tested across
three engines.

**2. Overlay slot — works, at a real but modest extra cost.** Fancybox has no
`render.controls` equivalent at all. The wrapper instead grabs
`fancybox.getContainer()` on the `ready` event, appends a plain `<div>`, and
`createPortal`s the caller's overlay into it, tracking the active slide
through `Carousel.change` (the direct analogue of YARL's `on.view`). Verified
live: the same "floor plan slot · photo N" chip, in the same position,
tracking every navigation correctly. The difference is shape, not
capability — YARL's slot is a typed prop; Fancybox's is DOM lifecycle
management (create on `ready`, tear down on `destroy`/unmount, recreate every
reopen) that the caller owns.

**3. Theming reach — Fancybox reaches further, at parity on `!important`.**
~160 `--f-*` custom properties, all scoped onto `.fancybox__container`
itself, against YARL's ~20 `--yarl__*` — roughly 8x the surface. One extra
class plus a `globals.css` block beats the library's own rule on ordinary
specificity, confirmed via computed styles in the running app; no
`!important` needed, same as `.ebrostay-lightbox`. One paper cut: the counter
markup has no class hook, so the letter-spacing touch
`.ebrostay-lightbox__counter` gets from YARL's `counter.container.className`
prop requires a `Toolbar.items.counter.tpl` template override on the
Fancybox side instead — not a CSS fight, but a different, costlier API shape
for that one piece of chrome.

**Recommendation: stay on YARL / Task 6.** The prototype was built to test
whether "Fancybox ships the transition natively" would flip the decision; it
does not — that claim holds only for markup-driven usage, not for a
props-driven wrapper, and even wired up targets a letterboxed slide instead
of the full-bleed one already shipping. Fancybox is roughly at parity on the
overlay slot and ahead on theming surface, but neither clears the bar to
justify the €29 licence, the licence-terms confirmation email (§8), and
reopening five shipped, tested components (Tasks 1–7) to swap libraries. This
would be worth revisiting only if the Gallery/Lightbox separation changes for
unrelated reasons — that is the one thing that would put `thumbEl`-based zoom
within reach and turn Q1 into a styling fix rather than an architecture one.
`spike/fancybox-comparison` is kept, unmerged, in case that happens.

## 7. What this unblocks

The mockup that prompted this work shows a floor-plan mini-map — "YOU ARE HERE ·
Main floor" — with pins for each photo's position, a room name per photo, and
several plans per home. None of that data exists. `PropertyPhoto` is today
`url`, `cardUrl`, `detailUrl`, `isFloorplan`, `sortOrder`, `hiddenFromGallery`,
and `property/page.tsx` uses exactly one floor plan (`photos.find`).

That feature is a full-stack piece of work: a C# model change, a Cosmos schema
change, both projections, and a host editor for tagging rooms and dropping pins
on a plan. It gets its own spec. D4 is what keeps this one from having to be
reopened when it arrives.

## 8. Licence note — Fancybox

The Single tier is **€29 one-time** for "one end product and one end user".
Read against the other tiers — Extended is "unlimited end products, each limited
to one end user" (an agency, many sites, one client each) and Business is
"unlimited components, end products, and end users" (themes resold to many
buyers) — **End Product is the website and End User is Ebrostay**. One Single
licence therefore covers ebrostay.com in full: every page, every listing, every
visitor.

This is inference, not quotation: the licence agreement never formally defines
either term, and two GitHub issues asking this exact question (fancybox #2292,
#1882) went publicly unanswered. If Fancybox wins the prototype, get it in
writing from fancyapps before shipping.

## 9. Testing

- **vitest** — `slidesFor` in `lib/photos.ts`: ordering, alt-text numbering,
  the `detailUrl`/`url` fallback, the single-photo (description reference)
  case, and the no-photos case. No `srcSet` passthrough or caption-absent
  case to test — neither feature shipped (see §4).
- **Playwright** — the design page is already in the route sweep, so the demo is
  covered against console errors on load. The sweep only *loads* pages, so one
  focused spec opens the lightbox, advances a slide, checks the counter, and
  closes it.
- **Manual** — light and dark, ES and EN, and a real phone for the pinch-zoom
  and swipe paths, which no automated check here will honestly cover.

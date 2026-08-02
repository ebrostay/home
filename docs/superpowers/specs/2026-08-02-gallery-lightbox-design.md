# Gallery lightbox — one photo surface, with room for the plan

> Design spec, 2026-08-02. Branch `redesign/v2`.
> Resolves the deferral recorded in `app/lib/photos.ts` ("deliberately deferred
> until the gallery control is rebuilt"). This is that rebuild.

## 1. Why

The detail page has **two half-galleries and no lightbox**:

1. `components/detail/Gallery.tsx` renders a 2fr/1fr/1fr mosaic. "All N photos"
   opens a `Dialog` containing a scrollable **grid** — no carousel, no zoom, no
   captions, no keyboard navigation.
2. `app/[locale]/property/page.tsx` keeps a *second*, unrelated `Dialog` holding
   a **single** photo, opened when a description references a photo
   (`components/ui/RichText.tsx`). It is capped at `min(92vw, 28rem)` by
   `ui/Dialog`'s fixed class, so a photo reference opens a thumbnail.

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
| D1 | **`yet-another-react-lightbox`** (MIT, v3.32.2, ~480k/wk, zero runtime deps, 11.7 kB gz core) | The only permissively-licensed, actively-maintained candidate covering requirements #2–#8 out of the box, with React 19 in its peer range. Native `srcSet` support, so the existing `srcset`/`sizes` work carries over unchanged. |
| D2 | Evaluate **Fancybox v6** (`@fancyapps/ui`) as a paid alternative before committing | It ships the open transition (#1) natively rather than as our own View Transitions gamble, and is the more polished product. €29 one-time Single licence. See §6 for what the prototype must settle and §8 for the licence reading. |
| D3 | Rejected: **fslightbox-react** (thumbnails, captions and zoom are all paid Pro), **Swiper** (a carousel, not a lightbox — we would hand-build the shell and still ship 19 kB), **lightGallery** (GPLv3 or paid; copyleft on our bundle), **react-photo-view** (Apache-2.0 and it has the open animation natively, but last released 2025-01-05 with an open, unanswered *"It's not work in React19.x"* report), **PhotoSwipe** (requires predefined width/height per image, which we do not store — see D8) | Recorded so the next person does not re-run this search. |
| D4 | The lightbox takes an **`overlay(index)` render prop**, passed through YARL's `render.controls` slot | The mini-map becomes our own component layered on top. Nothing inside the lightbox knows what a floor plan is, so the deferred model in §7 lands without reopening this component. |
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
YARL's slide shape, carrying `src`, `srcSet` and the caption field when it
exists. Pure, so it is unit-testable under vitest per the `app/lib`-only rule.

## 5. The one risky part

`document.startViewTransition` needs the destination slide **painted in the
same frame** the state flips. YARL mounts through a portal and loads its image
asynchronously. The mosaic tile is already decoded and the first slide resolves
to the same `srcSet` candidate, so it should come from cache — but "should" is
carrying weight in that sentence, and if the transition captures an empty slide
the effect is worse than no effect.

This is measured, not assumed. If it captures empty, D7 falls back to the plain
cross-fade and we say so rather than shipping a flicker.

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

- **vitest** — `slidesFor` in `lib/photos.ts`: ordering, the `srcSet` passthrough,
  the caption-absent case, and the single-photo (description reference) case.
- **Playwright** — the design page is already in the route sweep, so the demo is
  covered against console errors on load. The sweep only *loads* pages, so one
  focused spec opens the lightbox, advances a slide, checks the counter, and
  closes it.
- **Manual** — light and dark, ES and EN, and a real phone for the pinch-zoom
  and swipe paths, which no automated check here will honestly cover.

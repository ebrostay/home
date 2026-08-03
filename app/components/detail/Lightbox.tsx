"use client";

import { useMemo, useState } from "react";
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

// The class stamped on YARL's own root (`className` below) — the anchor
// everything that reaches into this component's DOM from outside uses.
// Exported alongside `slidePainted` so `Gallery.tsx` does not have to
// hardcode a second copy of it.
const CONTAINER_CLASS = "ebrostay-lightbox";

/** Whether the lightbox's current slide became a loaded, laid-out <img>
 *  inside the budget. Lives here rather than in the caller that uses it
 *  (`Gallery.tsx`, for the open View Transition) because the selector it
 *  polls is this component's own DOM output.
 *
 *  Polled with timers rather than rAF: rendering is suppressed while a View
 *  Transition's update callback is pending, so rAF need never fire. */
export function slidePainted(budgetMs: number): Promise<boolean> {
  const t0 = performance.now();
  return new Promise<boolean>((resolve) => {
    const tick = () => {
      const img = document.querySelector<HTMLImageElement>(
        `.${CONTAINER_CLASS} .yarl__slide_current img`,
      );
      if (img?.complete && img.naturalWidth > 0 && img.clientWidth > 0) {
        resolve(true);
      } else if (performance.now() - t0 > budgetMs) {
        resolve(false);
      } else {
        setTimeout(tick, 8);
      }
    };
    tick();
  });
}

// The one place that imports the lightbox library itself — but not the only
// place coupled to its output. `app/globals.css` themes ~13 `--yarl__*`
// custom properties plus `.yarl__slide_current img` directly (CSS cannot
// import a JS constant), and `e2e/pages.spec.ts` selects `.yarl__counter` to
// assert on the counter plugin. Both are known leaks a library swap would
// have to chase down. `Gallery.tsx` used to be a third: it hardcoded
// `.ebrostay-lightbox .yarl__slide_current img` to poll the open transition.
// That selector and the polling function that used it now live here as
// `CONTAINER_CLASS`/`slidePainted`, exported, so a swap only needs THIS
// file's copies updated — Gallery.tsx just imports the function.
export function Lightbox({
  photos,
  index,
  onClose,
  overlay,
}: {
  /** CALLER'S RESPONSIBILITY: must be referentially stable for as long as the
   *  lightbox is open — the same array instance across re-renders, not just
   *  one that is `===` by value. Build it with `useMemo` (or hoist it) rather
   *  than inline in JSX or a plain `.filter()`/`.map()` at render time. YARL
   *  resets `currentIndex` back to the opening slide whenever the `slides`
   *  array it is handed changes identity (see the `useMemo` below for the
   *  mechanism); the memo below only guards against THIS component
   *  re-rendering, it cannot fix a caller that hands in a fresh array. */
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
  // Initialised from the opening index, not 0: `key={index ?? "closed"}`
  // below remounts this component on every open, so `useState(0)` would
  // render `overlay(0)` for one commit even when opening on slide 5 — wrong
  // the instant it appears, and only corrected once `on.view`'s effect
  // fires. Invisible with today's demo overlay; a floor-plan mini-map would
  // flash the wrong floor.
  const [current, setCurrent] = useState(index ?? 0);

  /* MUST be referentially stable across renders that do not actually change
     the photo set. YARL's `LightboxStateProvider` compares `slides` with
     `!==` on every render and, when it differs, resets `currentIndex` back
     to the `index` prop (the STARTING index — see the `key` comment below).
     Built inline, `slidesFor(...)` returns a fresh array every render;
     `on.view` below calls `setCurrent`, which re-renders this component,
     which built a fresh `slides` array, which YARL saw as "changed" and
     used as its cue to snap back to the opening slide — a closed loop that
     pinned every navigation input (arrows, buttons, thumbnails, swipe) to
     the slide the lightbox opened on. Confirmed by reading
     `LightboxStateProvider`'s reducer in
     `node_modules/yet-another-react-lightbox/dist/index.js`, not guessed.
     `t` is safe to depend on: next-intl memoizes it per locale/namespace
     (`use-intl/dist/.../react.js`), so it is stable across the very
     re-renders this memo exists to survive. */
  const slides = useMemo(
    () => slidesFor(photos, (n, total) => t("photoOf", { n, total })),
    [photos, t],
  );

  return (
    <YARL
      /* `index` is a STARTING index only — YARL keeps its own after that.
         Without a fresh mount per opening, clicking tile 6 having previously
         opened tile 2 reopens on 2. */
      key={index ?? "closed"}
      open={index !== null}
      index={index ?? 0}
      close={onClose}
      slides={slides}
      plugins={[Captions, Counter, Thumbnails, Zoom]}
      on={{ view: ({ index: i }) => setCurrent(i) }}
      className={CONTAINER_CLASS}
      counter={{ container: { className: "ebrostay-lightbox__counter" } }}
      thumbnails={{
        width: 96,
        height: 64,
        border: 0,
        borderRadius: 6,
        gap: 8,
        padding: 0,
        vignette: false,
        /* The strip is how you reach photo 14 without pressing next thirteen
           times, so it starts open. But it eats ~80 px of a phone's screen,
           and someone studying one room wants the room, not the contact
           sheet — hence a toggle rather than a fixed choice either way. */
        showToggle: true,
      }}
      /* Clicking away from the photo closes it. The backdrop is dead space
         that looks dismissible, and a visitor who has zoomed into a corner of
         a kitchen should not have to find the X. Esc and the pull gestures
         still work; this is one more way out, not a replacement. */
      controller={{ closeOnBackdropClick: true }}
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

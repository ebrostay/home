"use client";

/* SPIKE ONLY — spike/fancybox-comparison. Not for merge.
 * `@fancyapps/ui` is not free for commercial use; this must not reach a
 * deployed environment before a licence is bought.
 *
 * This is Fancybox's OWN documented React integration
 * (fancyapps.com/fancybox/integration/react): a `useEffect` that calls
 * `Fancybox.bind(root, selector, options)` against real anchors rendered by
 * React, and `unbind` on cleanup.
 *
 * That detail is the whole point of rebuilding this. The first attempt drove
 * Fancybox imperatively from an `index` prop — `Fancybox.show(items)` — to
 * mirror `Lightbox.tsx`'s contract, and concluded Fancybox could not do its
 * zoom-from-thumbnail open in React. That conclusion was wrong, and it was
 * wrong because of how it was wired: `show()` is handed a plain data array
 * and has no idea which element on the page the photo came from, so it has
 * nothing to zoom FROM. `bind()` attaches to the anchor itself, so the
 * thumbnail inside it is the element the animation starts at.
 *
 * The cost of that is real and belongs in the comparison: the trigger markup
 * has to be anchors carrying `data-fancybox` and an `href` to the full image.
 * Fancybox reads the DOM; it does not take a photo list as a prop. So a
 * drop-in swap for `Lightbox.tsx` is not possible — every call site would
 * change shape, not just the component behind it. */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Fancybox, type FancyboxOptions } from "@fancyapps/ui";
import type { PropertyPhoto } from "@/lib/api";
import { slideSrc } from "@/lib/photos";

import "@fancyapps/ui/dist/fancybox/fancybox.css";

/** The fixed tile the "crop" and "masked" variants draw into — Tailwind's
 *  w-28/h-20 in pixels, needed as numbers for the masked geometry below. */
const TILE = { w: 112, h: 80 } as const;

/* The "masked" variant: the same visible crop as `object-cover`, built so
 * Fancybox cannot tell it is a crop.
 *
 * Fancybox's zoom-in only runs when the thumbnail ELEMENT's rect is within
 * 0.1 (absolute aspect-ratio units) of the slide's — a hardcoded gate with no
 * option, and its `object-fit` compensation covers `contain`/`scale-down`
 * only, so a covered tile is measured as its crop box and loses the zoom.
 * Here the <img> keeps the photo's true shape, oversized to cover the tile,
 * and the anchor clips it — the tile shows the same centre band, but the
 * element Fancybox measures has the photo's own aspect, so the gate passes.
 * On open, the hidden bands materialise around the tile and the whole photo
 * springs out: the crop "unfolds" instead of fading.
 *
 * Two constraints from Fancybox's measuring code shape the CSS:
 * - centering must be numeric left/top, NOT translate(-50%,-50%): an inline
 *   `style` containing a transform on the thumb (or an ancestor) makes
 *   Fancybox reject the thumbnail as clipped-by-carousel.
 * - the cover geometry needs the photo's intrinsic ratio, which the photo
 *   record does not carry (per-variant dimensions are a deferred schema
 *   change, see `srcSet`) — so it is read from `naturalWidth` after load,
 *   with plain `object-cover` as the pre-load fallback. */
function MaskedThumb({ photo }: { photo: PropertyPhoto }) {
  const [geom, setGeom] = useState<CSSProperties | null>(null);
  const measure = (img: HTMLImageElement) => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    const w = Math.max(TILE.w, TILE.h * ratio);
    const h = Math.max(TILE.h, TILE.w / ratio);
    // The ref callback below re-runs on every render, so this must be
    // idempotent: returning the existing state keeps React from looping.
    setGeom(
      (prev) =>
        prev ?? {
          width: w,
          height: h,
          left: (TILE.w - w) / 2,
          top: (TILE.h - h) / 2,
        },
    );
  };
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={photo.cardUrl ?? photo.url}
      alt=""
      ref={(img) => {
        // A cached image can be complete before React attaches onLoad.
        if (img && img.complete) measure(img);
      }}
      onLoad={(e) => measure(e.currentTarget)}
      className={geom ? "absolute max-w-none" : "h-full w-full object-cover"}
      style={geom ?? undefined}
    />
  );
}

export function FancyboxGallery({
  photos,
  variant,
  group,
}: {
  photos: readonly PropertyPhoto[];
  /** `"crop"` renders the thumbnails as our real mosaic does — a fixed box
   *  with `object-cover`, so the thumbnail is a CROP of the photo and their
   *  aspect ratios disagree. `"natural"` lets each thumbnail keep the photo's
   *  own shape. `"masked"` shows the same crop as `"crop"` but lies about it —
   *  see `MaskedThumb`. `"clipped"` is `"masked"` plus a `clip-path` on the
   *  zooming image itself: the flight starts clipped to exactly the tile's
   *  visible band and the clip animates open with the zoom (and closed again
   *  on the way back), so the hidden bands never draw over the page.
   *
   *  This is the whole experiment. Fancybox's zoom-in animates the thumbnail's
   *  rectangle out to the slide's; when the thumbnail is a crop, the two are
   *  not the same picture and there is no honest interpolation between them.
   *  The observation that prompted this: sample-home-1.jpg (3% aspect
   *  mismatch) zoomed, zaragoza-hero.webp (7%) and sample-home-2.jpg (119% —
   *  a portrait photo in a landscape box) did not. Those numbers are the
   *  hardcoded gate above, seen from its two sides: 0.1 at a 1.4 tile is ~7%. */
  variant: "crop" | "natural" | "masked" | "clipped";
  /** Fancybox groups by this, so the rows must not share one. */
  group: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    /* The tile-band clip for the photo shown by `img`, as a `clip-path`
       value in the IMAGE's own coordinate space. Because inset() percentages
       are relative to the element box, the clip rides the zoom transform —
       a constant value stays glued to the same band of the picture at any
       scale, so "clipped at the tile" and "clipped mid-flight" are the same
       number. */
    const clipFor = (img: HTMLImageElement | null): string | null => {
      if (!img || !img.naturalWidth || !img.naturalHeight) return null;
      const ratio = img.naturalWidth / img.naturalHeight;
      const w = Math.max(TILE.w, TILE.h * ratio);
      const h = Math.max(TILE.h, TILE.w / ratio);
      const ix = ((1 - TILE.w / w) / 2) * 100;
      const iy = ((1 - TILE.h / h) / 2) * 100;
      return `inset(${iy.toFixed(3)}% ${ix.toFixed(3)}% ${iy.toFixed(3)}% ${ix.toFixed(3)}%)`;
    };
    /* The VISIBLE zooming image of ONE instance. Two traps here, both found
       the hard way: the wrapper's direct child is a hidden lazy-load clone
       (the visible image is a level deeper, inside the panzoom viewport),
       and the lookup must be scoped to the instance's own container — when
       the visitor reopens while the previous dialog is still closing, both
       dialogs match a document-wide query and the choreography lands on the
       closing one's image. */
    const flyingImgIn = (
      container: HTMLElement | null | undefined,
    ): HTMLImageElement | null =>
      container?.querySelector(
        ".fancybox__slide.is-selected .f-panzoom__viewport .f-panzoom__content",
      ) ?? null;
    type WithContainer = { getContainer?: () => HTMLElement | undefined };
    const containerOf = (fb: unknown): HTMLElement | null =>
      (fb as WithContainer)?.getContainer?.() ?? null;

    let openPending = false;
    const clippedOptions = {
      mainClass: "spike-clipped",
      on: {
        init: () => {
          openPending = true;
        },
        /* Fires when a slide's image is loaded — the same gate the reveal
           spring waits behind, so a clip set here synchronously is on the
           first painted frame. Then the clip transitions open, roughly
           matching the spring (which has no fixed duration to sync to).

           Two guards, both against the same failure: a clip landing on an
           image the visitor can already see reads as a black-bands flicker.
           The one-shot flag is consumed on the FIRST firing whether or not
           the clip could be applied (a later firing would be a neighbouring
           slide's preload, long after the reveal), and the clip is only set
           while the content is still pre-reveal-hidden — if it is already
           showing, skipping the effect entirely beats flashing bands onto
           it. The inline styles are removed once the transition is done so
           nothing later can animate a stray clip write. */
        "Carousel.contentReady": (fb: unknown) => {
          if (!openPending) return;
          openPending = false;
          const container = containerOf(fb);
          /* Reopening while the previous dialog is still closing overlaps
             two instances; skipping the effect for this open beats letting
             any animation race the leftover close. */
          if (
            document.querySelectorAll(".fancybox__container.spike-clipped")
              .length > 1
          )
            return;
          const img = flyingImgIn(container);
          const clip = clipFor(img);
          if (!img || !clip) return;
          const cs = getComputedStyle(img);
          if (cs.display !== "none" && cs.visibility !== "hidden") return;
          img.style.clipPath = clip;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              img.style.transition =
                "clip-path 500ms cubic-bezier(0.22, 1, 0.36, 1)";
              img.style.clipPath = "inset(0% 0% 0% 0%)";
              /* Clear the transition once done so a stray later clip write
                 cannot animate — but KEEP the inline inset(0%): `none` and
                 `inset()` do not interpolate, so the close would snap shut
                 instead of animating if the resolved value were removed. */
              setTimeout(() => {
                img.style.transition = "";
              }, 650);
            }),
          );
        },
        /* Close tween is hardcoded 350 ms ease-out; the clip mirrors it, so
           the image lands showing exactly the tile's band — no overlap, no
           fade needed. */
        shouldClose: (fb: unknown) => {
          const img = flyingImgIn(containerOf(fb));
          const clip = clipFor(img);
          if (!img || !clip) return;
          img.style.transition = "clip-path 350ms cubic-bezier(0.33, 1, 0.68, 1)";
          img.style.clipPath = clip;
        },
      },
    };

    /* Deliberately close to stock. The question this spike answers is whether
       Fancybox's own look and feel is more refined than what we built, so
       configuring it into our idiom would be answering a different one.
       The masked and clipped rows are the exception: `mainClass` tags their
       containers so the CSS above and the handlers here can find them. */
    const options: Partial<FancyboxOptions> =
      variant === "masked"
        ? { mainClass: "spike-masked" }
        : variant === "clipped"
          ? (clippedOptions as Partial<FancyboxOptions>)
          : {};
    Fancybox.bind(el, "[data-fancybox]", options);
    return () => Fancybox.unbind(el);
  }, [variant]);

  return (
    <div ref={root} className="flex flex-wrap gap-3">
      {variant === "masked" && (
        /* The zoom-back lands on the masked thumb's VIRTUAL box, so its
           hidden bands finish the flight on top of the neighbouring tiles —
           after the backdrop has already gone. Fancybox exposes no handle on
           that tween (hardcoded 350 ms ease-out over x/y/scale; `hideClass`
           only runs in the no-zoom fallback), but `is-closing` lands on the
           container the same tick the tween starts, so a 350 ms keyframe can
           ride it: fading over the whole flight. (A hold-to-75% variant was
           tried first and read as no fade at all — 87 ms is below notice.)
           The `:not` guards keep it off the fallback and drag-to-close
           paths, which already fade. */
        <style>{`
          /* NOT a child combinator: the visible image sits one level down,
             .f-panzoom__wrapper > .f-panzoom__viewport > .f-panzoom__content.
             The wrapper's direct .f-panzoom__content child is a hidden lazy-
             load clone — targeting it fades nothing, which is how the first
             version of this rule shipped a fade nobody could see. */
          .fancybox__container.spike-masked.is-closing
            .f-panzoom__wrapper:not(.f-fadeOut):not(.f-throwOutDown):not(.f-throwOutUp)
            .f-panzoom__content {
            animation: spike-masked-fade-late 350ms linear both;
          }
          @keyframes spike-masked-fade-late {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }
        `}</style>
      )}
      {/* No data-caption, matching FancyboxMosaic: the bottom bar is
          reserved for a real photo description once the field exists;
          "Photo n of N" is the toolbar counter's job. */}
      {photos.map((photo) => (
        <a
          key={photo.url}
          data-fancybox={group}
          href={slideSrc(photo)}
          className={`block overflow-hidden rounded-(--radius-control) border border-line${
            variant === "masked" || variant === "clipped"
              ? " relative h-20 w-28"
              : ""
          }`}
        >
          {/* The thumbnail draws the card derivative while the href above
              points at the detail file — the same pairing the real mosaic
              has, so the open animation covers the resolution jump too. */}
          {variant === "masked" || variant === "clipped" ? (
            <MaskedThumb photo={photo} />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photo.cardUrl ?? photo.url}
              alt=""
              className={
                variant === "crop" ? "h-20 w-28 object-cover" : "h-20 w-auto"
              }
            />
          )}
        </a>
      ))}
    </div>
  );
}

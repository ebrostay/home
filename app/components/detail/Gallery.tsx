"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { Images, Ruler } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PropertyPhoto } from "@/lib/api";
import { SIZES, slideSrc, srcSet } from "@/lib/photos";
import { Lightbox, slidePainted } from "@/components/detail/Lightbox";

type ViewTransition = { ready: Promise<void>; skipTransition: () => void };
type Transitional = Document & {
  startViewTransition?: (cb: () => Promise<void>) => ViewTransition;
};

/* How long the transition may hold the page still waiting for the destination
   slide. Measured 2026-08-02 against `next dev` on a warm slide: 75-92 ms over
   six cold page loads, so this has ~60 ms of headroom and still sits under
   the 150 ms where a stall stops reading as "the click registered". Past it
   we give up and take the library's cross-fade instead — see `open`. */
const SLIDE_BUDGET_MS = 150;

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
  /* The tile the browser is morphing into the slide. Deliberately NOT derived
     from `openAt`: the two must be true in different frames. A View Transition
     snapshots the document as it is when `startViewTransition` is called (the
     "old" frame) and again when the callback returns (the "new" one), so the
     tile has to carry `view-transition-name` BEFORE the flip and have lost it
     after — the slide holds the name then, and two elements may never share
     one name in a captured frame. */
  const [morphing, setMorphing] = useState<number | null>(null);

  /* Open inside a View Transition where the browser has one, so the photo
   * grows out of the tile instead of appearing over it.
   *
   * Progressive enhancement with no fallback branch to maintain: every way out
   * of here — no `startViewTransition`, reduced motion, a slide that did not
   * arrive in time — lands on a plain state flip, and a plain state flip is
   * YARL's own cross-fade.
   *
   * `flushSync` is load-bearing twice over. The transition snapshots the
   * document when `startViewTransition` is called and again when the callback
   * settles, and React would otherwise batch both updates past both snapshots.
   *
   * The `await` is load-bearing too, and was measured into existence: at the
   * instant the flip returns there is NOTHING to snapshot, because YARL's
   * `Portal` renders null until an effect sets `mounted` — so the naive
   * version captured an old tile with no new counterpart and animated the tile
   * fading out in place. Holding the callback open until the slide exists is
   * what turns that into a grow. */
  function open(n: number) {
    const start = (document as Transitional).startViewTransition;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!start || reduced) {
      setOpenAt(n);
      return;
    }

    flushSync(() => setMorphing(n));
    /* The callback closes over `vt` and is never called synchronously — the
       browser runs it at the next rendering opportunity, by which point this
       binding is initialised. */
    const vt = start.call(document, async () => {
      flushSync(() => {
        setOpenAt(n);
        setMorphing(null);
      });
      /* Holding the page still is only worth it if the photo is there at the
         end of it. On a cold cache the slide's `detail` variant is a fresh
         fetch (the tile's `srcset` usually settled on `card`), and waiting it
         out gave a third of a second of frozen page followed by a transition
         with nothing in it — measurably worse than no transition. Skipping
         inside the callback is race-free: the animations have not been built
         yet, so nothing is ever painted mid-flight. */
      if (!(await slidePainted(SLIDE_BUDGET_MS))) vt.skipTransition();
    });
    // Skipping rejects `ready`, and an unhandled rejection is a console error.
    vt.ready.catch(() => {});
  }

  /* Warm the file the lightbox will ask for, so the transition above has
     something to snapshot by the time the click lands. Pointer-in and focus
     both run ahead of activation by enough for a same-origin image on a
     reasonable connection; where they do not, `open` skips and we are back to
     the cross-fade. */
  const warm = (photo: PropertyPhoto) => {
    new Image().src = slideSrc(photo);
  };

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
            active={morphing === 0}
            onWarm={() => warm(hero)}
            onClick={() => open(0)}
          />
          {tiles.map((photo, i) => (
            <Frame
              key={photo.url}
              photo={photo}
              alt={t("photoOf", { n: i + 2, total: photos.length })}
              className="hidden sm:block"
              active={morphing === i + 1}
              onWarm={() => warm(photo)}
              onClick={() => open(i + 1)}
            />
          ))}
        </div>

        <div className="absolute bottom-3 right-3 flex gap-2">
          {/* Counts PHOTOS, not tiles. The previous rule compared against the
              four supporting tiles — which are `hidden sm:block` — so a
              five-photo home on a phone showed one photo, hid the chip, and
              left the other four unreachable.

              Opens on the hero, so the hero is the tile that morphs. */}
          {photos.length > 1 && (
            <PhotoButton onWarm={() => warm(hero)} onClick={() => open(0)}>
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
  active,
  onWarm,
  onClick,
}: {
  photo: PropertyPhoto;
  alt: string;
  className?: string;
  /** How wide this frame is actually drawn. The hero is twice the others, and
   *  one shared value would make the tiles fetch the hero's size. */
  sizes?: string;
  /** This is the tile the lightbox is opening from, for exactly the one frame
   *  the View Transition snapshots as "old". */
  active: boolean;
  /** Fired when the visitor is about to open this one. */
  onWarm: () => void;
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
      onPointerEnter={onWarm}
      onFocus={onWarm}
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
        style={active ? { viewTransitionName: "lightbox-photo" } : undefined}
      />
    </button>
  );
}

function PhotoButton({
  onClick,
  onWarm,
  children,
}: {
  onClick: () => void;
  onWarm?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onWarm}
      onFocus={onWarm}
      /* Sits on photography in both themes, so the chip is fixed white/ink
         rather than a theme-flipping surface token.

         The hover feedback is PropertyCard's, deliberately: card-to-pop
         shadow over --dur-standard. That card is this chip's closest
         relative — a clickable thing sitting on a photo — and borrowing its
         idiom is what keeps one control from growing its own vocabulary.
         The shadow tokens flip with the theme even though the chip does
         not, so the lift reads on a dark page too. */
      className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-[0.8125rem] font-semibold text-[#15251f] shadow-(--shadow-card) transition-[background-color,box-shadow] duration-(--dur-standard) hover:bg-white hover:shadow-(--shadow-pop)"
    >
      {children}
    </button>
  );
}

"use client";

/* SPIKE ONLY — spike/fancybox-comparison. Not for merge.
 * `@fancyapps/ui` is not free for commercial use; this must not reach a
 * deployed environment before a licence is bought.
 *
 * The detail page's mosaic, opened through Fancybox instead of the shipped
 * Lightbox, so the "clipped" choreography from the design page can be felt
 * on the real page: real tile sizes, real photo counts, real chips. It is
 * the design-page experiment generalised twice over:
 *
 * - the fixed 112x80 spike tile becomes whatever box the mosaic grid gives
 *   each frame, re-measured through a ResizeObserver (`CoverImg` emulates
 *   `object-cover` with an oversized element, because Fancybox's zoom gate
 *   measures the ELEMENT and `cover` loses the photo's aspect);
 * - the clip insets are computed at open/close time from the live rects of
 *   the current slide's thumbnail and its anchor, instead of constants.
 *
 * Anchors, not buttons: Fancybox's own integration contract (`bind()` needs
 * `[data-fancybox]` anchors with an `href`), which is also what makes this
 * NOT a drop-in swap for `Gallery.tsx` — the call-site markup changes shape.
 * Photos past the five visible tiles render as hidden anchors so the group
 * and the thumbnail strip stay complete; their open falls back to Fancybox's
 * fade (nothing on screen to zoom from), same as the shipped "All N photos"
 * grid never zoomed either. */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Images, Ruler } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fancybox, type FancyboxOptions } from "@fancyapps/ui";
import type { PropertyPhoto } from "@/lib/api";
import { SIZES, slideSrc, srcSet } from "@/lib/photos";

import "@fancyapps/ui/dist/fancybox/fancybox.css";

/** `object-cover` rebuilt as geometry: the <img> keeps the photo's true
 *  shape, oversized to cover the anchor's box and centred with numeric
 *  offsets. Constraints inherited from the design-page spike, both learned
 *  from Fancybox's measuring code: no inline transform (it reads as
 *  clipped-by-carousel and kills the zoom), and the state update must be
 *  idempotent (the observer re-fires on layout).  */
function CoverImg({
  photo,
  alt,
  sizes,
}: {
  photo: PropertyPhoto;
  alt: string;
  sizes: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [geom, setGeom] = useState<CSSProperties | null>(null);

  useEffect(() => {
    const img = ref.current;
    const box = img?.parentElement;
    if (!img || !box) return;
    const measure = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const bw = box.clientWidth;
      const bh = box.clientHeight;
      if (!bw || !bh) return;
      const ratio = img.naturalWidth / img.naturalHeight;
      const w = Math.max(bw, bh * ratio);
      const h = Math.max(bh, bw / ratio);
      const next = {
        width: w,
        height: h,
        left: (bw - w) / 2,
        top: (bh - h) / 2,
      };
      setGeom((prev) =>
        prev &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.left === next.left &&
        prev.top === next.top
          ? prev
          : next,
      );
    };
    if (img.complete) measure();
    img.addEventListener("load", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => {
      img.removeEventListener("load", measure);
      ro.disconnect();
    };
  }, []);

  return (
    /* eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized */
    <img
      ref={ref}
      src={photo.detailUrl ?? photo.url}
      srcSet={srcSet(photo)}
      sizes={sizes}
      alt={alt}
      decoding="async"
      className={geom ? "absolute max-w-none" : "h-full w-full object-cover"}
      style={geom ?? undefined}
    />
  );
}

export function FancyboxMosaic({
  photos,
  hasFloorplan,
}: {
  photos: PropertyPhoto[];
  hasFloorplan: boolean;
}) {
  const t = useTranslations("detail");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    /* The visible zooming image of ONE instance — scoped to the instance's
       container (a document-wide query can address a still-closing dialog
       when the visitor reopens quickly), and reaching through the panzoom
       viewport (the wrapper's direct child is a hidden lazy-load clone). */
    type WithContainer = { getContainer?: () => HTMLElement | undefined };
    type WithCarousel = {
      getCarousel?: () => {
        getPage?: () => { slides?: { thumbEl?: HTMLElement | null }[] };
      };
    };
    const containerOf = (fb: unknown): HTMLElement | null =>
      (fb as WithContainer)?.getContainer?.() ?? null;
    const flyingImgIn = (
      container: HTMLElement | null,
    ): HTMLImageElement | null =>
      container?.querySelector(
        ".fancybox__slide.is-selected .f-panzoom__viewport .f-panzoom__content",
      ) ?? null;
    const currentThumb = (fb: unknown): HTMLElement | null =>
      (fb as WithCarousel)?.getCarousel?.()?.getPage?.()?.slides?.[0]
        ?.thumbEl ?? null;

    /* The tile-band clip in the IMAGE's own coordinate space, from the live
       rects of the slide's thumbnail (the oversized CoverImg) and its
       clipping anchor. inset() percentages ride the zoom transform, so one
       value is correct at every scale of the flight. */
    const clipFor = (thumb: HTMLElement | null): string | null => {
      const anchor = thumb?.closest("a");
      if (!thumb || !anchor) return null;
      const tr = thumb.getBoundingClientRect();
      const ar = anchor.getBoundingClientRect();
      if (!tr.width || !tr.height || !ar.width || !ar.height) return null;
      const ix = Math.max(0, (((tr.width - ar.width) / 2) * 100) / tr.width);
      const iy = Math.max(0, (((tr.height - ar.height) / 2) * 100) / tr.height);
      return `inset(${iy.toFixed(3)}% ${ix.toFixed(3)}% ${iy.toFixed(3)}% ${ix.toFixed(3)}%)`;
    };

    let openPending = false;
    const options = {
      mainClass: "spike-clipped",
      on: {
        init: () => {
          openPending = true;
        },
        "Carousel.contentReady": (fb: unknown) => {
          if (!openPending) return;
          openPending = false;
          if (
            document.querySelectorAll(".fancybox__container.spike-clipped")
              .length > 1
          )
            return;
          const img = flyingImgIn(containerOf(fb));
          const clip = clipFor(currentThumb(fb));
          if (!img || !clip) return;
          const cs = getComputedStyle(img);
          if (cs.display !== "none" && cs.visibility !== "hidden") return;
          img.style.clipPath = clip;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              img.style.transition =
                "clip-path 500ms cubic-bezier(0.22, 1, 0.36, 1)";
              img.style.clipPath = "inset(0% 0% 0% 0%)";
              setTimeout(() => {
                img.style.transition = "";
              }, 650);
            }),
          );
        },
        shouldClose: (fb: unknown) => {
          const img = flyingImgIn(containerOf(fb));
          const clip = clipFor(currentThumb(fb));
          if (!img || !clip) return;
          img.style.transition =
            "clip-path 350ms cubic-bezier(0.33, 1, 0.68, 1)";
          img.style.clipPath = clip;
        },
      },
    };
    Fancybox.bind(el, "[data-fancybox]", options as Partial<FancyboxOptions>);
    return () => Fancybox.unbind(el);
  }, []);

  /* Warm the file the slide will ask for — same trade as the shipped
     mosaic's `warm`: a tile's srcset usually settles on `card`, so the
     detail file is a fresh fetch exactly when the zoom wants it. */
  const warm = (photo: PropertyPhoto) => {
    new Image().src = slideSrc(photo);
  };

  if (photos.length === 0) return null;
  const [hero, ...rest] = photos;
  const tiles = rest.slice(0, 4);
  const overflow = rest.slice(4);

  const layout =
    tiles.length >= 3
      ? "sm:grid-cols-[2fr_1fr_1fr] sm:grid-rows-2"
      : tiles.length >= 1
        ? "sm:grid-cols-2"
        : "";

  /* No data-caption anywhere: the bottom bar is the caption slot, and a
     "Photo n of N" there is noise the toolbar counter already carries.
     When PropertyPhoto grows a description field (deferred with the photo
     model), `data-caption` on the anchor is where it goes and this bar is
     where it will show — per slide, HTML allowed. The text stays as each
     tile's aria-label, where it does a job the bar never did. */
  const label = (n: number) => t("photoOf", { n, total: photos.length });

  return (
    <div ref={root} className="relative">
      <div
        className={`grid h-[380px] grid-cols-1 gap-2.5 overflow-hidden rounded-(--radius-card) ${layout}`}
      >
        <Tile
          photo={hero}
          alt={label(1)}
          className={tiles.length >= 3 ? "sm:row-span-2" : ""}
          sizes={SIZES.hero}
          onWarm={() => warm(hero)}
        />
        {tiles.map((photo, i) => (
          <Tile
            key={photo.url}
            photo={photo}
            alt={label(i + 2)}
            className="hidden sm:block"
            sizes={SIZES.tile}
            onWarm={() => warm(photo)}
          />
        ))}
        {overflow.map((photo, i) => (
          /* Slides without tiles: present for the group and the thumbnail
             strip, invisible on the page. Their open has nothing to zoom
             from and takes Fancybox's fade — the shipped grid overlay never
             zoomed these either. */
          <a
            key={photo.url}
            data-fancybox="detail-mosaic"
            data-thumb={photo.cardUrl ?? photo.url}
            href={slideSrc(photo)}
            className="hidden"
            tabIndex={-1}
            aria-hidden
          />
        ))}
      </div>

      <div className="absolute bottom-3 right-3 flex gap-2">
        {photos.length > 1 && (
          <PhotoButton
            onWarm={() => warm(hero)}
            onClick={() =>
              root.current
                ?.querySelector<HTMLAnchorElement>("a[data-fancybox]")
                ?.click()
            }
          >
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
  );
}

function Tile({
  photo,
  alt,
  className = "",
  sizes,
  onWarm,
}: {
  photo: PropertyPhoto;
  alt: string;
  className?: string;
  sizes: string;
  onWarm: () => void;
}) {
  return (
    /* A real link: focusable and Enter-activatable like the shipped
       mosaic's buttons, and the anchor shape Fancybox's `bind()` needs.
       `relative` because CoverImg positions itself against this box. */
    <a
      data-fancybox="detail-mosaic"
      href={slideSrc(photo)}
      onPointerEnter={onWarm}
      onFocus={onWarm}
      aria-label={alt}
      className={`relative block cursor-zoom-in overflow-hidden bg-surface-2 ${className}`}
    >
      <CoverImg photo={photo} alt="" sizes={sizes} />
    </a>
  );
}

function PhotoButton({
  onClick,
  onWarm,
  children,
}: {
  onClick: () => void;
  onWarm?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onWarm}
      onFocus={onWarm}
      className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-[0.8125rem] font-semibold text-[#15251f] shadow-(--shadow-card) transition-colors duration-(--dur-standard) hover:bg-white"
    >
      {children}
    </button>
  );
}

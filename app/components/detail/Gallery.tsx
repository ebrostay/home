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

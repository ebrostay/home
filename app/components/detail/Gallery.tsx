"use client";

import { useState } from "react";
import { Images, Ruler } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PropertyPhoto } from "@/lib/api";
import { SIZES, srcSet } from "@/lib/photos";
import { Dialog } from "@/components/ui/Dialog";

// A 2fr/1fr/1fr mosaic: one hero frame plus four supporting tiles. Anything
// past the fifth photo lives behind "All N photos" rather than making the
// visitor scrub a carousel to find out what the kitchen looks like.
export function Gallery({
  photos,
  hasFloorplan,
  name,
}: {
  photos: PropertyPhoto[];
  hasFloorplan: boolean;
  name: string;
}) {
  const t = useTranslations("detail");
  const [allOpen, setAllOpen] = useState(false);

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
          />
          {tiles.map((photo, i) => (
            <Frame
              key={photo.url}
              photo={photo}
              alt={t("photoOf", { n: i + 2, total: photos.length })}
              className="hidden sm:block"
            />
          ))}
        </div>

        <div className="absolute bottom-3 right-3 flex gap-2">
          {/* Only worth offering when the grid is actually hiding something. */}
          {photos.length > tiles.length + 1 && (
            <PhotoButton onClick={() => setAllOpen(true)}>
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

      <Dialog open={allOpen} onClose={() => setAllOpen(false)} title={name}>
        <div className="grid max-h-[70vh] gap-2.5 overflow-y-auto sm:grid-cols-2">
          {photos.map((photo, i) => (
            <Frame
              key={photo.url}
              photo={photo}
              alt={t("photoOf", { n: i + 1, total: photos.length })}
              className="aspect-[4/3] rounded-(--radius-control)"
              lazy
            />
          ))}
        </div>
      </Dialog>
    </>
  );
}

function Frame({
  photo,
  alt,
  className = "",
  lazy = false,
  sizes = SIZES.tile,
}: {
  photo: PropertyPhoto;
  alt: string;
  className?: string;
  /** How wide this frame is actually drawn. The hero is twice the others, and
   *  one shared value would make the tiles fetch the hero's size. */
  sizes?: string;
  /** The grid above the fold is the page's headline image — deferring it would
   *  delay the one photo the visitor came for. Everything behind a click is a
   *  different matter, and most visitors never open it. */
  lazy?: boolean;
}) {
  return (
    <div className={`overflow-hidden bg-surface-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized */}
      <img
        src={photo.detailUrl ?? photo.url}
        srcSet={srcSet(photo)}
        sizes={sizes}
        alt={alt}
        loading={lazy ? "lazy" : undefined}
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
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

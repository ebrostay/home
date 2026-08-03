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

import { useEffect, useRef } from "react";
import { Fancybox } from "@fancyapps/ui";
import type { PropertyPhoto } from "@/lib/api";
import { slideSrc } from "@/lib/photos";

import "@fancyapps/ui/dist/fancybox/fancybox.css";

export function FancyboxGallery({
  photos,
  crop,
  group,
}: {
  photos: readonly PropertyPhoto[];
  /** `true` renders the thumbnails as our real mosaic does — a fixed box with
   *  `object-cover`, so the thumbnail is a CROP of the photo and their aspect
   *  ratios disagree. `false` lets each thumbnail keep the photo's own shape.
   *
   *  This is the whole experiment. Fancybox's zoom-in animates the thumbnail's
   *  rectangle out to the slide's; when the thumbnail is a crop, the two are
   *  not the same picture and there is no honest interpolation between them.
   *  The observation that prompted this: sample-home-1.jpg (3% aspect
   *  mismatch) zoomed, zaragoza-hero.webp (7%) and sample-home-2.jpg (119% —
   *  a portrait photo in a landscape box) did not. */
  crop: boolean;
  /** Fancybox groups by this, so the two rows must not share one. */
  group: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    /* Deliberately close to stock. The question this spike answers is whether
       Fancybox's own look and feel is more refined than what we built, so
       configuring it into our idiom would be answering a different one. */
    Fancybox.bind(el, "[data-fancybox]", {});
    return () => Fancybox.unbind(el);
  }, []);

  return (
    <div ref={root} className="flex flex-wrap gap-3">
      {photos.map((photo, i) => (
        <a
          key={photo.url}
          data-fancybox={group}
          data-caption={`Photo ${i + 1} of ${photos.length}`}
          href={slideSrc(photo)}
          className="block overflow-hidden rounded-(--radius-control) border border-line"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt=""
            className={crop ? "h-20 w-28 object-cover" : "h-20 w-auto"}
          />
        </a>
      ))}
    </div>
  );
}

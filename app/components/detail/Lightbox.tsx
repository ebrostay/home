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

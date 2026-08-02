"use client";

/* SPIKE ONLY — spike/fancybox-comparison, Task 8. Not for merge.
 *
 * Mirrors `Lightbox.tsx`'s contract exactly (same four props, same photo
 * type) so the two can sit side by side on the design page and be judged on
 * the same terms. Fancybox is vanilla JS: there is no `<Fancybox open={...}>`
 * to render. This wrapper is the cost of adopting it — a `useEffect` that
 * imperatively opens an instance when `index` goes from `null` to a number,
 * closes it when the prop says to, and tears it down on unmount. Written the
 * way it would actually ship, not the minimum that compiles. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Fancybox } from "@fancyapps/ui";
import type { FancyboxInstance } from "@fancyapps/ui/dist/fancybox/fancybox";
import type { PropertyPhoto } from "@/lib/api";
import { slideSrc } from "@/lib/photos";

import "@fancyapps/ui/dist/fancybox/fancybox.css";

export function FancyboxLightbox({
  photos,
  index,
  onClose,
  overlay,
}: {
  photos: readonly PropertyPhoto[];
  /** `null` is closed. Any number opens on that slide. Same contract as
   *  `Lightbox.tsx` — the point of this file is to be a drop-in comparison,
   *  not a different shape to also evaluate. */
  index: number | null;
  onClose: () => void;
  /** The YARL wrapper gets this for free as a `render.controls` slot with an
   *  index tracked through `on.view`. Fancybox has no controls slot at all:
   *  what follows is a React portal into a DOM node this effect creates and
   *  appends into Fancybox's own container, with the index tracked through
   *  the `Carousel.change` event — see the question 2 write-up in the spec
   *  for whether this counts as "as easily". */
  overlay?: (index: number) => React.ReactNode;
}) {
  const t = useTranslations("detail");

  /* The live instance, so effect cleanup and the destroy handler can tell
     each other apart from a stale closure. Not state — an instance handle
     changing should never itself cause a re-render. */
  const instanceRef = useRef<FancyboxInstance | null>(null);

  /* Mirrors YARL's `on: { view: ... } → setCurrent`. Fancybox's equivalent
     event is `Carousel.change`, re-emitted on the Fancybox instance from the
     underlying Carousel with the signature
     `(fancybox, carousel, newIndex, oldIndex)` — one more argument than YARL
     hands back, because Fancybox is one instance wrapping two objects
     (Fancybox itself, and the Carousel that does the sliding) where YARL is
     one. */
  const [current, setCurrent] = useState(index ?? 0);

  /* The node the overlay portals into. Created fresh per opening because
     Fancybox tears down and rebuilds its container on every open/close — a
     node captured once at mount would go stale the first time the visitor
     closed and reopened the lightbox. */
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (index === null) {
      /* A parent-driven close that did not originate from Fancybox itself
         (nothing in this design page does that today, but `Lightbox.tsx`'s
         contract allows it, so this wrapper has to honour it too). Ask for
         the closing animation rather than tearing the DOM out from under
         it — `destroy()` in the cleanup below is the abrupt fallback. */
      instanceRef.current?.close();
      return;
    }

    const slides = photos.map((photo, i) => ({
      src: slideSrc(photo),
      alt: t("photoOf", { n: i + 1, total: photos.length }),
      caption: t("photoOf", { n: i + 1, total: photos.length }),
    }));

    /* eslint-disable-next-line react-hooks/set-state-in-effect -- this IS the
       external system: `current` tracks which slide Fancybox is showing, and
       the opening index is the one value Fancybox itself does not emit a
       `Carousel.change` for (that event fires on navigation, not on open).
       Same carve-out as the URL-restore effects in `app/[locale]/page.tsx`. */
    setCurrent(index);

    /* `Fancybox.show()`'s return value is NOT the instance at runtime, despite
       its type (`FancyboxInstance | undefined`) promising one — read from
       `node_modules/@fancyapps/ui/dist/fancybox/fancybox.js`: the object
       literal's `init` method never executes a `return`, so `D().init(e,t)`,
       which is exactly what `show()` returns, evaluates to `undefined` every
       time. Confirmed by instrumenting it, not assumed from the types. The
       only reliable handle is the `ready` event, fired once the container,
       carousel and slides all exist — so that is what sets `instanceRef`
       and builds the overlay host below, not the call's return value. */
    Fancybox.show(slides, {
      startIndex: index,
      // Fixed dark, matching `.ebrostay-lightbox`'s design intent — see the
      // theming question in the write-up for how far "auto" gets before this
      // is the only viable choice anyway.
      theme: "dark",
      // Fancybox scopes ~160 `--f-*` custom properties onto `.fancybox__
      // container` itself, so a class here + a handful of overrides in
      // globals.css (`.ebrostay-fancybox .fancybox__container { ... }`) beats
      // it on specificity with no `!important` — see the theming question.
      mainClass: "ebrostay-fancybox",
      l10n: {
        CLOSE: t("lightbox.close"),
        NEXT: t("lightbox.next"),
        PREV: t("lightbox.previous"),
        TOGGLE_THUMBS: t("lightbox.thumbnails"),
        MODAL: t("lightbox.gallery"),
      },
      Carousel: {
        Thumbs: { type: "classic" },
        Toolbar: {
          display: {
            left: ["counter"],
            middle: [],
            right: ["thumbs", "close"],
          },
        },
      },
      on: {
        ready: (fancybox: FancyboxInstance) => {
          instanceRef.current = fancybox;

          /* No `render.controls` slot exists, so the overlay's mount point
             is a plain DOM node this handler creates and appends into the
             container Fancybox just finished building, portaled into from
             the return value below, and never touched by Fancybox's own
             render cycle so it survives every slide change untouched. */
          const container = fancybox.getContainer();
          if (container) {
            const host = document.createElement("div");
            host.className = "fancybox-overlay-host";
            container.appendChild(host);
            setOverlayHost(host);
          }
        },
        "Carousel.change": (
          _fancybox: FancyboxInstance,
          _carousel: unknown,
          i: number,
        ) => setCurrent(i),
        destroy: () => {
          instanceRef.current = null;
          setOverlayHost(null);
          onClose();
        },
      },
    });

    return () => {
      /* Idempotent by Fancybox's own contract (`destroy()` no-ops once the
         instance is already `Destroyed`), which is what makes it safe to
         call unconditionally here even on the run where `destroy` fired
         Fancybox-side first and already cleared `instanceRef.current`. */
      instanceRef.current?.destroy();
      instanceRef.current = null;
      setOverlayHost(null);
    };
    /* `t`, `photos` and `onClose` intentionally excluded below: re-running
       this effect on every render for translation/array/callback identity
       would tear down and rebuild the whole Fancybox instance mid-viewing,
       which is worse than a captions update lost until the next open. YARL's
       `slidesFor` memo (`Lightbox.tsx`) exists to solve exactly this;
       Fancybox's imperative API has no memoisation to hand it to, so the fix
       here is "don't depend on it". */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return overlayHost && overlay
    ? createPortal(overlay(current), overlayHost)
    : null;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { SECTIONS, type SectionKey } from "@/lib/manage";

// The page's section navigation, in the same hairline-plus-mono-label voice as
// the section rules. Deliberately not a pill row — that vocabulary belongs to
// the global header, and a second pill row would read as a second site nav.
//
// Unstuck it is a divider drawn across the page. Stuck it takes a surface and
// a shadow, so it stops looking like part of the content it is now covering.
//
// The active tab is a SCROLL SPY, not a click state: the owner scrolls this
// page far more than they click it, and a nav that only updates on click is
// lying most of the time.
//
// Both offsets are measured rather than hardcoded. The sticky top resolves from
// CSS (which is where the header and context-bar heights already live), and the
// spy line is the nav's own bottom edge — so the two sticky bars wrapping on a
// narrow screen moves the thresholds with them instead of desynchronising them.

export function SectionNav({
  labels,
  ariaLabel,
}: {
  labels: Record<SectionKey, string>;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState<SectionKey>(SECTIONS[0]);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;

    const measure = () => {
      const box = nav.getBoundingClientRect();
      const stickyTop = parseFloat(getComputedStyle(nav).top) || 0;
      setStuck(box.top <= stickyTop + 0.5);

      // The last section whose heading has passed under the nav wins. Reading
      // forward and keeping the last match handles the final section, which
      // may never reach the line on a short page.
      //
      // The slack matters: an anchor jump parks its target's heading at exactly
      // the section's scroll-margin-top, which lands within a pixel of the nav's
      // bottom edge. Without room to spare, whether the tab you just clicked
      // lights up comes down to sub-pixel rounding.
      const line = box.bottom + 16;
      let current: SectionKey = SECTIONS[0];
      for (const key of SECTIONS) {
        const el = document.getElementById(`sec-${key}`);
        if (el && el.getBoundingClientRect().top <= line) current = key;
      }
      setActive(current);
    };

    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <nav
      ref={ref}
      aria-label={ariaLabel}
      className={`sticky top-(--manage-nav-top) z-20 -mx-6 border-b border-line-strong px-6 transition-colors duration-(--dur-standard) ${
        stuck ? "bg-surface shadow-[0_6px_14px_-12px_rgba(21,37,31,0.5)]" : "bg-transparent"
      }`}
    >
      {/* Wraps at desktop widths where it fits on one line anyway; scrolls
          sideways on a phone, where wrapping five mono labels would stack a
          second sticky bar on top of the first. Scrolling is confined to the
          narrow variant so the active underline — which sits 1px proud of the
          list box to break the rule — is never clipped by a scroll container
          at the width the design was drawn for. */}
      <ul className="flex gap-x-[26px] max-[40rem]:flex-nowrap max-[40rem]:overflow-x-auto min-[40rem]:flex-wrap">
        {SECTIONS.map((key) => (
          <li key={key} className="relative">
            <a
              href={`#sec-${key}`}
              aria-current={active === key ? "true" : undefined}
              className={`data block py-[12px] pb-[11px] text-[0.6875rem] tracking-[0.11em] transition-colors duration-(--dur-standard) ${
                active === key ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {labels[key]}
            </a>
            {/* Sits ON the container's bottom rule, breaking it — the tab is
                part of the line, not a marker floating under it. */}
            {active === key && (
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand"
              />
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

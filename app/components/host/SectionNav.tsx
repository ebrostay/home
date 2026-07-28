"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ListChecks } from "lucide-react";

// In-page section navigation for the owner surfaces — one component, three
// rungs, climbed by how much room there is:
//
//   rail  →  the vertical list beside the content, while the page has a
//            second column at all (editor only)
//   bar   →  the hairline row of mono labels
//   sheet →  a single "Sections" control that opens the whole list
//
// It replaces two implementations that did the same job under different rules:
// different breakpoints (56rem and 40rem), one sticky and one not, one a
// scroll spy and one deliberately not. Both overflowed their box below roughly
// 560px, and the editor's was `position: static`, so the one nav that reports
// unsaved work scrolled away and never came back.
//
// ── Two different questions, deliberately ────────────────────────────────
// Manage's nav answers "where am I in a long read" — hence the scroll spy.
// The editor's answers "what have I touched and what is left" — hence the
// discs, and NO spy: a highlight that follows the scroll would compete with
// the discs for the same glance. Same furniture, different signal, and both
// are opt-in below.
//
// ── Why fit is measured ─────────────────────────────────────────────────
// Whether the bar fits is asked of the bar, not of a breakpoint. A pixel
// number can only be right for one language: the same six sections need 735px
// in English and 760px in Spanish, and the editor's copy needs another ~125px
// because it also carries discs. Measuring is right in every language and
// stays right when a section is added.
//
// The measurement uses a hidden RULER — a copy of the row always laid out at
// natural width. Measuring the visible row would oscillate: switching to the
// sheet removes the row, which makes the row fit, which switches back.

export type SectionStatus = "edited" | "needs" | "idle";

/** How tall the section nav is, for whatever needs to scroll clear of it.
 *  On the root because the consumer — every SectionCard — is scattered across
 *  the page, and there is one nav. */
const publishNavHeight = (px: number) =>
  document.documentElement.style.setProperty("--section-nav-h", `${px}px`);

export function SectionNav<K extends string>({
  sections,
  labels,
  ariaLabel,
  sheetLabel,
  changedLabel,
  stickyTop,
  status,
  spy = false,
  railQuery,
  railTop,
}: {
  sections: readonly K[];
  labels: Record<K, string>;
  ariaLabel: string;
  /** Names the collapsed control — "Sections". */
  sheetLabel: string;
  /** Suffix on the count badge — "changed". Only used when `status` is given. */
  changedLabel?: string;
  /** CSS length for the sticky offset of the bar and the sheet, e.g.
   *  `"var(--section-nav-top)"`. Both rungs use it, so the two pages cannot
   *  drift apart on where the nav parks. */
  stickyTop: string;
  /** Per-section state discs. Absent means the page does not track status. */
  status?: Record<K, SectionStatus>;
  /** Follow the scroll and mark the section being read. */
  spy?: boolean;
  /** The media query under which this page draws a left column, e.g.
   *  `"(min-width: 64rem)"`. Omit and there is no rail rung at all.
   *
   *  It MUST be the same width as the page's own grid class. Passing it in
   *  keeps the two literals adjacent in the page, which is the only thing that
   *  reliably keeps them equal — a copy kept in here would drift the first
   *  time someone tuned the grid. */
  railQuery?: string;
  /** Sticky offset for the rail rung, which sits lower than the bar. */
  railTop?: string;
}) {
  const hasRail = useRailRoom(railQuery);

  // The rail sits BESIDE the content, so it hides none of it and an anchor
  // needs to clear only the bars above. The bar and the sheet do cover the
  // content, and publish their real height from `FittingNav`.
  useEffect(() => {
    if (!hasRail) return;
    publishNavHeight(0);
  }, [hasRail]);

  if (hasRail) {
    return (
      <nav
        aria-label={ariaLabel}
        className="sticky flex h-fit flex-col gap-0.5"
        style={{ top: railTop ?? stickyTop }}
      >
        <span className="data px-2.5 pb-2 text-[0.625rem] tracking-[0.12em] text-muted">
          {ariaLabel}
        </span>
        {sections.map((key) => (
          <a
            key={key}
            href={`#sec-${key}`}
            className={`flex items-center gap-2.5 rounded-(--radius-control) px-2.5 py-[7px] text-[0.8125rem] transition-colors duration-(--dur-standard) hover:bg-surface ${weight(status?.[key])}`}
          >
            {status && <Disc state={status[key]} big />}
            {labels[key]}
          </a>
        ))}
      </nav>
    );
  }

  return (
    <FittingNav
      sections={sections}
      labels={labels}
      ariaLabel={ariaLabel}
      sheetLabel={sheetLabel}
      changedLabel={changedLabel}
      stickyTop={stickyTop}
      status={status}
      spy={spy}
    />
  );
}

/** Edited wins over needs-attention: once you are working in a section, what
 *  you need to know is that the change is captured, not that it was thin. */
function weight(state: SectionStatus | undefined) {
  if (state === "edited") return "font-semibold text-brand-strong";
  if (state === "needs") return "font-semibold text-ink";
  return "font-medium text-body";
}

// ─────────────────────────────────────────────────────────────────────────
// The bar and the sheet, and the measurement that chooses between them.
// ─────────────────────────────────────────────────────────────────────────

function FittingNav<K extends string>({
  sections,
  labels,
  ariaLabel,
  sheetLabel,
  changedLabel,
  stickyTop,
  status,
  spy,
}: {
  sections: readonly K[];
  labels: Record<K, string>;
  ariaLabel: string;
  sheetLabel: string;
  changedLabel?: string;
  stickyTop: string;
  status?: Record<K, SectionStatus>;
  spy: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  const [stuck, setStuck] = useState(false);
  const active = useSpy(sections, spy, box);

  useEffect(() => {
    const measure = () => {
      const outer = box.current;
      const inner = ruler.current;
      if (!outer || !inner) return;

      // Against the CONTENT box, not the border box. This element is
      // `-mx-6 px-6` — it bleeds to the page edges and pads itself back in —
      // so 48px of its width is padding the bar cannot use. Measured against
      // the outer width, a 463px bar was called a fit inside 452px of content
      // and its last tab overhung by 11px.
      const style = getComputedStyle(outer);
      const available =
        outer.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);

      // getBoundingClientRect, not scrollWidth/clientWidth: those round to
      // whole pixels, so a row 0.4px too wide reports as fitting. Fractional
      // layout is normal at zoom levels that are not multiples of 100%, which
      // is exactly when that would show. The spare pixel absorbs the sub-pixel
      // jitter of a resize, so the two rungs cannot trade places for a frame.
      setFits(inner.getBoundingClientRect().width <= available + 1);

      // Parked against its offset. Read from the element rather than assumed,
      // so a sticky bar above it wrapping onto two lines moves this with it.
      const top = parseFloat(style.top) || 0;
      setStuck(outer.getBoundingClientRect().top <= top + 0.5);

      // How much of the content this nav covers, for the anchor offset the
      // sections scroll to. It changes between the bar and the sheet, and
      // again with the font — so like the context bar's height it is published
      // rather than written down.
      publishNavHeight(outer.getBoundingClientRect().height);
    };

    measure();
    const outer = box.current;
    const ro = new ResizeObserver(measure);
    if (outer) ro.observe(outer);
    // The ruler's own width changes when the font does — a reader's font-size
    // preference does not fire `resize`, so observing it is what catches that.
    if (ruler.current) ro.observe(ruler.current);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [sections]);

  return (
    <div
      ref={box}
      style={{ top: stickyTop }}
      // `min-w-0` is load-bearing, not tidiness. As a grid or flex item this
      // box defaults to `min-width: auto`, which means it refuses to shrink
      // below its own min-content width — and its content is a row of
      // `whitespace-nowrap` tabs. On the editor that made the track GROW to
      // 905px inside a 412px column, so the bar always fitted itself and the
      // sheet rung was unreachable. Allowing it to shrink is what lets the
      // measurement below ever be false.
      className={`sticky z-20 -mx-6 min-w-0 border-b border-line-strong px-6 transition-colors duration-(--dur-standard) ${
        // Unstuck it is a rule drawn across the page; stuck it takes a surface
        // and a shadow so it stops looking like part of what it now covers.
        stuck ? "bg-surface shadow-[0_6px_14px_-12px_rgba(21,37,31,0.5)]" : "bg-transparent"
      }`}
    >
      {/* Never visible, never announced. Its only job is to keep reporting the
          width the bar wants, including while the bar is not on screen. */}
      <div
        ref={ruler}
        aria-hidden
        className="pointer-events-none invisible absolute left-6 top-0 flex w-max gap-x-[26px]"
      >
        {sections.map((key) => (
          <span
            key={key}
            className="data flex items-center gap-2 whitespace-nowrap py-3 text-[0.6875rem] tracking-[0.11em]"
          >
            {status && <Disc state={status[key]} />}
            {labels[key]}
          </span>
        ))}
      </div>

      {fits ? (
        <nav aria-label={ariaLabel}>
          <ul className="flex gap-x-[26px]">
            {sections.map((key) => (
              <li key={key} className="relative">
                <a
                  href={`#sec-${key}`}
                  aria-current={active === key ? "true" : undefined}
                  className={`data flex items-center gap-2 whitespace-nowrap py-3 text-[0.6875rem] tracking-[0.11em] transition-colors duration-(--dur-standard) ${
                    active === key ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {status && <Disc state={status[key]} />}
                  {labels[key]}
                </a>
                {/* Sits ON the container's rule, breaking it — the tab is part
                    of the line, not a marker floating under it. */}
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
      ) : (
        <Sheet
          sections={sections}
          labels={labels}
          ariaLabel={ariaLabel}
          sheetLabel={sheetLabel}
          changedLabel={changedLabel}
          status={status}
          active={active}
        />
      )}
    </div>
  );
}

function Sheet<K extends string>({
  sections,
  labels,
  ariaLabel,
  sheetLabel,
  changedLabel,
  status,
  active,
}: {
  sections: readonly K[];
  labels: Record<K, string>;
  ariaLabel: string;
  sheetLabel: string;
  changedLabel?: string;
  status?: Record<K, SectionStatus>;
  active: K | null;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const changed = status ? sections.filter((k) => status[k] === "edited").length : 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Where there is a scroll spy the trigger names the section being read;
  // where there is not, it names itself and reports what has changed. Each
  // page's trigger says the thing that page's nav is for.
  const summary = active ? labels[active] : sheetLabel;

  return (
    <nav aria-label={ariaLabel} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-2.5 text-left"
      >
        <ListChecks size={15} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
        <span className="data flex-1 truncate text-[0.6875rem] tracking-[0.11em] text-ink">
          {summary}
        </span>
        {changed > 0 && changedLabel && (
          <span className="data shrink-0 rounded-full bg-brand px-2 py-0.5 text-[0.625rem] text-white">
            {changed} {changedLabel}
          </span>
        )}
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-(--dur-standard) ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 top-full z-50 flex flex-col rounded-b-(--radius-card) border border-line bg-surface p-1 shadow-(--shadow-pop)">
            {sections.map((key) => (
              <a
                key={key}
                href={`#sec-${key}`}
                aria-current={active === key ? "true" : undefined}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 rounded-(--radius-control) px-2.5 py-2 text-[0.8125rem] hover:bg-surface-2 ${
                  active === key ? "font-semibold text-ink" : "text-body"
                }`}
              >
                {status && <Disc state={status[key]} big />}
                <span className="truncate">{labels[key]}</span>
              </a>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────

/**
 * Does the page still have room for a left column?
 *
 * The query comes from the CALLER, because the caller is what draws the
 * column. It has to be the same width as the page's own grid class, and the
 * only way to keep two literals in step is to keep them next to each other —
 * so they live together in the page, not one here and one there.
 *
 * `matchMedia` rather than arithmetic on the root font size: it is the same
 * rem query the CSS uses, evaluated by the browser, so zoom and a reader's
 * font-size preference are handled without our doing sums that could disagree
 * with the grid.
 *
 * `false` until mounted — there is no `matchMedia` during the static export,
 * and a first client render disagreeing with the server's is a hydration
 * mismatch.
 */
function useRailRoom(query: string | undefined) {
  const [room, setRoom] = useState(false);

  useEffect(() => {
    if (!query) return;
    const mq = window.matchMedia(query);
    const read = () => setRoom(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);

  return Boolean(query) && room;
}

/**
 * The last section whose heading has passed under the nav. Reading forward and
 * keeping the last match handles the final section, which on a short page may
 * never reach the line.
 *
 * The line is the NAV'S OWN BOTTOM EDGE, measured every time. It cannot be a
 * number: the sticky stack above it is the header plus a context bar that
 * wraps to two or three rows as the window narrows, so a fixed line is right
 * at exactly one width. Written as a constant it read the section *above* the
 * one you had just jumped to — click Availability, watch Pricing light up.
 *
 * Measuring the element also makes it self-correcting: parked, its bottom is
 * wherever the stack actually ends; unparked, you are at the top of the page
 * and the first section is the right answer anyway.
 */
function useSpy<K extends string>(
  sections: readonly K[],
  enabled: boolean,
  nav: React.RefObject<HTMLElement | null>,
) {
  const [active, setActive] = useState<K | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const measure = () => {
      const box = nav.current?.getBoundingClientRect();
      if (!box) return;
      // The slack matters: an anchor jump parks its target at exactly the
      // section's scroll-margin-top, which lands within a pixel of this edge.
      // Without room to spare, whether the tab you just clicked lights up comes
      // down to sub-pixel rounding.
      const line = box.bottom + 16;

      let current: K | null = sections[0] ?? null;
      for (const key of sections) {
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
  }, [sections, enabled, nav]);

  return active;
}

/** Two sizes because the rungs set type at two sizes: the rail's 13px label
 *  carries the editor's original 16px disc, and the bar's 11px mono label would
 *  be overpowered by it. */
function Disc({ state, big = false }: { state: SectionStatus; big?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full ${big ? "h-4 w-4" : "h-[13px] w-[13px]"} ${
        state === "edited"
          ? "bg-brand"
          : state === "needs"
            ? "shadow-[inset_0_0_0_1.5px_var(--warn)]"
            : "shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
      }`}
    >
      {state === "edited" && (
        <Check size={big ? 10 : 8} strokeWidth={big ? 3.5 : 4} className="text-white" />
      )}
      {state === "needs" && (
        <span className={`rounded-full bg-warn ${big ? "h-[5px] w-[5px]" : "h-[4px] w-[4px]"}`} />
      )}
    </span>
  );
}

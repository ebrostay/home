"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ListChecks } from "lucide-react";

// PROTOTYPE — the three narrow-width strategies for in-page section
// navigation, side by side. Not shipped anywhere; it exists so the choice is
// made by looking rather than by arguing.
//
// The problem it is here to settle: the editor's rail and Manage's section nav
// do the same job with different rules — different breakpoints (56rem vs
// 40rem), one sticky and one not, one a scroll spy and one deliberately not —
// and both overflow their box below roughly 560px. At 380px the editor's rail
// is 853px of content in a 380px window, clipped mid-word, with nothing on
// screen to say so.
//
// Each frame below is a REAL scroll container at a chosen width, so stickiness
// can be judged too — half the complaint is that the editor's rail scrolls
// away, and a static screenshot cannot show that.

export type LabSection = {
  key: string;
  label: string;
  /** `edited` = changed and unsaved, `needs` = still wants something. Mirrors
   *  the editor's own two-state disc. */
  state: "edited" | "needs" | "idle";
};

type Variant = "scroll" | "sheet" | "wrap";

export function SectionNavLab({
  sections,
  labels,
}: {
  sections: LabSection[];
  labels: {
    width: string;
    scroll: string;
    scrollNote: string;
    sheet: string;
    sheetNote: string;
    wrap: string;
    wrapNote: string;
    trigger: string;
    changed: string;
    body: string;
  };
}) {
  // Real device widths, not round numbers: 320 is the smallest phone still in
  // use, 375 an iPhone SE/13 mini, 430 a current large phone, 560 the width
  // where both live navs currently start to overflow.
  const WIDTHS = [320, 375, 430, 560, 640];
  const [width, setWidth] = useState(375);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="data text-[0.65625rem] tracking-[0.1em] text-muted">
          {labels.width}
        </span>
        {WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWidth(w)}
            aria-pressed={width === w}
            className={`data rounded-(--radius-control) border px-2.5 py-1 text-[0.6875rem] transition-colors duration-(--dur-standard) ${
              width === w
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface text-body hover:border-ink"
            }`}
          >
            {w}
          </button>
        ))}
        <input
          type="range"
          min={280}
          max={720}
          step={5}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          aria-label={labels.width}
          className="h-1 w-40 accent-[var(--brand)]"
        />
        <span className="data text-[0.6875rem] text-muted">{width}px</span>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Frame title={labels.scroll} note={labels.scrollNote} width={width} variant="scroll" sections={sections} labels={labels} />
        <Frame title={labels.sheet} note={labels.sheetNote} width={width} variant="sheet" sections={sections} labels={labels} />
        <Frame title={labels.wrap} note={labels.wrapNote} width={width} variant="wrap" sections={sections} labels={labels} />
      </div>
    </div>
  );
}

function Frame({
  title,
  note,
  width,
  variant,
  sections,
  labels,
}: {
  title: string;
  note: string;
  width: number;
  variant: Variant;
  sections: LabSection[];
  labels: { trigger: string; changed: string; body: string };
}) {
  return (
    <div className="flex flex-col gap-2" style={{ width }}>
      <p className="data text-[0.65625rem] tracking-[0.1em] text-ink">{title}</p>
      {/* A real scroll container, so `sticky` behaves as it would on a page. */}
      <div className="h-[19rem] overflow-y-auto rounded-(--radius-card) border border-line bg-page">
        <div className="sticky top-0 z-10 bg-page">
          {variant === "scroll" && <ScrollRow sections={sections} />}
          {variant === "sheet" && <SheetNav sections={sections} labels={labels} />}
          {variant === "wrap" && <WrapRow sections={sections} />}
        </div>
        <div className="flex flex-col gap-3 p-3">
          {sections.map((s) => (
            <div key={s.key} className="rounded-(--radius-control) border border-line bg-surface p-3">
              <p className="text-[0.8125rem] font-semibold text-ink">{s.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{labels.body}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">{note}</p>
    </div>
  );
}

// ── A ─────────────────────────────────────────────────────────────────────
// Horizontal scroll, with the two things the live version is missing: an edge
// fade that appears only when there is more in that direction, and the
// scrollbar hidden so the fade is the only affordance (macOS overlay
// scrollbars are invisible at rest, which is why the live one looks clipped
// rather than scrollable).
function ScrollRow({ sections }: { sections: LabSection[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative border-b border-line">
      <div
        ref={ref}
        className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((s) => (
          <a
            key={s.key}
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex shrink-0 items-center gap-2 rounded-(--radius-control) px-2.5 py-[7px] text-[0.8125rem] text-body hover:bg-surface"
          >
            <Disc state={s.state} />
            {s.label}
          </a>
        ))}
      </div>
      {edges.left && <Fade side="left" />}
      {edges.right && <Fade side="right" />}
    </div>
  );
}

const Fade = ({ side }: { side: "left" | "right" }) => (
  <span
    aria-hidden
    className={`pointer-events-none absolute inset-y-0 w-8 ${
      side === "left"
        ? "left-0 bg-linear-to-r from-page to-transparent"
        : "right-0 bg-linear-to-l from-page to-transparent"
    }`}
  />
);

// ── B ─────────────────────────────────────────────────────────────────────
// One full-width control that opens the whole list. Fits any width by
// construction, and gives the status discs a vertical list where six of them
// are legible at once — which is the editor rail's actual job.
//
// The trigger counts CHANGED sections rather than naming the current one: the
// editor is deliberately not a scroll spy, and a count is the thing an owner
// is actually tracking on that page.
function SheetNav({
  sections,
  labels,
}: {
  sections: LabSection[];
  labels: { trigger: string; changed: string };
}) {
  const [open, setOpen] = useState(false);
  const changed = sections.filter((s) => s.state === "edited").length;

  return (
    <div className="relative border-b border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[0.8125rem] font-semibold text-ink"
      >
        <ListChecks size={15} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
        <span className="flex-1 truncate">{labels.trigger}</span>
        {changed > 0 && (
          <span className="data shrink-0 rounded-full bg-brand px-2 py-0.5 text-[0.625rem] text-white">
            {changed} {labels.changed}
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
        <div className="absolute inset-x-0 top-full z-20 flex flex-col border-b border-line bg-surface p-1 shadow-(--shadow-pop)">
          {sections.map((s) => (
            <a
              key={s.key}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              className="flex items-center gap-2.5 rounded-(--radius-control) px-2.5 py-2 text-[0.8125rem] text-body hover:bg-surface-2"
            >
              <Disc state={s.state} />
              <span className="truncate">{s.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── C ─────────────────────────────────────────────────────────────────────
// Nothing hidden, no new interaction — and on a phone it is three lines of
// sticky nav before any content.
function WrapRow({ sections }: { sections: LabSection[] }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2">
      {sections.map((s) => (
        <a
          key={s.key}
          href="#"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-2 rounded-(--radius-control) px-2.5 py-[7px] text-[0.8125rem] text-body hover:bg-surface"
        >
          <Disc state={s.state} />
          {s.label}
        </a>
      ))}
    </div>
  );
}

/** The editor's own indicator, unchanged — the point of the comparison is the
 *  layout around it, so this must not quietly improve at the same time. */
function Disc({ state }: { state: LabSection["state"] }) {
  return (
    <span
      aria-hidden
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
        state === "edited"
          ? "bg-brand"
          : state === "needs"
            ? "shadow-[inset_0_0_0_1.5px_var(--warn)]"
            : "shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
      }`}
    >
      {state === "edited" && <Check size={10} strokeWidth={3.5} className="text-white" />}
      {state === "needs" && <span className="h-[5px] w-[5px] rounded-full bg-warn" />}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ListChecks } from "lucide-react";
import type { LabSection } from "@/components/design/SectionNavLab";

// PROTOTYPE — the two proposed ladders, side by side.
//
//   Manage:  hairline bar  →  (does not fit)  →  jump-to-section
//   Edit:    left rail  →  (no room for a column)  →  hairline bar
//                       →  (does not fit)  →  jump-to-section
//
// The rungs are shared, which is the point: the editor's middle rung IS
// Manage's top rung, same component and same styling, differing only in
// whether it carries status discs. Today they are two implementations that
// merely resemble each other.
//
// ── Why fit is MEASURED, not a breakpoint ────────────────────────────────
// The current code switches at fixed widths (56rem for the rail, 40rem for
// Manage's bar) and those numbers can only be right for one language. English
// "What the home offers" is nearly twice "Equipamiento"; a breakpoint tuned on
// Spanish clips English and vice versa. Asking the row whether it actually
// fits is correct in both, and stays correct when a section is added.
//
// The measurement uses a hidden RULER — a copy of the row that is always laid
// out at its natural width. Measuring the visible row instead would oscillate:
// switching to the dropdown removes the row, which makes the row fit, which
// switches back.

/** Where the editor's page layout stops having a left column at all. This one
 *  IS a breakpoint rather than a measurement, because it is a decision about
 *  the page grid — whether a second column exists — not about a label. */
export const RAIL_MIN = 896; // 56rem, the editor's current value

export function SectionNavLadder({
  sections,
  labels,
}: {
  sections: LabSection[];
  labels: {
    width: string;
    manage: string;
    edit: string;
    stage: string;
    stageRail: string;
    stageBar: string;
    stageSheet: string;
    trigger: string;
    changed: string;
    body: string;
  };
}) {
  const WIDTHS = [320, 375, 430, 560, 760, 1000];
  const [width, setWidth] = useState(430);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="data text-[0.65625rem] tracking-[0.1em] text-muted">{labels.width}</span>
        {WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWidth(w)}
            aria-pressed={width === w}
            className={`data rounded-(--radius-control) border px-2.5 py-1 text-[0.6875rem] transition-colors duration-(--dur-standard) ${
              width === w ? "border-ink bg-ink text-white" : "border-line bg-surface text-body hover:border-ink"
            }`}
          >
            {w}
          </button>
        ))}
        <input
          type="range"
          min={280}
          max={1100}
          step={5}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          aria-label={labels.width}
          className="h-1 w-48 accent-[var(--brand)]"
        />
        <span className="data text-[0.6875rem] text-muted">{width}px</span>
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <Ladder page="manage" width={width} sections={sections} labels={labels} />
        <Ladder page="edit" width={width} sections={sections} labels={labels} />
      </div>
    </div>
  );
}

function Ladder({
  page,
  width,
  sections,
  labels,
}: {
  page: "manage" | "edit";
  width: number;
  sections: LabSection[];
  labels: {
    manage: string;
    edit: string;
    stage: string;
    stageRail: string;
    stageBar: string;
    stageSheet: string;
    trigger: string;
    changed: string;
    body: string;
  };
}) {
  // The editor keeps its rail while the page has room for two columns. Manage
  // has no rail rung at all — it never had a left column.
  const rail = page === "edit" && width >= RAIL_MIN;
  const [barFits, setBarFits] = useState(true);
  const stage = rail ? labels.stageRail : barFits ? labels.stageBar : labels.stageSheet;

  return (
    <div className="flex flex-col gap-2" style={{ width }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="data text-[0.65625rem] tracking-[0.1em] text-ink">
          {page === "manage" ? labels.manage : labels.edit}
        </p>
        <p className="data text-[0.625rem] tracking-[0.08em] text-muted">
          {labels.stage}: {stage}
        </p>
      </div>

      <div className="h-[21rem] overflow-y-auto rounded-(--radius-card) border border-line bg-page">
        {rail ? (
          // 13rem is the editor's real rail column, not a demo-friendly
          // number — at 11rem "Normas y condiciones" truncated, which would
          // have shown a problem the live page does not have.
          <div className="grid grid-cols-[13rem_minmax(0,1fr)] gap-5 p-3">
            <Rail sections={sections} />
            <Body sections={sections} note={labels.body} />
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 bg-page">
              <FittingBar
                sections={sections}
                showDiscs={page === "edit"}
                labels={labels}
                onFit={setBarFits}
              />
            </div>
            <Body sections={sections} note={labels.body} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Rung 1 (edit only) ────────────────────────────────────────────────────
function Rail({ sections }: { sections: LabSection[] }) {
  return (
    <nav className="sticky top-3 flex h-fit flex-col gap-0.5">
      {sections.map((s) => (
        <a
          key={s.key}
          href="#"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-2.5 rounded-(--radius-control) px-2.5 py-[7px] text-[0.8125rem] text-body hover:bg-surface"
        >
          <Disc state={s.state} />
          <span className="truncate">{s.label}</span>
        </a>
      ))}
    </nav>
  );
}

// ── Rungs 2 and 3 ─────────────────────────────────────────────────────────
// One component. It renders the hairline bar while the bar fits and the
// jump-to-section control when it does not, so the two pages cannot drift.
function FittingBar({
  sections,
  showDiscs,
  labels,
  onFit,
}: {
  sections: LabSection[];
  /** The editor carries status; Manage carries position. Same bar either way. */
  showDiscs: boolean;
  labels: { trigger: string; changed: string };
  onFit: (fits: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);

  useEffect(() => {
    const measure = () => {
      const outer = box.current;
      const inner = ruler.current;
      if (!outer || !inner) return;
      // The ruler is always at natural width, so this answers "would the bar
      // fit" whether or not the bar is currently on screen.
      const next = inner.scrollWidth <= outer.clientWidth;
      setFits(next);
      onFit(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [onFit, sections]);

  return (
    <div ref={box} className="relative">
      {/* The ruler. Never visible, never announced, never clipped — its whole
          job is to keep reporting the width the bar wants. */}
      <div
        ref={ruler}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-x-[26px] px-3"
      >
        {sections.map((s) => (
          <span key={s.key} className="data flex items-center gap-2 whitespace-nowrap py-3 text-[0.6875rem] tracking-[0.11em]">
            {showDiscs && <Disc state={s.state} />}
            {s.label}
          </span>
        ))}
      </div>

      {fits ? (
        <Bar sections={sections} showDiscs={showDiscs} />
      ) : (
        <Sheet sections={sections} showDiscs={showDiscs} labels={labels} />
      )}
    </div>
  );
}

/** Manage's current voice — hairline rule, mono labels, the active tab sitting
 *  ON the rule rather than under it — now also the editor's middle rung. */
function Bar({ sections, showDiscs }: { sections: LabSection[]; showDiscs: boolean }) {
  const [active, setActive] = useState(sections[0]?.key);
  return (
    <nav className="border-b border-line-strong px-3">
      <ul className="flex gap-x-[26px]">
        {sections.map((s) => (
          <li key={s.key} className="relative">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActive(s.key);
              }}
              aria-current={active === s.key ? "true" : undefined}
              className={`data flex items-center gap-2 whitespace-nowrap py-3 text-[0.6875rem] tracking-[0.11em] transition-colors duration-(--dur-standard) ${
                active === s.key ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {showDiscs && <Disc state={s.state} />}
              {s.label}
            </a>
            {active === s.key && (
              <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Sheet({
  sections,
  showDiscs,
  labels,
}: {
  sections: LabSection[];
  showDiscs: boolean;
  labels: { trigger: string; changed: string };
}) {
  const [open, setOpen] = useState(false);
  const changed = sections.filter((s) => s.state === "edited").length;

  return (
    <div className="relative border-b border-line-strong">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ListChecks size={15} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
        <span className="data flex-1 truncate text-[0.6875rem] tracking-[0.11em] text-ink">
          {labels.trigger}
        </span>
        {/* Only the editor has a change count to report. Manage's bar carries
            position, and position is what the sheet's list already shows. */}
        {showDiscs && changed > 0 && (
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
              {showDiscs && <Disc state={s.state} />}
              <span className="truncate">{s.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Body({ sections, note }: { sections: LabSection[]; note: string }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {sections.map((s) => (
        <div key={s.key} className="rounded-(--radius-control) border border-line bg-surface p-3">
          <p className="text-[0.8125rem] font-semibold text-ink">{s.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p>
        </div>
      ))}
    </div>
  );
}

function Disc({ state }: { state: LabSection["state"] }) {
  return (
    <span
      aria-hidden
      className={`grid h-[13px] w-[13px] shrink-0 place-items-center rounded-full ${
        state === "edited"
          ? "bg-brand"
          : state === "needs"
            ? "shadow-[inset_0_0_0_1.5px_var(--warn)]"
            : "shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
      }`}
    >
      {state === "edited" && <Check size={8} strokeWidth={4} className="text-white" />}
      {state === "needs" && <span className="h-[4px] w-[4px] rounded-full bg-warn" />}
    </span>
  );
}

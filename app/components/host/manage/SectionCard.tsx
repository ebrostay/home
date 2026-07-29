import type { ReactNode } from "react";

// Every section in the owner portal wears the same shell: a ledger rule naming
// it, and
// an optional status figure on the rule's right. The rule takes the remaining
// width so the figure sits hard against the card edge whatever the label says.
//
// `scroll-margin-top` clears everything sticky above — the global header, the
// context bar, and the section nav — so an anchor jump lands on the rule and
// not behind it.
//
// It is a VARIABLE, not a length. The stack it has to clear changes height:
// the context bar wraps to two or three rows as the window narrows, and the
// nav is a row, a single control, or (beside the content) nothing at all.
// While it was the fixed 10.625rem it was right at one window width and buried
// the heading it had just jumped to at every other.

export function SectionCard({
  id,
  label,
  figure,
  figureTone = "text-muted",
  children,
}: {
  /** Anchors the section at `#sec-{id}` — both pages' navigation jumps here. */
  id: string;
  label: string;
  figure?: string;
  figureTone?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`sec-${id}`}
      aria-labelledby={`rule-${id}`}
      // Full-bleed on a phone. Measured at 375 px, the old chain spent 24 px
      // of page gutter plus 24 px of card padding on each side — 96 px of
      // 375, a quarter of the screen — to put a text field in 277 px. The
      // card now cancels the page gutter (`-mx-6` against the owner pages'
      // `px-6`, which both mains carry) and halves its own padding, giving
      // the controls 351 px.
      //
      // Losing the side border and the radius with it is not decoration: a
      // rounded, bordered card pressed against the glass reads as a layout
      // bug. A band that runs edge to edge reads as a decision. The top and
      // bottom borders stay, so the sections are still separable.
      className="-mx-6 flex scroll-mt-(--section-anchor-top) flex-col gap-4 rounded-none border border-x-0 border-line bg-surface px-3 py-[1.375rem] shadow-(--shadow-card) min-[30rem]:mx-0 min-[30rem]:rounded-(--radius-card) min-[30rem]:border-x min-[30rem]:px-6"
    >
      <div className="flex items-center gap-3">
        <h2 id={`rule-${id}`} className="ledger-rule m-0 flex-1">
          <span>{label}</span>
        </h2>
        {figure && (
          <span
            className={`data shrink-0 text-[0.65625rem] tracking-[0.08em] ${figureTone}`}
          >
            {figure}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

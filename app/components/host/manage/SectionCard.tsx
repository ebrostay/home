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
      className="flex scroll-mt-(--section-anchor-top) flex-col gap-4 rounded-(--radius-card) border border-line bg-surface px-6 py-[1.375rem] shadow-(--shadow-card)"
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

import type { ReactNode } from "react";

// Every section in the owner portal wears the same shell: a ledger rule naming
// it, and
// an optional status figure on the rule's right. The rule takes the remaining
// width so the figure sits hard against the card edge whatever the label says.
//
// `scroll-margin-top` clears both sticky bars — the global header and the
// section nav — so an anchor jump lands on the rule and not behind it.

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
      className="flex scroll-mt-[10.625rem] flex-col gap-4 rounded-(--radius-card) border border-line bg-surface px-6 py-[1.375rem] shadow-(--shadow-card)"
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

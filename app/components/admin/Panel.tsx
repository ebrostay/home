"use client";

// One signal panel on the review page. A hairline box, a small-caps mono
// heading, and — required, not optional — a note saying what the panel is
// worth. Both signals on this page are readings a person weighs, not answers,
// and a panel that presented them without that sentence would be read as a
// verdict within a week.

export function Panel({
  title,
  note,
  children,
}: {
  title: string;
  /** What this panel is and is not. Passed as a prop rather than left to the
   *  caller's markup so it cannot be quietly dropped in a redesign. */
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-(--radius-card) border border-line bg-surface p-4">
      <h3 className="data text-[0.625rem] uppercase tracking-[0.14em] text-muted">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
      <p className="mt-4 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-muted">
        {note}
      </p>
    </section>
  );
}

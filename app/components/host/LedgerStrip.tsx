"use client";

// The row of figures that opens an owner surface. Shared by the portfolio's
// four-cell strip and Manage's three, because the tricky part is not the
// numbers — it is the two techniques that hold them together, and having them
// written once means the two strips cannot drift apart.
//
//   1. SUBGRID. Labels wrap to different heights ("OCCUPANCY, NEXT 12 MONTHS"
//      is two lines where "NEXT VACANCY" is one). Sharing grid rows across all
//      cells is what keeps every value on one baseline.
//   2. The 1px column gap is not a gap. It is the parent's --line background
//      showing through, which is what draws the vertical hairlines. Which is
//      also why the column count is explicit below rather than auto-fit: at
//      some widths auto-fit settles on a count that leaves an empty track, and
//      an empty track paints as a grey block.

export type LedgerCell = {
  key: string;
  label: string;
  value: string;
  /** Text colour class for the value; defaults to ink. */
  tone?: string;
  note: string;
};

// Counts that divide evenly at every breakpoint. Static strings, so Tailwind
// can see them.
const COLUMNS: Record<number, string> = {
  3: "min-[30rem]:grid-cols-3",
  4: "min-[30rem]:grid-cols-2 min-[64rem]:grid-cols-4",
};

export function LedgerStrip({
  cells,
  flush = false,
}: {
  cells: LedgerCell[];
  /** True when the parent card has no padding of its own and the cells supply
   *  all of it; false pulls the first cell back onto the card's left edge. */
  flush?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-1 grid-rows-[auto_auto_auto] gap-x-px bg-line ${
        COLUMNS[cells.length] ?? COLUMNS[4]
      } ${flush ? "" : "-ml-5"}`}
    >
      {cells.map((c) => (
        <div
          key={c.key}
          /* py rather than a row gap: once the grid collapses to one column the
             cells stack, and a row gap would fall between a cell's own label,
             value and note as well as between cells. */
          className={`row-span-3 grid grid-rows-subgrid content-start gap-y-1.5 bg-surface px-5 ${
            flush ? "py-[18px]" : "py-2.5"
          }`}
        >
          <span className="data text-[0.65625rem] tracking-[0.1em] text-muted">
            {c.label}
          </span>
          <span
            className={`data text-[1.625rem] font-semibold leading-[1.1] tracking-[-0.01em] ${
              c.tone ?? "text-ink"
            }`}
          >
            {c.value}
          </span>
          <span className="text-[0.78125rem] leading-[1.4] text-muted">{c.note}</span>
        </div>
      ))}
    </div>
  );
}

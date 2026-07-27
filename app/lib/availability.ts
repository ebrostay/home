import type { MonthAvailability, MonthState } from "@/components/MonthBand";
import type { HostRange, PublicRange } from "@/lib/api";
import { addDays, rangesOverlap } from "@/lib/pricing";

// A home is not relettable the day the keys come back: the inventory has to be
// checked, the meters read, and a stay measured in months needs a deep clean
// (ADR-026). Every blocking range therefore closes the `turnoverDays` after it.
//
// The public API applies this server-side, so guests, search and the estimate
// all receive ranges with the buffer already folded in. This exists for the
// OWNER's editor alone, where the blocks being displayed include ones the owner
// has just added and not yet saved — the server has never seen them, so the
// same rule has to be available on this side too. Same arithmetic, one place.

export function turnoverOf(r: HostRange, listingDays: number): number {
  return Math.max(0, r.turnoverDaysOverride ?? listingDays);
}

/** Blocking ranges with the buffer folded in — what a guest would be shown. */
export function withTurnover(
  ranges: HostRange[],
  listingDays: number,
): PublicRange[] {
  return ranges.map((r) => ({
    start: r.start,
    end: addDays(r.end, turnoverOf(r, listingDays)),
  }));
}

/** Just the turnaround windows: [end, end + turnover). Empty when a range has
 *  no buffer, so a listing with turnoverDays 0 produces nothing to draw. */
export function turnaroundRanges(
  ranges: HostRange[],
  listingDays: number,
): PublicRange[] {
  return ranges
    .map((r) => ({ start: r.end, end: addDays(r.end, turnoverOf(r, listingDays)) }))
    .filter((r) => r.end > r.start);
}

// Derive the card band's 12 upcoming month states from public availability
// ranges (+ availableFrom, which blocks everything before it).

export function monthStates(
  ranges: PublicRange[],
  availableFrom: string | null,
  locale: string,
  from: Date,
  count = 12,
): MonthAvailability[] {
  const fmt = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    month: "short",
  });
  const blocks: PublicRange[] = availableFrom
    ? [{ start: "0000-01-01", end: availableFrom }, ...ranges]
    : ranges;

  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const next = new Date(from.getFullYear(), from.getMonth() + i + 1, 1);
    const ms = toIso(d);
    const me = toIso(next);

    const covered = blocks.some((b) => b.start <= ms && b.end >= me);
    const touched = blocks.some((b) => rangesOverlap(ms, me, b.start, b.end));
    const state: MonthState = covered ? "occupied" : touched ? "partial" : "open";

    return {
      label: fmt.format(d).replace(/\./g, "").slice(0, 3),
      state,
      newYear: d.getMonth() === 0 ? d.getFullYear() % 100 : undefined,
    };
  });
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A stay [start, end) fits when the property is available from `start` and
// no blocking range overlaps it.
export function stayFits(
  start: string,
  end: string,
  ranges: PublicRange[],
  availableFrom: string | null,
): boolean {
  if (availableFrom && start < availableFrom) return false;
  return !ranges.some((r) => rangesOverlap(start, end, r.start, r.end));
}

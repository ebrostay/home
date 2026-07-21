import type { MonthAvailability, MonthState } from "@/components/MonthBand";
import type { PublicRange } from "@/lib/api";
import { rangesOverlap } from "@/lib/pricing";

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

import type { HostProperty, PropertyStatus } from "@/lib/api";
import type { MonthAvailability } from "@/components/MonthBand";
import { monthStates } from "@/lib/availability";

// ============================================================
// Everything the portfolio page states about itself, derived from one
// dataset. The ledger strip and the row bands read the SAME month states,
// so "22% occupied" and the bars underneath it can never disagree — the
// alternative (a stored occupancy figure) is two numbers describing one
// portfolio, which is one number too many.
// ============================================================

export const BAND_MONTHS = 12;

/** Tab keys, in the order the tabs are shown. `all` is not a status. */
export const TABS = [
  "all",
  "live",
  "changes",
  "review",
  "draft",
  "paused",
] as const;

export type Tab = (typeof TABS)[number];

/** Stored lifecycle value (spec-v2 §2.2.1) → the owner-facing bucket. */
const BUCKET: Record<PropertyStatus, Exclude<Tab, "all">> = {
  published: "live",
  rejected: "changes",
  pending_review: "review",
  draft: "draft",
  paused: "paused",
};

export const bucketOf = (p: HostProperty) => BUCKET[p.status] ?? "draft";

/** In review and paused listings are shown dimmed — neither is takeable today. */
export const isDimmed = (p: HostProperty) =>
  p.status === "pending_review" || p.status === "paused";

/** A draft has no availability to sell and no price to compare, so it is
 *  excluded from every portfolio figure rather than counted as empty. */
const isSellable = (p: HostProperty) => p.status !== "draft";

export function monthsFor(
  p: HostProperty,
  locale: string,
  now: Date,
): MonthAvailability[] {
  return monthStates(p.availability, p.availableFrom, locale, now, BAND_MONTHS);
}

export type NextVacancy =
  | { kind: "openNow"; count: number }
  | { kind: "date"; date: Date; name: string };

export type PortfolioStats = {
  total: number;
  live: number;
  review: number;
  /** Rounded percentage, or null when there is nothing sellable to divide by. */
  occupancy: number | null;
  booked: number;
  sellable: number;
  nextVacancy: NextVacancy | null;
  pendingTotal: number;
  /** Whole days the longest-waiting request has been open. */
  oldestPendingDays: number | null;
};

export function portfolioStats(
  properties: HostProperty[],
  locale: string,
  now: Date,
): PortfolioStats {
  const sellable = properties.filter(isSellable);

  let booked = 0;
  for (const p of sellable) {
    // Part-booked counts as booked: the month is earning, and calling it open
    // would promise search visitors a month they cannot have in full.
    booked += monthsFor(p, locale, now).filter((m) => m.state !== "open").length;
  }
  const sellableMonths = sellable.length * BAND_MONTHS;

  const pending = properties.filter((p) => p.requestCount > 0);
  const oldest = pending
    .map((p) => p.oldestRequestAt)
    .filter((d): d is string => !!d)
    .sort()[0];

  return {
    total: properties.length,
    live: properties.filter((p) => p.status === "published").length,
    review: properties.filter((p) => p.status === "pending_review").length,
    occupancy: sellableMonths
      ? Math.round((booked / sellableMonths) * 100)
      : null,
    booked,
    sellable: sellableMonths,
    nextVacancy: nextVacancy(sellable, now),
    pendingTotal: pending.reduce((n, p) => n + p.requestCount, 0),
    oldestPendingDays: oldest ? daysBetween(new Date(oldest), now) : null,
  };
}

/** The next date a home that is busy today frees up. If nothing is busy, the
 *  honest answer is not a date — it is "all of them, now". */
function nextVacancy(sellable: HostProperty[], now: Date): NextVacancy | null {
  const today = isoDay(now);
  let best: { date: Date; name: string } | null = null;
  let free = 0;

  for (const p of sellable) {
    // End is exclusive, so a block ending today has already released the home.
    const blocking = p.availability.filter(
      (r) => r.start <= today && r.end > today,
    );
    if (blocking.length === 0) {
      free += 1;
      continue;
    }
    const end = blocking.map((r) => r.end).sort()[0];
    const date = fromIso(end);
    if (!best || date < best.date) best = { date, name: p.name };
  }

  // A home standing empty today outranks a date in the future: "next vacancy"
  // is answered by the calendar, and the calendar's answer is "now".
  if (free > 0) return { kind: "openNow", count: free };
  return best ? { kind: "date", ...best } : null;
}

export function tabCounts(properties: HostProperty[]): Record<Tab, number> {
  const counts = Object.fromEntries(TABS.map((t) => [t, 0])) as Record<Tab, number>;
  counts.all = properties.length;
  for (const p of properties) counts[bucketOf(p)] += 1;
  return counts;
}

// Noon avoids the DST edge where a midnight date lands on the previous day.
const fromIso = (iso: string) => new Date(`${iso}T12:00:00`);

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

const daysBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));

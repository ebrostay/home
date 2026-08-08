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

/** Stored lifecycle value (spec §2.2.1) → the owner-facing bucket. `closed`
 *  (design 2026-08-08, account closure) buckets with `live`: it is still the
 *  public state a guest sees, and an owner watching their own portfolio
 *  should not read "closing" as a state distinct from the "live" pill they
 *  were just looking at. */
const BUCKET: Record<PropertyStatus, Exclude<Tab, "all">> = {
  published: "live",
  rejected: "changes",
  pending_review: "review",
  draft: "draft",
  paused: "paused",
  closed: "live",
};

/** The mapping on its own, for surfaces that hold a status without a listing
 *  behind it — the guest page previewing an unpublished home knows only what
 *  the public projection told it (ADR-029). Same words as the portfolio pill,
 *  which is the point: an owner should not meet a second vocabulary for the
 *  state they were just looking at. */
export const bucketOfStatus = (status: PropertyStatus) => BUCKET[status] ?? "draft";

export const bucketOf = (p: HostProperty) => bucketOfStatus(p.status);

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
    // `bucketOf`, not `status === "published"`: the ledger strip and the tab
    // beside it have to be counting the same thing. They were not — a `closed`
    // listing (design 2026-08-08) bucketed into the Live tab while this line
    // skipped it, so the strip read "0 live" next to a tab reading "Live 1"
    // about the same home. One definition, in BUCKET, and this reads it.
    live: properties.filter((p) => bucketOf(p) === "live").length,
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

/** A stored timestamp as a long date in the reader's language, or `null` when
 *  the value cannot be read as one.
 *
 *  The null branch is the point. A row renders a date it was handed by the
 *  API, and `Intl.DateTimeFormat.format` THROWS on an invalid `Date` rather
 *  than returning something useless — so one unreadable timestamp used to
 *  take down the entire portfolio page, every listing on it, with a
 *  `RangeError`. It happened for real (2026-07-30): the API briefly returned
 *  `07/22/2026 12:00:00` instead of ISO, and `slice(0, 10)` on that is not a
 *  date. That bug is fixed at its source in the API, and this is the second
 *  line: a field this page merely displays must never be able to cost the
 *  owner the eight listings around it. Callers render their own placeholder. */
export function formatDay(iso: string, locale: string): string | null {
  const at = fromIso(iso.slice(0, 10));
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

const daysBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));

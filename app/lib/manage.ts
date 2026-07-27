import type {
  HostPricing,
  HostProperty,
  HostRange,
  PropertySummary,
} from "@/lib/api";
import type { MonthAvailability } from "@/components/MonthBand";
import { monthStates } from "@/lib/availability";
import { BAND_MONTHS } from "@/lib/portfolio";
import { dailyRate, paymentSchedule, stayDays, COMMISSION_RATE } from "@/lib/pricing";

// ============================================================
// Every figure the Manage page states about one listing, computed here once.
//
// The portfolio page learned this the expensive way: an occupancy percentage
// and the bars underneath it are one fact, and storing it twice makes two.
// This page has more surfaces onto the same calendar — a ledger cell, a
// twelve-month band, a stays table, a payout table and a vacancy sentence —
// so the rule is stricter, not looser. Nothing below reads a number from
// anywhere but `availability` and `pricing`.
//
// Two honest gaps, both flagged in the UI rather than papered over:
//   · There is no stay record yet (spec-v2 §4.5 — an accepted stay is stored
//     as a confirmed availability block with a free-text note). So a stay has
//     no reference, no type, and no *agreed* rent distinct from today's price.
//   · There is no payout record. The billing table is what the pricing rules
//     schedule, not what has been settled.
// ============================================================

export { BAND_MONTHS };

export const SECTIONS = [
  "stays",
  "pricing",
  "availability",
  "billing",
  "performance",
] as const;

export type SectionKey = (typeof SECTIONS)[number];

/** A confirmed block is the only thing in the model that means "taken". Holds
 *  are the booking flow's, not the owner's, and are not stays. */
export const isOwnerBlock = (r: HostRange) => r.status !== "hold";

export type StayStatus = "completed" | "inStay" | "confirmed";

export type Stay = {
  start: string;
  end: string; // exclusive
  days: number;
  note: string | null;
  status: StayStatus;
  /** Derived at TODAY'S price — see the gap note above. */
  rent: number;
};

export function staysOf(p: HostProperty, price: number, now: Date): Stay[] {
  const today = isoDay(now);
  const rate = dailyRate(price);

  return p.availability
    .filter(isOwnerBlock)
    .map((r) => {
      const days = stayDays(r.start, r.end);
      return {
        start: r.start,
        end: r.end,
        days,
        note: r.note,
        // End is exclusive, so a stay ending today is already over.
        status: (r.end <= today
          ? "completed"
          : r.start <= today
            ? "inStay"
            : "confirmed") as StayStatus,
        rent: round(days * rate),
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ---------------------------------------------------------------------------
// The twelve-month view — one array, four readers.
// ---------------------------------------------------------------------------

export function bandOf(
  p: HostProperty,
  locale: string,
  now: Date,
): MonthAvailability[] {
  return monthStates(p.availability, p.availableFrom, locale, now, BAND_MONTHS);
}

export type Vacancy = { from: Date; months: number };

export type Occupancy = {
  open: number;
  /** Rounded percentage of the next 12 months that is not fully open. */
  percent: number;
  /** The first unbroken run of open months, or null when there is none. */
  next: Vacancy | null;
};

export function occupancyOf(band: MonthAvailability[], now: Date): Occupancy {
  const open = band.filter((m) => m.state === "open").length;

  // The first RUN, not the first month: an owner reading "next vacancy" is
  // asking what they have to sell, and one open month between two stays is a
  // different product from four.
  let next: Vacancy | null = null;
  const start = band.findIndex((m) => m.state === "open");
  if (start !== -1) {
    let length = 0;
    while (start + length < band.length && band[start + length].state === "open")
      length += 1;
    next = { from: monthStart(now, start), months: length };
  }

  return {
    open,
    percent: Math.round(((band.length - open) / band.length) * 100),
    next,
  };
}

// ---------------------------------------------------------------------------
// Money. The schedule comes straight from lib/pricing.ts so this page and the
// visitor's booking panel cannot quote different arithmetic for one stay.
// ---------------------------------------------------------------------------

export type PayoutRow = {
  /** First of the calendar month the instalment covers. */
  month: Date;
  stayStart: string;
  days: number;
  rent: number;
  /** 15% capped at 30 days' rent, charged ONCE per stay (ADR-004 as amended,
   *  ADR-023) — so this is 0 on every instalment but a stay's first. */
  commission: number;
  payout: number;
  /** The 5th of the month the instalment covers. */
  paidOn: Date;
};

export function payoutRows(stays: Stay[], price: number): PayoutRow[] {
  const rows: PayoutRow[] = [];

  for (const stay of stays) {
    // The commission the whole stay carries, computed the way the estimate
    // widget computes it: 15% of rent, never more than 30 days' rent.
    const commission = round(Math.min(COMMISSION_RATE * stay.rent, price));
    // Deposit is passed as 0: it is the tenant's money held by Ebrostay, so it
    // never appears in an owner payout.
    for (const i of paymentSchedule(stay.start, stay.end, price, 0, commission)) {
      const month = fromIso(i.from);
      const fee = i.commission ?? 0;
      rows.push({
        month: new Date(month.getFullYear(), month.getMonth(), 1, 12),
        stayStart: stay.start,
        days: i.days,
        rent: i.rent,
        commission: fee,
        payout: round(i.rent - fee),
        paidOn: new Date(month.getFullYear(), month.getMonth(), 5, 12),
      });
    }
  }

  return rows.sort((a, b) => a.month.getTime() - b.month.getTime());
}

/** The instalment covering the month the owner is looking at, if any. */
export function payoutThisMonth(rows: PayoutRow[], now: Date): PayoutRow | null {
  return (
    rows.find(
      (r) =>
        r.month.getFullYear() === now.getFullYear() &&
        r.month.getMonth() === now.getMonth(),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Pricing preview — what the owner earns per month at the values in the form,
// before anything is saved.
// ---------------------------------------------------------------------------

export type PricingPreview = {
  rent: number;
  /** One-off, on the first instalment of a stay. */
  commission: number;
  /** Rent less the one-off commission — the first month. */
  firstMonth: number;
  /** Every month after: the commission is already paid. */
  laterMonths: number;
};

/** Priced over a nominal 30-day month, which IS the headline price (ADR-023). */
export function pricingPreview(price: number): PricingPreview {
  const commission = round(Math.min(COMMISSION_RATE * price, price));
  return {
    rent: price,
    commission,
    firstMonth: round(price - commission),
    laterMonths: price,
  };
}

// ---------------------------------------------------------------------------
// What the street charges. The handoff asks the rent field to say whether a
// price is in line with comparable homes; rather than a hardcoded band, this
// reads the published listings the public search already serves — so the
// number of comparables quoted to the owner is a real count they could go and
// verify on the site.
// ---------------------------------------------------------------------------

export type PriceBand = { count: number; low: number; high: number };

/** Fewer than this and a "band" is one neighbour's opinion, not a market. */
const MIN_COMPARABLES = 3;

export function priceBandFor(
  published: PropertySummary[],
  self: HostProperty,
): PriceBand | null {
  const others = published.filter((c) => c.id !== self.id && c.priceNumber > 0);
  // Closest first: same size in the same city, then the city alone. A studio
  // and a four-bed are not comparables however near each other they sit.
  const sameSize = others.filter((c) => c.bedrooms === self.bedrooms);
  const pool = sameSize.length >= MIN_COMPARABLES ? sameSize : others;
  if (pool.length < MIN_COMPARABLES) return null;

  const prices = pool.map((c) => c.priceNumber).sort((a, b) => a - b);
  const at = (q: number) =>
    prices[Math.min(prices.length - 1, Math.floor(q * prices.length))];

  return { count: pool.length, low: at(0.25), high: at(0.75) };
}

/** Mirrors `HostValidation` in api/Models/HostWrites.cs. The API is the
 *  authority — these exist only so the form cannot offer a value the server
 *  would bounce, which is a worse experience than a field that stops. */
export const LIMITS = {
  maxPrice: 50_000,
  maxDeposit: 100_000,
  maxCap: 2_000,
  maxBlocks: 60,
  maxNote: 120,
} as const;

export type PriceVerdict = "inLine" | "above" | "below";

export const priceVerdict = (price: number, band: PriceBand): PriceVerdict =>
  price > band.high ? "above" : price < band.low ? "below" : "inLine";

/** True when the form differs from what is saved — drives the dirty badge and
 *  the Save/Discard pair. Compared field by field: a shallow identity check
 *  would call every keystroke a change. */
export function pricingDirty(a: HostPricing, b: HostPricing): boolean {
  return (
    a.priceNumber !== b.priceNumber ||
    (a.depositAmount ?? 0) !== (b.depositAmount ?? 0) ||
    a.billsPolicy !== b.billsPolicy ||
    (a.utilitiesCapEur ?? 0) !== (b.utilitiesCapEur ?? 0) ||
    a.minStayMonths !== b.minStayMonths
  );
}

export function blocksDirty(a: HostRange[], b: HostRange[]): boolean {
  const key = (r: HostRange) => `${r.start}|${r.end}|${r.note ?? ""}`;
  const own = (rs: HostRange[]) => rs.filter(isOwnerBlock).map(key).sort();
  const [x, y] = [own(a), own(b)];
  return x.length !== y.length || x.some((k, i) => k !== y[i]);
}

// ---------------------------------------------------------------------------

const round = (v: number) => Math.round(v * 100) / 100;

// Noon, so a DST shift cannot roll a date onto the previous day.
const fromIso = (iso: string) => new Date(`${iso}T12:00:00`);

const monthStart = (now: Date, offset: number) =>
  new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

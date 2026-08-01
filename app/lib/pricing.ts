// Booking math. Billing is PRO-RATED DAILY (ADR-023, which supersedes ADR-005's
// whole-month rule and the billing clause of ADR-022); duration LIMITS follow
// the Spanish-law research (spec/07-legal-notes.md §D + ADR-022): a legal
// temporary stay is >= 31 days and < 365 days.
// Dates are "YYYY-MM-DD" strings; ranges are half-open [start, end).
// The C# booking endpoint recomputes and flags mismatches (spec §4.3).

export const MIN_STAY_DAYS = 31; // legal floor ("no inferior a treinta y un días")
export const MAX_STAY_DAYS = 365; // ceiling: stay must be < 365 days (under a year; leap year ignored — ADR-022)
export const COMMISSION_RATE = 0.15;

// The listed monthly price is a price for THIRTY DAYS, fixed — not for "the
// calendar month", which would make the daily rate swing 30.65–33.93 on a €950
// home depending on which month you booked. A 31-day month therefore costs
// 31/30 of the headline price; that is the deliberate cost of a rate a visitor
// can multiply in their head (ADR-023).
export const DAYS_PER_BILLED_MONTH = 30;

export function dailyRate(priceNumber: number): number {
  return priceNumber / DAYS_PER_BILLED_MONTH;
}

// Occupied days, end-exclusive: 1 Sept → 1 Oct is 30 days. The end date is the
// day the keys come back — the tenant does not pay for it. Both dates are ISO
// days, so UTC arithmetic keeps this immune to DST.
export function stayDays(start: string, end: string): number {
  const at = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((at(end) - at(start)) / 86_400_000));
}

// Money is settled in cents; a daily rate of 950/30 = 31.6666… must not leak
// fractions of a cent into a total a visitor is asked to pay.
function euros(v: number): number {
  return Math.round(v * 100) / 100;
}

export function addMonths(iso: string, count: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + count, d));
  // JS rolls 31 Jan + 1m into March; clamp to the last day of the target month
  if (date.getUTCDate() !== d) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, count: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + count)).toISOString().slice(0, 10);
}


export type Estimate = {
  days: number; // billed days, end-exclusive
  rate: number; // €/day
  rent: number;
  commission: number; // capped at 30 days' rent (ADR-004 as amended), VAT incl.
  commissionDiscount: number; // the visible saving when the cap bites
  deposit: number;
  /** One-off turnover charge (ADR-026). A pass-through, so it is NOT part of
   *  the commission base and never enters the daily rate. */
  cleaningFee: number;
  total: number;
  tooShort: boolean; // < 31 days — below the legal temporary floor (ADR-022)
  tooLong: boolean; // >= 365 days — a year or more flips the regime (ADR-022)
};

export function computeEstimate(
  start: string,
  end: string,
  priceNumber: number,
  depositAmount: number | null,
  cleaningFeeEur: number = 0,
): Estimate {
  const days = stayDays(start, end);
  const rate = dailyRate(priceNumber);
  const rent = euros(days * rate);
  // Commission is charged on RENT alone. The deposit is the tenant's own money
  // and the cleaning fee is a cost passed through at face value — taking a cut
  // of either would be charging a fee on somebody else's money.
  const rawCommission = COMMISSION_RATE * rent;
  // The cap is 30 days of rent, which IS the headline monthly price
  // (30 × price/30). Same intent as ADR-004, restated in days.
  const commission = euros(Math.min(rawCommission, priceNumber));
  const commissionDiscount = euros(Math.max(0, euros(rawCommission) - commission));
  const deposit = depositAmount ?? 0;
  const cleaningFee = Math.max(0, cleaningFeeEur);
  return {
    days,
    rate,
    rent,
    commission,
    commissionDiscount,
    deposit,
    cleaningFee,
    total: euros(rent + commission + deposit + cleaningFee),
    tooShort: end < addDays(start, MIN_STAY_DAYS), // < 31 days
    tooLong: end >= addDays(start, MAX_STAY_DAYS), // >= 365 days (not < a year)
  };
}

// ---------------------------------------------------------------------------
// Payment schedule (ADR-023). Rent is collected per CALENDAR month, not per
// 30-day block: the first instalment covers move-in → end of that month, then
// one instalment per month, the last one short. Deposit and the Ebrostay
// service are both due at move-in. Utilities are NOT here — they are metered
// and settled in the final bill after move-out, together with any damages and
// the deposit return.
// ---------------------------------------------------------------------------

export type Instalment = {
  from: string;
  to: string; // exclusive
  days: number;
  rent: number;
  /** Only on the first: due alongside the first rent. */
  deposit?: number;
  commission?: number;
  /** Also first-instalment only. Charged at move-in rather than taken from the
   *  deposit at move-out (ADR-026): the turnaround is a known, routine cost,
   *  and deducting it from the deposit makes it read as a penalty for damage. */
  cleaningFee?: number;
  total: number;
};

function firstOfNextMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

export function paymentSchedule(
  start: string,
  end: string,
  priceNumber: number,
  depositAmount: number | null,
  commission: number,
  cleaningFeeEur: number = 0,
): Instalment[] {
  const rate = dailyRate(priceNumber);
  const out: Instalment[] = [];
  let cursor = start;
  while (cursor < end) {
    const next = firstOfNextMonth(cursor);
    const to = next < end ? next : end;
    const days = stayDays(cursor, to);
    const first = out.length === 0;
    const deposit = first ? (depositAmount ?? 0) : 0;
    const fee = first ? commission : 0;
    const cleaning = first ? Math.max(0, cleaningFeeEur) : 0;
    out.push({
      from: cursor,
      to,
      days,
      rent: euros(days * rate),
      ...(first ? { deposit, commission: fee, cleaningFee: cleaning } : {}),
      total: 0, // filled below, once the rounding is settled
    });
    cursor = to;
  }
  if (out.length === 0) return out;

  // Each instalment rounds to cents independently, so the parts can miss the
  // whole by a cent or two. Put the difference on the LAST instalment: the
  // schedule must add up to the total the visitor was quoted, and the final
  // month is where a real ledger absorbs a remainder.
  const whole = euros(stayDays(start, end) * rate);
  const parts = euros(out.reduce((a, i) => a + i.rent, 0));
  const last = out[out.length - 1];
  last.rent = euros(last.rent + (whole - parts));

  for (const i of out) {
    i.total = euros(
      i.rent + (i.deposit ?? 0) + (i.commission ?? 0) + (i.cleaningFee ?? 0),
    );
  }
  return out;
}

// One overlap predicate for the whole product (spec §2.2.3): half-open
// ranges overlap iff aStart < bEnd && bStart < aEnd.
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function formatEuro(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    useGrouping: "always" as Intl.NumberFormatOptions["useGrouping"],
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

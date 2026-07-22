// Booking math. Billing follows docs/spec/05 §5.1 (whole-month, monthly);
// duration LIMITS follow the Spanish-law research (spec-v2/07-legal-notes.md
// §D + ADR-022): a legal temporary stay is >= 31 days and <= 12 months.
// Dates are "YYYY-MM-DD" strings; ranges are half-open [start, end).
// The C# booking endpoint recomputes and flags mismatches (spec-v2 §4.3).

export const MAX_STAY_MONTHS = 12; // legal ceiling ("no exceder de doce meses")
export const MIN_STAY_DAYS = 31; // legal floor ("no inferior a treinta y un días")
export const COMMISSION_RATE = 0.15;

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

// Whole months, end-exclusive, rounded up, minimum 1 (v1 ADR-005):
// smallest n >= 1 with addMonths(start, n) >= end.
export function billedMonths(start: string, end: string): number {
  if (end <= start) return 1;
  let n = 1;
  while (addMonths(start, n) < end && n <= MAX_STAY_MONTHS + 1) n++;
  return n;
}

export type Estimate = {
  months: number;
  rent: number;
  commission: number; // capped at one month's rent (v1 ADR-004), VAT incl.
  commissionDiscount: number; // the visible saving when the cap bites
  deposit: number;
  total: number;
  tooShort: boolean; // < 31 days — below the legal temporary floor (ADR-022)
  tooLong: boolean; // > 12 months (by CALENDAR duration) — regime flips (ADR-022)
};

export function computeEstimate(
  start: string,
  end: string,
  priceNumber: number,
  depositAmount: number | null,
): Estimate {
  const months = billedMonths(start, end);
  const rent = months * priceNumber;
  const rawCommission = COMMISSION_RATE * rent;
  const commission = Math.min(rawCommission, priceNumber);
  const commissionDiscount = Math.max(0, rawCommission - commission);
  const deposit = depositAmount ?? 0;
  return {
    months,
    rent,
    commission,
    commissionDiscount,
    deposit,
    total: rent + commission + deposit,
    // Legality is CALENDAR duration, not billed (rounded-up) months: an
    // 11½-month stay bills as 12 months but is legally under the ceiling.
    tooShort: end < addDays(start, MIN_STAY_DAYS),
    tooLong: end > addMonths(start, MAX_STAY_MONTHS),
  };
}

// One overlap predicate for the whole product (spec-v2 §2.2.3): half-open
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

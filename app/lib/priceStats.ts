// Price-distribution math for the budget filter. Pure and UI-free so the
// three budget controls (band / curve / tiers) all read the same numbers.
//
// IMPORTANT for callers: feed these the homes matching every OTHER filter but
// NOT the budget itself. A distribution that shrinks as you drag the ceiling
// is a chart eating its own tail — the shape has to hold still to be read.

export type Bucket = {
  from: number;
  to: number; // exclusive, except on the last bucket
  count: number;
};

// Enough buckets to show a shape, few enough that each stays a readable column.
const STEPS = [25, 50, 100, 150, 200, 250, 500, 1000];
const TARGET_BUCKETS = 18;

export function chooseStep(sorted: number[]): number {
  if (sorted.length === 0) return 100;
  const span = sorted[sorted.length - 1] - sorted[0];
  if (span <= 0) return STEPS[0];
  return STEPS.find((s) => s >= span / TARGET_BUCKETS) ?? STEPS[STEPS.length - 1];
}

/**
 * Drag granularity: finer than a bucket so the ceiling can land between
 * columns, but never below €25 — half of a narrow bucket is €12.50, and a
 * budget filter that offers you "1.212,5 €" has stopped speaking money.
 */
export function sliderStep(bucketStep: number): number {
  return Math.max(25, Math.round(bucketStep / 2));
}

/** Slider bounds: the axis snaps outward to whole steps so ticks stay round. */
export function bounds(sorted: number[], step: number) {
  const lo = Math.floor(sorted[0] / step) * step;
  const hi = Math.ceil(sorted[sorted.length - 1] / step) * step;
  // A dataset whose max lands exactly on a step boundary would leave the last
  // home sitting on the axis end with no column to live in.
  return { lo, hi: hi === sorted[sorted.length - 1] ? hi + step : hi };
}

export function buildBuckets(
  sorted: number[],
  step: number,
  lo: number,
  hi: number,
): Bucket[] {
  const out: Bucket[] = [];
  for (let from = lo; from < hi; from += step) {
    const to = from + step;
    const last = to >= hi;
    out.push({
      from,
      to,
      count: sorted.filter((p) => p >= from && (last ? p <= to : p < to)).length,
    });
  }
  return out;
}

export type Cluster = { value: number; count: number };

/**
 * One mark per home, for catalogues too small to bucket. Homes priced within a
 * hair of each other are collected into a single stack so two €1.350 flats read
 * as two marks, not one smudge — the stack IS the count, so nothing is hidden.
 */
export function clusterPrices(
  sorted: number[],
  lo: number,
  hi: number,
): Cluster[] {
  const snap = Math.max(5, (hi - lo) / 40);
  const out: Cluster[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && p - last.value < snap) last.count++;
    else out.push({ value: p, count: 1 });
  }
  return out;
}

/** Linear-interpolated quantile over an ascending array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

export function countAtMost(sorted: number[], cap: number): number {
  return sorted.filter((p) => p <= cap).length;
}

/** The cheapest home you cannot afford yet — what a nudge upward would buy. */
export function nextPriceAbove(sorted: number[], cap: number): number | null {
  return sorted.find((p) => p > cap) ?? null;
}

export function roundTo(value: number, to: number): number {
  return Math.round(value / to) * to;
}

/**
 * Three ceilings drawn from the data (p30 / p55 / p80), rounded to something a
 * person would actually say out loud. Deduped, so a flat market yields fewer
 * than three rather than three chips that all mean the same thing.
 */
export function ceilingTiers(sorted: number[]): number[] {
  if (sorted.length === 0) return [];
  const grain = sorted[sorted.length - 1] - sorted[0] > 900 ? 100 : 50;
  const raw = [0.3, 0.55, 0.8].map((q) => roundTo(quantile(sorted, q), grain));
  return [...new Set(raw)].filter((v) => v >= sorted[0] && v < sorted[sorted.length - 1]);
}

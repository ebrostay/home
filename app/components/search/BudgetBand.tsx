"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatEuro } from "@/lib/pricing";
import {
  bounds,
  buildBuckets,
  chooseStep,
  clusterPrices,
  countAtMost,
  quantile,
  sliderStep,
} from "@/lib/priceStats";
import { CapSlider, capOffset } from "./BudgetSlider";
import { BudgetEmpty } from "./BudgetEmpty";

// Homes needed before the median is worth marking.
const MEDIAN_MIN = 8;

// VARIANT A — the budget band.
//
// The month band taught this site that a quantity across an axis is drawn as
// discrete cells, not a smooth chart; the budget axis follows suit. The colour
// grammar is the one already in use: green is what's yours, and everything past
// your ceiling is hatched shut exactly like a booked month.
//
// Columns at every catalogue size, down to a single home. A second rendering
// exists — one mark per home, no bucketing — because bucketing degrades on a
// thin catalogue: the bucket count is derived from the price SPAN, so four
// homes priced €30 apart collapse the whole axis into two slabs. Columns are
// the call for now regardless; the marks path stays wired for the
// columns-vs-marks exhibit in the style book, which is where that judgement can
// be revisited against real edge cases.
export function BudgetBand({
  prices,
  value,
  onChange,
  denseFrom = 1,
}: {
  // readonly: the component only ever copies before sorting, and accepting a
  // readonly array lets callers pass `as const` fixtures.
  prices: readonly number[];
  value: number | null; // null = no ceiling
  onChange: (v: number | null) => void;
  // Homes needed before marks become columns. Columns are the production
  // rendering at every size; the marks path is kept for the columns-vs-marks
  // exhibit in the style book, which is where that threshold gets argued.
  denseFrom?: number;
}) {
  const t = useTranslations("budget");
  const locale = useLocale();

  const model = useMemo(() => {
    const sorted = [...prices].sort((a, b) => a - b);
    // A single home still has an axis — bounds() opens a step around it — so
    // only a genuinely empty result set has nothing to draw.
    if (sorted.length === 0) return null;
    const step = chooseStep(sorted);
    const { lo, hi } = bounds(sorted, step);
    const dense = sorted.length >= denseFrom;
    const buckets = dense ? buildBuckets(sorted, step, lo, hi) : [];
    return {
      sorted,
      step,
      lo,
      hi,
      dense,
      buckets,
      peak: Math.max(...buckets.map((b) => b.count), 1),
      clusters: dense ? [] : clusterPrices(sorted, lo, hi),
      median: quantile(sorted, 0.5),
    };
  }, [prices, denseFrom]);

  if (!model) return <BudgetEmpty value={value} />;

  const { sorted, step, lo, hi, dense, buckets, peak, clusters, median } = model;
  const cap = value ?? hi;
  const pct = (cap - lo) / (hi - lo);
  const medianPct = (median - lo) / (hi - lo);
  const inBudget = countAtMost(sorted, cap);
  // The € sign lives in the message, not here: es writes "1.400 €", en "€1,400".
  const euro = (v: number) => t("amount", { value: formatEuro(v, locale) });
  const capLabel =
    value === null
      ? t("noLimit")
      : t("upTo", { value: formatEuro(cap, locale) });
  const reached = (price: number) => price <= cap;
  // Columns need room to be tall; marks don't have a height dimension at all,
  // so the sparse view shrinks to its tallest stack rather than reserving a
  // chart's worth of empty air above four dots.
  const marksPx = dense
    ? 88
    : Math.max(36, Math.max(...clusters.map((c) => c.count)) * 12 + 4);
  // The median only earns its marker once there are enough homes for it to
  // describe something — the median of one price is that price wearing a hat.
  // Deliberately independent of the rendering choice: this is about whether a
  // summary statistic is honest, not about how the axis is drawn.
  const showMedian =
    sorted.length >= MEDIAN_MIN && medianPct > 0.1 && medianPct < 0.9;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold tracking-wide text-ink">
          {t("label")}
        </span>
        <output className="data text-sm font-semibold text-ink">{capLabel}</output>
      </div>

      <div className="relative mt-3" style={{ height: marksPx + 32 }}>
        {/* The 7px side padding matches the slider thumb's own travel inset, so
            a mark's position and the handle's position agree. */}
        <div className="absolute inset-x-0 bottom-8 top-0 px-[7px]">
          {dense ? (
            <div className="flex h-full items-end gap-px">
              {buckets.map((b) => (
                <div
                  key={b.from}
                  className={`flex-1 rounded-t-[3px] transition-colors duration-(--dur-standard) ${
                    reached(b.from) ? "bg-brand" : "bg-line-strong"
                  }`}
                  style={{
                    height: `${(b.count / peak) * 100}%`,
                    minHeight: b.count > 0 ? 3 : 0,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="relative h-full">
              {clusters.map((c) => (
                <div
                  key={c.value}
                  className="absolute bottom-0 flex -translate-x-1/2 flex-col-reverse items-center gap-1"
                  style={{ left: `${((c.value - lo) / (hi - lo)) * 100}%` }}
                >
                  {Array.from({ length: c.count }, (_, i) => (
                    <span
                      key={i}
                      className={`size-2 rounded-full transition-colors duration-(--dur-standard) ${
                        reached(c.value) ? "bg-brand" : "bg-line-strong"
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-px bg-line" />
        </div>

        {/* Beyond the ceiling: closed water, same hatch as a booked day. */}
        <div
          className="budget-out pointer-events-none absolute bottom-8 top-0"
          style={{ left: capOffset(pct), right: 0 }}
        />
        {/* Median — a tick off the baseline rather than a full-height rule: it
            has to stay legible over both a green column and a grey one, and
            the axis is where the eye already is. River, because it informs. */}
        {showMedian && (
          <div
            className="pointer-events-none absolute bottom-8 h-3.5 w-px bg-river-deep"
            style={{ left: capOffset(medianPct) }}
          />
        )}
        <div
          className="pointer-events-none absolute bottom-8 top-0 w-px bg-brand"
          style={{ left: capOffset(pct) }}
        />

        <CapSlider
          lo={lo}
          hi={hi}
          step={sliderStep(step)}
          value={cap}
          onChange={(v) => onChange(v >= hi ? null : v)}
          label={t("label")}
          valueText={`${capLabel} · ${t("within", { count: inBudget, total: sorted.length })}`}
        />
      </div>

      <div className="data relative mt-1.5 h-4 text-[0.625rem] text-muted">
        <span className="absolute left-0">{euro(lo)}</span>
        {showMedian && medianPct > 0.12 && medianPct < 0.88 && (
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap text-river-deep"
            style={{ left: capOffset(medianPct) }}
          >
            {t("median")} {euro(Math.round(median))}
          </span>
        )}
        <span className="absolute right-0">{euro(hi)}+</span>
      </div>

      <p className="mt-2 text-xs text-muted">
        {t("within", { count: inBudget, total: sorted.length })}
      </p>
      {!dense && (
        <p className="mt-1 text-xs text-muted">{t("eachMark")}</p>
      )}
    </div>
  );
}

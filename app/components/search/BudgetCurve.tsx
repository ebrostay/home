"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatEuro } from "@/lib/pricing";
import {
  bounds,
  chooseStep,
  countAtMost,
  nextPriceAbove,
  sliderStep,
} from "@/lib/priceStats";
import { CapSlider, capOffset } from "./BudgetSlider";
import { BudgetEmpty } from "./BudgetEmpty";

const VW = 600; // viewBox units; the box stretches, the strokes don't
const VH = 100;

// VARIANT B — the reach curve.
//
// A histogram answers "what does the market look like"; this answers the
// question people actually arrive with: "what does another hundred euros buy
// me?" It plots homes-you-can-see against ceiling, so the flat stretches are
// the real finding — money spent there buys nothing. Staircase, not spline:
// the inventory is 26 discrete homes and the drawing should admit it.
export function BudgetCurve({
  prices,
  value,
  onChange,
}: {
  // readonly: the component only ever copies before sorting, and accepting a
  // readonly array lets callers pass `as const` fixtures.
  prices: readonly number[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const t = useTranslations("budget");
  const locale = useLocale();

  const model = useMemo(() => {
    const sorted = [...prices].sort((a, b) => a - b);
    // A staircase needs no aggregation — four homes make four honest steps —
    // but two prices are the minimum for an axis to span anything.
    if (sorted.length < 2) return null;
    const step = chooseStep(sorted);
    const { lo, hi } = bounds(sorted, step);
    const edges: number[] = [];
    for (let e = lo; e <= hi; e += step) edges.push(e);
    return { sorted, step, lo, hi, edges };
  }, [prices]);

  if (!model) return <BudgetEmpty value={value} />;

  const { sorted, step, lo, hi, edges } = model;
  const total = sorted.length;
  const cap = value ?? hi;
  const pct = (cap - lo) / (hi - lo);
  const inBudget = countAtMost(sorted, cap);
  const euro = (v: number) => t("amount", { value: formatEuro(v, locale) });
  const capLabel =
    value === null
      ? t("noLimit")
      : t("upTo", { value: formatEuro(cap, locale) });

  const x = (v: number) => ((v - lo) / (hi - lo)) * VW;
  const y = (c: number) => VH - (c / total) * VH;

  // Right-continuous staircase: hold the count across the step, jump at the edge.
  let d = `M 0 ${y(countAtMost(sorted, lo))}`;
  for (const e of edges.slice(1)) {
    d += ` H ${x(e)} V ${y(countAtMost(sorted, e))}`;
  }
  const area = `${d} V ${VH} H 0 Z`;

  const next = nextPriceAbove(sorted, cap);
  const nudge = next === null ? null : Math.ceil(next / 25) * 25;
  const hint =
    nudge === null
      ? t("allVisible")
      : t("addMore", {
          value: formatEuro(nudge, locale),
          count: countAtMost(sorted, nudge) - inBudget,
        });

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold tracking-wide text-ink">
          {t("label")}
        </span>
        <output className="data text-sm font-semibold text-ink">{capLabel}</output>
      </div>

      <div className="relative mt-3 h-[7.5rem]">
        <div className="absolute inset-x-0 bottom-8 top-0 px-[7px]">
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            aria-hidden
          >
            <defs>
              <clipPath id="budget-curve-in">
                <rect x="0" y="0" width={x(cap)} height={VH} />
              </clipPath>
              <clipPath id="budget-curve-out">
                <rect x={x(cap)} y="0" width={VW - x(cap)} height={VH} />
              </clipPath>
            </defs>

            <g clipPath="url(#budget-curve-out)">
              <path d={area} className="fill-line-strong/25" />
              <path
                d={d}
                className="stroke-line-strong"
                fill="none"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
            <g clipPath="url(#budget-curve-in)">
              <path d={area} className="fill-brand/15" />
              <path
                d={d}
                className="stroke-brand"
                fill="none"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </g>

            {/* The reading point: how many homes this ceiling opens. */}
            <line
              x1="0"
              x2={x(cap)}
              y1={y(inBudget)}
              y2={y(inBudget)}
              className="stroke-river-deep/60"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <line x1="0" x2={VW} y1={VH} y2={VH} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        <div
          className="pointer-events-none absolute bottom-8 top-0 w-px bg-brand"
          style={{ left: capOffset(pct) }}
        />
        <div
          className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand"
          style={{
            left: capOffset(pct),
            top: `calc((100% - 2rem) * ${1 - inBudget / total})`,
          }}
        />

        <CapSlider
          lo={lo}
          hi={hi}
          step={sliderStep(step)}
          value={cap}
          onChange={(v) => onChange(v >= hi ? null : v)}
          label={t("label")}
          valueText={`${capLabel} · ${t("within", { count: inBudget, total })}`}
        />
      </div>

      <div className="data relative mt-1.5 h-4 text-[0.625rem] text-muted">
        <span className="absolute left-0">{euro(lo)}</span>
        <span className="absolute right-0">{euro(hi)}+</span>
      </div>

      <p className="mt-2 text-xs text-muted">
        <b className="data font-semibold text-ink">
          {t("within", { count: inBudget, total })}
        </b>
        {" · "}
        {hint}
      </p>
    </div>
  );
}

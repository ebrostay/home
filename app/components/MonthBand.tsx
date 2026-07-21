"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";

// ============================================================
// The month-band — the system's signature. Stays are contracted
// in whole months (1–11, docs/spec/05); these cells make that
// domain tangible. Semantics everywhere in the product:
//   river wash = open · bridge green = selected/yours · ink = occupied
// ============================================================

const MAX_MONTHS = 11;

export function MonthBandSelect({
  value,
  onChange,
  animateIn = false,
}: {
  value: number;
  onChange: (months: number) => void;
  animateIn?: boolean;
}) {
  const t = useTranslations("monthBand");

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-wide text-ink">
          {t("stayLength")}
        </span>
        <span className="data text-xs text-muted">
          {t("monthCount", { count: value })}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label={t("stayLength")}
        className="mt-2 flex gap-1"
      >
        {Array.from({ length: MAX_MONTHS }, (_, i) => {
          const n = i + 1;
          const selected = n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === value}
              aria-label={t("monthCount", { count: n })}
              onClick={() => onChange(n)}
              style={{ "--cell-index": i } as React.CSSProperties}
              className={`data h-9 flex-1 rounded-[0.375rem] text-xs font-medium transition-colors ${
                animateIn ? "month-cell-enter" : ""
              } ${
                selected
                  ? "bg-brand text-white"
                  : "bg-river-soft text-river-deep hover:bg-river/40"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Display variant: a listing's next months. A month is rarely binary —
// stays start mid-month — so the band is an honest three-state SUMMARY
// (open / partial / occupied); day-level truth lives in the DateRangePicker.
export type MonthState = "open" | "partial" | "occupied";

export type MonthAvailability = {
  label: string; // 3-letter month label, localized by the caller (Intl short)
  state: MonthState;
  newYear?: number; // 2-digit year — set on the first month of a new year
};

export function AvailabilityBand({ months }: { months: MonthAvailability[] }) {
  const t = useTranslations("monthBand");
  const hasYearMarks = months.some((m) => m.newYear !== undefined);

  return (
    <div
      role="img"
      aria-label={t("availabilityAlt", {
        open: months.filter((m) => m.state === "open").length,
        partial: months.filter((m) => m.state === "partial").length,
        total: months.length,
      })}
      className="flex gap-0.5"
    >
      {months.map((m, i) => (
        <Fragment key={i}>
          {/* year boundary: a hairline tick between Dec and Jan */}
          {m.newYear !== undefined && i > 0 && (
            <div aria-hidden className="w-px self-stretch bg-line-strong" />
          )}
          <div className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`h-1.5 w-full rounded-full ${
                m.state === "open"
                  ? "bg-river"
                  : m.state === "occupied"
                    ? "bg-occupied"
                    : ""
              }`}
              style={
                m.state === "partial"
                  ? {
                      background:
                        "linear-gradient(90deg, var(--occupied) 50%, var(--river) 50%)",
                    }
                  : undefined
              }
            />
            <span className="data text-[0.5625rem] uppercase leading-none text-muted">
              {m.label}
            </span>
            {hasYearMarks && (
              <span className="data text-[0.5rem] leading-none text-muted/70">
                {m.newYear !== undefined ? `’${m.newYear}` : " "}
              </span>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// Convenience wrapper with local state for simple embeddings.
export function MonthBandDemo() {
  const [months, setMonths] = useState(3);
  return <MonthBandSelect value={months} onChange={setMonths} animateIn />;
}

"use client";

import { useState } from "react";
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

// Display variant: a listing's next months, open vs occupied.
export type MonthAvailability = {
  label: string; // short month label, localized by the caller (Intl)
  open: boolean;
};

export function AvailabilityBand({ months }: { months: MonthAvailability[] }) {
  const t = useTranslations("monthBand");

  return (
    <div
      role="img"
      aria-label={t("availabilityAlt", {
        open: months.filter((m) => m.open).length,
        total: months.length,
      })}
      className="flex gap-0.5"
    >
      {months.map((m, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={`h-1.5 w-full rounded-full ${
              m.open ? "bg-river" : "bg-occupied"
            }`}
          />
          <span className="data text-[0.5625rem] uppercase text-muted">
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// Convenience wrapper with local state for simple embeddings.
export function MonthBandDemo() {
  const [months, setMonths] = useState(3);
  return <MonthBandSelect value={months} onChange={setMonths} animateIn />;
}

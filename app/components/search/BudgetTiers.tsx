"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatEuro } from "@/lib/pricing";
import { ceilingTiers, countAtMost } from "@/lib/priceStats";
import { Input } from "@/components/ui/Field";
import { BudgetEmpty } from "./BudgetEmpty";

// VARIANT C — ceiling tiers.
//
// No dragging, no chart: three ceilings the market itself suggests (p30 / p55 /
// p80, rounded to numbers a person would say out loud), each carrying its own
// count. The proportion bar is the distribution, compressed to the only part a
// max-budget filter actually needs — how much of the list this ceiling opens.
// Survives a thin catalogue and a phone, which the other two do not.
export function BudgetTiers({
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
  const sorted = useMemo(() => [...prices].sort((a, b) => a - b), [prices]);
  const tiers = useMemo(() => ceilingTiers(sorted), [sorted]);

  const isCustom = value !== null && !tiers.includes(value);
  const [showCustom, setShowCustom] = useState(false);

  // No spread in the prices means no ceiling worth suggesting.
  if (tiers.length === 0) return <BudgetEmpty value={value} />;

  const total = sorted.length;
  const options: (number | null)[] = [...tiers, null];

  return (
    <div>
      <span className="text-xs font-semibold tracking-wide text-ink">
        {t("label")}
      </span>

      <div
        role="radiogroup"
        aria-label={t("label")}
        className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {options.map((tier) => {
          const count = tier === null ? total : countAtMost(sorted, tier);
          const on = !isCustom && value === tier;
          return (
            <label
              key={tier ?? "any"}
              className={`cursor-pointer rounded-(--radius-control) border px-3 py-2.5 transition-colors duration-(--dur-standard) ${
                on
                  ? "border-brand bg-brand-soft"
                  : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <input
                type="radio"
                name="budget-tier"
                className="sr-only"
                checked={on}
                onChange={() => {
                  setShowCustom(false);
                  onChange(tier);
                }}
              />
              <span
                className={`data block text-[0.8125rem] font-semibold ${
                  on ? "text-brand-strong" : "text-ink"
                }`}
              >
                {tier === null
                  ? t("noLimit")
                  : t("upTo", { value: formatEuro(tier, locale) })}
              </span>
              <span className="mt-2 flex items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className={`block h-full rounded-full ${on ? "bg-brand" : "bg-line-strong"}`}
                    style={{ width: `${(count / total) * 100}%` }}
                  />
                </span>
                <span className="data text-[0.625rem] text-muted">{count}</span>
              </span>
            </label>
          );
        })}
      </div>

      {isCustom || showCustom ? (
        <div className="mt-2.5 flex items-center gap-2">
          <label htmlFor="budget-custom" className="text-xs text-muted">
            {t("custom")}
          </label>
          <div className="w-32">
            <Input
              id="budget-custom"
              type="number"
              min={0}
              step={50}
              inputMode="numeric"
              autoFocus={showCustom}
              placeholder={t("noLimit")}
              value={isCustom ? value : ""}
              onChange={(e) =>
                onChange(e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="mt-2.5 text-xs text-muted underline decoration-line-strong underline-offset-4 transition-colors duration-(--dur-standard) hover:text-ink"
        >
          {t("custom")}
        </button>
      )}
    </div>
  );
}

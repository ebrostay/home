"use client";

import { useTranslations } from "next-intl";
import type { BillsPolicy, HostPricing } from "@/lib/api";
import { formatEuro } from "@/lib/pricing";
import { LIMITS, priceVerdict, type PriceBand } from "@/lib/manage";
import { MoneyField } from "./MoneyField";
import { Segmented } from "./Segmented";
import { ChipGroup } from "./ChipGroup";

// The four things that decide what a home earns: rent, bills, deposit, and the
// shortest stay accepted. Controlled and page-agnostic — values in, values out,
// no fetching, no dirty tracking, no save button. Manage owns the save; the
// new-property wizard will own a Next button; both compose this.
//
// The handoff's "discount by stay length" block is deliberately absent: v2 has
// no length-discount field in the data model and no discount term in the
// booking math (lib/pricing.ts), so shipping the control would price stays the
// booking panel cannot quote. It returns with a pricing ADR, not before.

export type PricingValue = Omit<HostPricing, "maxStayMonths">;

/** The stay floors offered. Not a free number: 1, 2, 3 and 6 months are the
 *  choices a corporate let actually turns on, and a free field invites 7. */
const MIN_STAY_CHOICES = [1, 2, 3, 6];

/** Only used when an owner turns the cap on and has never set one. */
const DEFAULT_CAP = 90;

export function PricingFields({
  value,
  onChange,
  band,
  maxStayMonths,
  locale,
}: {
  value: PricingValue;
  onChange: (value: PricingValue) => void;
  /** What comparable published homes charge, or null when there are too few. */
  band?: PriceBand | null;
  maxStayMonths: number;
  locale: string;
}) {
  const t = useTranslations("host.manage.pricing");
  const set = <K extends keyof PricingValue>(key: K, next: PricingValue[K]) =>
    onChange({ ...value, [key]: next });

  const verdict = band && value.priceNumber > 0 ? priceVerdict(value.priceNumber, band) : null;
  const rentHint = !band
    ? t("rentNoBand")
    : verdict === "inLine"
      ? t("rentInLine", { count: band.count })
      : verdict === "above"
        ? t("rentAbove", { high: formatEuro(band.high, locale) })
        : t("rentBelow", { low: formatEuro(band.low, locale) });

  return (
    <div className="flex flex-col gap-5">
      {/* Top-aligned on purpose: the rent hint hangs below its field, and a
          stretched or bottom-aligned grid would make the neighbouring columns
          jump every time the hint changes length. */}
      <div className="grid items-start gap-3.5 min-[34rem]:grid-cols-2 min-[62rem]:grid-cols-3">
        <MoneyField
          label={t("rent")}
          value={value.priceNumber}
          onChange={(v) => set("priceNumber", v)}
          max={LIMITS.maxPrice}
          hint={rentHint}
          hintTone={verdict === "inLine" ? "good" : verdict ? "warn" : "muted"}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-[0.8125rem] font-semibold text-ink">{t("bills")}</span>
          {/* Three segments, not the handoff's two: the model has a third
              policy (`included`, no ceiling), and folding it into `capped`
              would silently invent a cap on any listing that offers none. */}
          <Segmented<BillsPolicy>
            name="billsPolicy"
            label={t("bills")}
            value={value.billsPolicy}
            onChange={(policy) =>
              onChange({
                ...value,
                billsPolicy: policy,
                // The cap goes with the policy, so a listing can never carry a
                // ceiling it no longer offers.
                utilitiesCapEur:
                  policy === "capped" ? (value.utilitiesCapEur ?? DEFAULT_CAP) : null,
              })
            }
            options={[
              // Never "I pay": to the tenant the bills read as part of the rent,
              // and the owner-facing word has to describe the same thing.
              { value: "included", label: t("billsIncluded") },
              { value: "capped", label: t("billsCapped") },
              { value: "excluded", label: t("billsExcluded") },
            ]}
          />
          {value.billsPolicy === "capped" && (
            <MoneyField
              compact
              label={t("cap")}
              unit={t("capUnit")}
              value={value.utilitiesCapEur ?? 0}
              onChange={(v) => set("utilitiesCapEur", v)}
              max={LIMITS.maxCap}
            />
          )}
          <p className="text-xs leading-[1.4] text-muted">
            {t(`billsHint.${value.billsPolicy}` as "billsHint.capped")}
          </p>
        </div>

        <MoneyField
          label={t("deposit")}
          value={value.depositAmount ?? 0}
          onChange={(v) => set("depositAmount", v)}
          max={LIMITS.maxDeposit}
          hint={t("depositHint")}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="data text-[0.65625rem] tracking-[0.1em] text-muted">
          {t("minStay")}
        </span>
        <ChipGroup<number>
          name="minStayMonths"
          label={t("minStay")}
          value={value.minStayMonths}
          onChange={(v) => set("minStayMonths", v)}
          options={MIN_STAY_CHOICES.filter((m) => m <= maxStayMonths).map((m) => ({
            value: m,
            label: t("months", { count: m }),
          }))}
        />
        <p className="text-xs text-muted">{t("minStayNote")}</p>
      </div>
    </div>
  );
}

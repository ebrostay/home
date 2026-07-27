"use client";

import { useTranslations } from "next-intl";
import type { HostPricing } from "@/lib/api";
import { formatEuro } from "@/lib/pricing";
import { pricingPreview, type PriceBand } from "@/lib/manage";
import { PricingFields, type PricingValue } from "@/components/host/fields/PricingFields";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "./SectionCard";

// What the home earns, and the arithmetic behind it shown in full.
//
// The payout breakdown is deliberately not a single "you get X" figure: under
// ADR-004 as amended the commission is charged ONCE per stay and capped at 30
// days' rent, so the first month and every month after it are different
// numbers. A single figure would have to pick one and be wrong about the other.

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

export function PricingSection({
  value,
  onChange,
  saved,
  state,
  errorText,
  onSave,
  onDiscard,
  band,
  locale,
}: {
  value: PricingValue;
  onChange: (value: PricingValue) => void;
  saved: HostPricing;
  state: SaveState;
  /** Already localized by the page — one code→copy map, not one per section. */
  errorText?: string;
  onSave: () => void;
  onDiscard: () => void;
  band: PriceBand | null;
  locale: string;
}) {
  const t = useTranslations("host.manage.pricing");
  const preview = pricingPreview(value.priceNumber);
  const dirty = state === "dirty" || state === "error";

  const figure =
    state === "saving"
      ? t("badge.saving")
      : state === "saved"
        ? t("badge.saved")
        : dirty
          ? t("badge.unsaved")
          : t("badge.upToDate");

  return (
    <SectionCard
      id="pricing"
      label={t("label")}
      figure={figure}
      figureTone={dirty ? "text-warn" : "text-brand-strong"}
    >
      <PricingFields
        value={value}
        onChange={onChange}
        band={band}
        maxStayMonths={saved.maxStayMonths}
        locale={locale}
      />

      <div className="flex flex-col gap-2 rounded-(--radius-control) border border-line bg-surface-2 px-4 py-3.5">
        <Row
          label={t("breakdown.rent")}
          value={`${formatEuro(preview.rent, locale)} €`}
        />
        <Row
          label={t("breakdown.commission")}
          value={`−${formatEuro(preview.commission, locale)} €`}
          muted
        />
        <Row
          label={t("breakdown.utilitiesLabel")}
          value={t(`breakdown.utilities.${value.billsPolicy}` as "breakdown.utilities.capped")}
          muted
        />
        <div className="mt-1 border-t border-line pt-2.5">
          <Row
            label={t("breakdown.first")}
            value={`${formatEuro(preview.firstMonth, locale)} €`}
            strong
          />
          <Row
            label={t("breakdown.later")}
            value={`${formatEuro(preview.laterMonths, locale)} €`}
            strong
          />
        </div>
        <p className="mt-1 text-xs leading-[1.45] text-muted">{t("breakdown.note")}</p>
      </div>

      {state === "error" && (
        <p className="rounded-(--radius-control) bg-warn-soft px-3.5 py-2.5 text-[0.8125rem] text-warn">
          {errorText}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[18rem] flex-1 text-[0.78125rem] leading-[1.5] text-muted">
          {t("saveNote")}
        </p>
        {dirty && (
          <Button variant="secondary" onClick={onDiscard} className="h-[38px] text-[0.84375rem]">
            {t("discard")}
          </Button>
        )}
        <Button
          onClick={onSave}
          disabled={!dirty}
          className="h-[38px] px-[18px] text-[0.84375rem]"
        >
          {state === "saving" ? t("saving") : dirty ? t("save") : t("savedLabel")}
        </Button>
      </div>
    </SectionCard>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-[3px]">
      <span
        className={`text-[0.84375rem] ${strong ? "font-semibold text-ink" : "text-body"}`}
      >
        {label}
      </span>
      <span
        className={`data text-[0.84375rem] ${
          strong ? "font-semibold text-ink" : muted ? "text-muted" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

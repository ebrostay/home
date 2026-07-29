"use client";

import { useTranslations } from "next-intl";
import type { CleaningBy } from "@/lib/api";
import { formatEuro } from "@/lib/pricing";
import { pricingPreview } from "@/lib/manage";

// What the owner takes home, in two figures rather than one.
//
// Under ADR-004 as amended the commission is charged ONCE per stay and capped
// at thirty days' rent, so the first month and every month after it are
// different numbers. A single "you get X" figure would have to pick one and be
// wrong about the other — and the one it would be wrong about is the one that
// decides whether listing here is worth it, since a six-month tenant pays the
// commission once.
//
// `pricingPreview` is Manage's, deliberately: the two pages must not quote
// different arithmetic for one home. Manage draws it as a line-by-line
// breakdown because an owner there is auditing a live listing; here it is two
// numbers and a sentence, because an owner here is deciding a price.
//
// Surface-2 and a hairline, not green: it is a statement of fact, not a
// success.

export function PayoutCard({
  price,
  cleaningBy,
  cleaningFeeEur,
  locale,
}: {
  price: number;
  cleaningBy: CleaningBy;
  cleaningFeeEur: number | null;
  locale: string;
}) {
  const t = useTranslations("host.new.payout");
  const preview = pricingPreview(price, cleaningBy, cleaningFeeEur);

  return (
    <div className="flex flex-col gap-3 rounded-(--radius-card) border border-line bg-surface-2 px-[17px] py-4">
      <p className="data text-[0.65625rem] tracking-[0.1em] text-muted">
        {t("label")}
      </p>

      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <Figure
          value={`${formatEuro(preview.firstMonth, locale)} €`}
          caption={t("firstMonth")}
        />
        <Figure
          value={`${formatEuro(preview.laterMonths, locale)} €`}
          caption={t("laterMonths")}
        />
      </div>

      {/* The working, shown rather than summarised: an owner who can follow
          the subtraction does not have to trust the total. */}
      <p className="text-[0.8125rem] leading-[1.5] text-body">
        {t("working", {
          rent: formatEuro(preview.rent, locale),
          commission: formatEuro(preview.commission, locale),
        })}
        {preview.cleaning > 0 &&
          ` ${t("plusCleaning", { amount: formatEuro(preview.cleaning, locale) })}`}
      </p>

      <p className="text-xs leading-[1.45] text-muted">{t("note")}</p>
    </div>
  );
}

function Figure({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="data text-[1.1875rem] font-semibold text-ink">{value}</p>
      <p className="data text-[0.625rem] tracking-[0.08em] text-muted">{caption}</p>
    </div>
  );
}

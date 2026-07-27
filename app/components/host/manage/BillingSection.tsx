"use client";

import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PayoutRow } from "@/lib/manage";
import { formatEuro } from "@/lib/pricing";
import { SectionCard } from "./SectionCard";

// Where the money comes from and when. This is the section that states the
// business model to the owner, so it is also the section that has to be
// honest about what it does not know yet.
//
// Two departures from the design handoff, both forced by rules that are
// already locked and already shipped in lib/pricing.ts:
//
//   · COMMISSION IS NOT A MONTHLY DEDUCTION. It is 15% of rent capped at 30
//     days' rent, charged once at the start of a stay (ADR-004 as amended,
//     ADR-023). So it appears on a stay's first row and nowhere else, and
//     later payouts are rent in full.
//   · THERE IS NO MONTHLY BILLS PASS-THROUGH. Utilities are metered and
//     settled in the final bill after move-out (ADR-023), so a "+90 €" column
//     would describe money that does not move on the 5th.
//
// And one gap: there are no payout records. Every row below is what the
// pricing rules schedule, not what has been settled — which is why no row says
// "PAID". The footnote says so in as many words.

const COLUMNS =
  "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_110px] gap-3 min-[52rem]:grid-cols-[minmax(0,1.2fr)_90px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_120px]";

export function BillingSection({
  rows,
  locale,
  now,
}: {
  rows: PayoutRow[];
  locale: string;
  now: Date;
}) {
  const t = useTranslations("host.manage.billing");
  const monthFmt = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    month: "short",
    year: "numeric",
  });
  const dayFmt = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric",
    month: "short",
  });

  const upcoming = rows.filter((r) => r.paidOn >= now);
  const total = upcoming.reduce((sum, r) => sum + r.payout, 0);

  return (
    <SectionCard
      id="billing"
      label={t("label")}
      figure={upcoming.length > 0 ? t("figure", { count: upcoming.length }) : undefined}
      figureTone="text-brand-strong"
    >
      <p className="flex items-start gap-3 rounded-(--radius-card) border border-river bg-river-soft px-4 py-3.5 text-[0.84375rem] leading-[1.5] text-ink">
        <CreditCard
          size={18}
          strokeWidth={2}
          className="mt-px shrink-0 text-river-deep"
          aria-hidden
        />
        {t("moneyPath")}
      </p>

      {rows.length === 0 ? (
        <p className="rounded-(--radius-control) border border-dashed border-line-strong px-4 py-8 text-center text-[0.84375rem] text-muted">
          {t("empty")}
        </p>
      ) : (
        <div>
          <div className={`${COLUMNS} border-b border-line px-1 pb-2.5`}>
            <Head>{t("colMonth")}</Head>
            <Head align="right" className="max-[52rem]:hidden">
              {t("colDays")}
            </Head>
            <Head align="right">{t("colRent")}</Head>
            <Head align="right" className="max-[52rem]:hidden">
              {t("colCommission")}
            </Head>
            <Head align="right">{t("colPayout")}</Head>
            <Head align="right">{t("colWhen")}</Head>
          </div>

          {rows.map((r, i) => (
            <div
              key={`${r.stayStart}-${i}`}
              className={`${COLUMNS} items-center border-b border-line px-1 py-3`}
            >
              <span className="data min-w-0 truncate text-[0.8125rem] font-semibold text-ink">
                {monthFmt.format(r.month)}
              </span>
              <span className="data text-right text-[0.8125rem] text-body max-[52rem]:hidden">
                {r.days}
              </span>
              <span className="data text-right text-[0.8125rem] text-body">
                {formatEuro(r.rent, locale)} €
              </span>
              <span className="data text-right text-[0.8125rem] text-muted max-[52rem]:hidden">
                {r.commission > 0 ? `−${formatEuro(r.commission, locale)} €` : "—"}
              </span>
              <span className="data text-right text-[0.84375rem] font-semibold text-ink">
                {formatEuro(r.payout, locale)} €
              </span>
              <span
                className={`data justify-self-end whitespace-nowrap rounded-full px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.08em] ${
                  r.paidOn >= now
                    ? "bg-river-soft text-river-deep"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {dayFmt.format(r.paidOn)}
              </span>
            </div>
          ))}

          {upcoming.length > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-1 pt-3">
              <span className="text-[0.84375rem] font-semibold text-ink">
                {t("totalLabel", { count: upcoming.length })}
              </span>
              <span className="data text-[0.9375rem] font-semibold text-ink">
                {formatEuro(total, locale)} €
              </span>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 min-[34rem]:grid-cols-2">
        <AccountCard label={t("accountLabel")} value={t("accountValue")} cta={t("accountCta")} />
        <AccountCard label={t("invoicesLabel")} value={t("invoicesValue")} cta={t("invoicesCta")} />
      </div>

      <p className="text-xs leading-[1.5] text-muted">{t("footnote")}</p>
    </SectionCard>
  );
}

// Both cards are disabled: owner payout details are not in the v2 data model
// yet (spec-v2 §2.1). Shown rather than hidden, because "we will pay you" with
// no visible account to pay into is the more alarming omission.
function AccountCard({
  label,
  value,
  cta,
}: {
  label: string;
  value: string;
  cta: string;
}) {
  const soon = useTranslations("host")("soon");
  return (
    <div className="flex items-center gap-3 rounded-(--radius-control) border border-line bg-surface-2 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="data text-[0.625rem] tracking-[0.1em] text-muted">{label}</p>
        <p className="data mt-1 truncate text-[0.84375rem] text-ink">{value}</p>
      </div>
      <button
        type="button"
        disabled
        title={soon}
        className="h-8 shrink-0 rounded-(--radius-control) border border-line bg-surface px-3 text-[0.78125rem] font-semibold text-ink transition-colors duration-(--dur-standard) hover:bg-page disabled:cursor-not-allowed disabled:opacity-45"
      >
        {cta}
      </button>
    </div>
  );
}

function Head({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <span
      className={`data text-[0.625rem] tracking-[0.1em] text-muted ${
        align === "right" ? "text-right" : ""
      } ${className}`}
    >
      {children}
    </span>
  );
}

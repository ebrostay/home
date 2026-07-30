"use client";

import { useTranslations } from "next-intl";
import { useShortMonths } from "@/i18n/dates";
import { shortDate } from "@/lib/dates";
import type { PortfolioStats } from "@/lib/portfolio";
import { LedgerStrip, type LedgerCell } from "@/components/host/LedgerStrip";

// The ledger strip: four figures that describe the whole portfolio. The strip
// itself is shared with the Manage page — see LedgerStrip for why the subgrid
// and the 1px gap are load-bearing.

export function PortfolioLedger({
  stats,
  locale,
  now,
}: {
  stats: PortfolioStats;
  locale: string;
  now: Date;
}) {
  const t = useTranslations("host.ledger");
  const intl = locale === "es" ? "es-ES" : "en-GB";
  const months = useShortMonths();

  const month = new Intl.DateTimeFormat(intl, {
    month: "long",
    year: "numeric",
  })
    .format(now)
    .toUpperCase();

  const monthDay = (d: Date) =>
    new Intl.DateTimeFormat(intl, { day: "numeric", month: "long" }).format(d);

  const vacancy = stats.nextVacancy;

  const cells: LedgerCell[] = [
    {
      key: "live",
      label: t("liveLabel"),
      value: String(stats.live),
      tone: "text-ink",
      note: t("liveNote", { total: stats.total, review: stats.review }),
    },
    {
      key: "occupancy",
      label: t("occupancyLabel"),
      value: stats.occupancy === null ? "—" : `${stats.occupancy}%`,
      tone: "text-ink",
      note:
        stats.occupancy === null
          ? t("occupancyNoteEmpty")
          : t("occupancyNote", { booked: stats.booked, sellable: stats.sellable }),
    },
    {
      key: "vacancy",
      label: t("vacancyLabel"),
      value:
        vacancy === null
          ? t("vacancyNone")
          : vacancy.kind === "openNow"
            ? t("vacancyOpen")
            : shortDate(vacancy.date, months, {
                locale,
                year: true,
              }).toUpperCase(),
      tone: "text-river-deep",
      note:
        vacancy === null
          ? t("vacancyNoneNote")
          : vacancy.kind === "openNow"
            ? t("vacancyOpenNote", { count: vacancy.count })
            : t("vacancyDateNote", {
                name: vacancy.name,
                date: monthDay(vacancy.date),
              }),
    },
    {
      key: "requests",
      label: t("requestsLabel"),
      value: String(stats.pendingTotal),
      tone: stats.pendingTotal > 0 ? "text-brand-strong" : "text-muted",
      note:
        stats.oldestPendingDays === null
          ? t("requestsNoneNote")
          : t("requestsNote", { days: stats.oldestPendingDays }),
    },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-(--radius-card) border border-line bg-surface px-6 pb-[1.375rem] pt-5 shadow-(--shadow-card)">
      <div className="ledger-rule">
        <span>{t("rule", { month })}</span>
      </div>

      <LedgerStrip cells={cells} />
    </section>
  );
}

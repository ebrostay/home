"use client";

import { useTranslations } from "next-intl";
import type { PortfolioStats } from "@/lib/portfolio";

// The ledger strip: four figures that describe the whole portfolio.
//
// The subgrid is load-bearing. Labels wrap to different heights ("OCCUPANCY,
// NEXT 12 MONTHS" is two lines where "NEXT VACANCY" is one), and sharing grid
// rows is what keeps all four values on one baseline. The 1px column gap is
// not a gap — it is the parent's --line background showing through, which is
// what draws the vertical hairlines between cells.

type Cell = { key: string; label: string; value: string; tone: string; note: string };

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

  const month = new Intl.DateTimeFormat(intl, {
    month: "long",
    year: "numeric",
  })
    .format(now)
    .toUpperCase();

  const monthDay = (d: Date) =>
    new Intl.DateTimeFormat(intl, { day: "numeric", month: "long" }).format(d);

  const vacancy = stats.nextVacancy;

  const cells: Cell[] = [
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
            : new Intl.DateTimeFormat(intl, { month: "short", year: "numeric" })
                .format(vacancy.date)
                .toUpperCase(),
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

      {/* Column count is explicit rather than auto-fit: with four cells,
          auto-fit settles on three at some widths and the leftover track has
          no cell in it — which, since the hairlines are the parent's own
          background showing through a 1px gap, paints as a grey block. 1 / 2 /
          4 always divides evenly. */}
      <div className="-ml-5 grid grid-cols-1 grid-rows-[auto_auto_auto] gap-x-px bg-line min-[30rem]:grid-cols-2 min-[64rem]:grid-cols-4">
        {cells.map((c) => (
          <div
            key={c.key}
            /* py rather than a row gap: once auto-fit collapses to one column
               the cells stack, and a row gap would fall between a cell's own
               label, value and note as well as between cells. */
            className="row-span-3 grid grid-rows-subgrid content-start gap-y-1.5 bg-surface px-5 py-2.5"
          >
            <span className="data text-[0.65625rem] tracking-[0.1em] text-muted">
              {c.label}
            </span>
            <span
              className={`data text-[1.625rem] font-semibold leading-[1.1] tracking-[-0.01em] ${c.tone}`}
            >
              {c.value}
            </span>
            <span className="text-[0.78125rem] leading-[1.4] text-muted">
              {c.note}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

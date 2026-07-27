"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HostRequestRow } from "@/lib/api";
import type { Occupancy, Stay } from "@/lib/manage";
import { SectionCard } from "./SectionCard";

// How the listing is doing. Framed as reporting, never as work waiting on the
// owner: requests are reported as "we answered them", because Ebrostay answers
// them. There is no reply-time metric and no accept/decline control.
//
// Views are the honest gap on this page. Umami is client-side and write-only —
// there is no read API to source a view count from — so rather than invent a
// number or a sparkline, the tile says what it is waiting for. The three
// figures beside it come from data we actually hold.

export function PerformanceSection({
  requests,
  stays,
  occupancy,
}: {
  requests: HostRequestRow[];
  stays: Stay[];
  occupancy: Occupancy;
}) {
  const t = useTranslations("host.manage.performance");

  const booked = stays.filter((s) => s.status !== "completed");
  const nights = booked.reduce((sum, s) => sum + s.days, 0);
  // One source for both, so the two tiles cannot disagree about the same stays.
  const average = booked.length > 0 ? nights / booked.length : null;

  const tiles = [
    {
      key: "requests",
      value: String(requests.length),
      label: t("requestsLabel"),
      note: t("requestsNote"),
      tone: "text-ink",
    },
    {
      key: "stays",
      value: String(booked.length),
      label: t("staysLabel"),
      note: t("staysNote", { nights }),
      tone: "text-ink",
    },
    {
      key: "average",
      value: average === null ? "—" : t("averageValue", { days: Math.round(average) }),
      label: t("averageLabel"),
      note: average === null ? t("averageNoteEmpty") : t("averageNote"),
      tone: "text-ink",
    },
    {
      key: "open",
      value: String(occupancy.open),
      label: t("openLabel"),
      note: t("openNote"),
      tone: occupancy.open > 0 ? "text-river-deep" : "text-muted",
    },
  ];

  return (
    <SectionCard id="performance" label={t("label")}>
      <div className="grid gap-3.5 min-[30rem]:grid-cols-2 min-[62rem]:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="rounded-(--radius-control) border border-line bg-surface-2 px-4 py-3.5"
          >
            <p className={`data text-[1.375rem] font-semibold leading-none ${tile.tone}`}>
              {tile.value}
            </p>
            <p className="data mt-2 text-[0.625rem] tracking-[0.1em] text-muted">
              {tile.label}
            </p>
            <p className="mt-1.5 text-xs leading-[1.4] text-muted">{tile.note}</p>
          </div>
        ))}
      </div>

      <div className="rounded-(--radius-control) border border-dashed border-line-strong px-4 py-6 text-center">
        <p className="data text-[0.625rem] tracking-[0.1em] text-muted">
          {t("viewsLabel")}
        </p>
        <p className="mx-auto mt-2 max-w-[46ch] text-[0.84375rem] leading-[1.5] text-muted">
          {t("viewsEmpty")}
        </p>
      </div>

      <p className="flex items-start gap-2.5 rounded-(--radius-control) bg-river-soft px-3.5 py-3 text-[0.8125rem] leading-[1.5] text-ink">
        <Info size={16} strokeWidth={2} className="mt-px shrink-0 text-river-deep" aria-hidden />
        {t("tip")}
      </p>
    </SectionCard>
  );
}

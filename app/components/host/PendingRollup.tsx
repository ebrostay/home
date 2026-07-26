"use client";

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HostProperty } from "@/lib/api";

// A roll-up and a route, not a work surface. Accepting or declining a request
// needs the stay, the dates and the calendar next to it — all of which live
// inside the property. This strip only says how many are waiting and where.
export function PendingRollup({
  properties,
  total,
  soon,
}: {
  properties: HostProperty[];
  total: number;
  /** Why the chips do not route yet — the per-property surface is next. */
  soon: string;
}) {
  const t = useTranslations("host");

  return (
    <section className="flex flex-wrap items-center gap-x-[1.125rem] gap-y-3 rounded-(--radius-card) border border-river bg-river-soft px-5 py-3.5">
      <MessageSquare
        size={18}
        strokeWidth={2}
        className="shrink-0 text-river-deep"
        aria-hidden
      />
      <p className="text-sm font-semibold text-ink">
        {t("pending.headline", { count: total })}
      </p>
      <p className="text-[0.8125rem] text-body">{t("pending.explainer")}</p>

      <div className="ml-auto flex flex-wrap gap-2">
        {properties.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled
            title={soon}
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 transition-colors duration-(--dur-standard) hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="data text-[0.78125rem] font-semibold text-brand-strong">
              {p.requestCount}
            </span>
            <span className="text-[0.78125rem] text-ink">{p.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

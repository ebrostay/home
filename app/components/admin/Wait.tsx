"use client";

import { useTranslations } from "next-intl";
import { formatWait, waitBand, type WaitBand } from "@/lib/review";

// How long this listing has been waiting — the one loud thing on the queue.
//
// It earns that on the argument the queue is built on: at the other end of
// every row is an owner who filled in nine steps and is watching nothing
// happen, and the only number that says so is this one. So it is set in the
// mono data voice at the head of the row, and it carries a three-step meter
// underneath — not a gradient, because a continuous scale makes every row
// slightly different and none of them urgent.
//
// Colour arrives only at the last step. A queue where every row is amber is a
// queue nobody reads.

const BANDS: Record<WaitBand, { text: string; fill: string; steps: number }> = {
  fresh: { text: "text-body", fill: "bg-line-strong", steps: 1 },
  due: { text: "text-warn", fill: "bg-warn", steps: 2 },
  late: { text: "text-danger font-semibold", fill: "bg-danger", steps: 3 },
};

export function Wait({ hours }: { hours: number | null }) {
  const t = useTranslations("admin.queue");
  const band = waitBand(hours);
  const { text, fill, steps } = BANDS[band];

  return (
    <span className="flex flex-col gap-1">
      <span className={`data text-[0.8125rem] tabular-nums ${text}`}>
        {formatWait(hours)}
      </span>
      <span
        className="flex gap-0.5"
        role="img"
        aria-label={t(`band.${band}` as "band.fresh")}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-0.5 w-3 rounded-full ${i < steps ? fill : "bg-line"}`}
          />
        ))}
      </span>
    </span>
  );
}

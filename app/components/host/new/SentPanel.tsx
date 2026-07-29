"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Link } from "@/i18n/navigation";

// What replaces the wizard once the draft is in the queue.
//
// One quiet celebratory mark and a three-step timeline, coloured by the same
// three-state logic as the rail: brand = done, river = in progress,
// line-strong = not yet. Nothing here promises a date, because nothing in the
// system schedules one — "within one working day" is the commitment the rest
// of the product already makes, and it is the only timing claimed.

const TIMELINE = ["sent", "checking", "live"] as const;

const DOT: Record<(typeof TIMELINE)[number], string> = {
  sent: "bg-brand",
  checking: "bg-river",
  live: "bg-line-strong",
};

export function SentPanel({ onAddAnother }: { onAddAnother: () => void }) {
  const t = useTranslations("host.new.sent");

  return (
    <section className="mx-auto mt-10 flex max-w-[45rem] flex-col gap-6 rounded-(--radius-card) border border-line bg-surface px-9 py-9 shadow-(--shadow-card)">
      <span
        aria-hidden
        className="grid h-11 w-11 place-items-center rounded-full bg-brand-soft"
      >
        <Check size={22} strokeWidth={2.5} className="text-brand" />
      </span>

      <div className="flex flex-col gap-2.5">
        <h1 className="font-display text-[1.875rem] font-bold leading-[1.1] tracking-[-0.015em] text-ink">
          {t("title")}
        </h1>
        <p className="max-w-[56ch] text-[0.90625rem] leading-[1.55] text-body">
          {t("body")}
        </p>
      </div>

      <ol className="flex list-none flex-col p-0">
        {TIMELINE.map((key, i) => (
          <li key={key} className="flex gap-3.5 pb-3.5 last:pb-0">
            <span className="flex shrink-0 flex-col items-center">
              <span aria-hidden className={`h-[11px] w-[11px] rounded-full ${DOT[key]}`} />
              {/* The connector stops at the last row rather than trailing off
                  into nothing after it. */}
              {i < TIMELINE.length - 1 && (
                <span aria-hidden className="w-px flex-1 bg-line" />
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-1 pb-3.5">
              <span className="text-sm font-semibold text-ink">
                {t(`step.${key}.name` as "step.sent.name")}
              </span>
              <span className="data text-[0.6875rem] tracking-[0.06em] text-muted">
                {t(`step.${key}.when` as "step.sent.when")}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/host"
          className="flex h-[42px] items-center rounded-(--radius-control) bg-brand px-5 text-sm font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong"
        >
          {t("toPortfolio")}
        </Link>
        {/* Hosts with one property usually have three. */}
        <button
          type="button"
          onClick={onAddAnother}
          className="flex h-[42px] items-center rounded-(--radius-control) border border-line bg-surface px-5 text-sm font-semibold text-ink transition-colors duration-(--dur-standard) hover:bg-surface-2"
        >
          {t("addAnother")}
        </button>
      </div>
    </section>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { stageLine } from "@/lib/import";
import type { ImportStage } from "@/lib/api";

// The wait, designed as a wait (§10.2). No progress bar anywhere: the duration
// is not knowable and a bar that stalls at 80% is a lie with a number on it.
// One spinner, one live status line, and the honest sentence about why it is
// slow — then the escape hatch, which is the important part.

export function ReadingScreen({
  host,
  stage,
  elapsedMs,
  onMeanwhile,
  onStop,
}: {
  /** The matched source ("idealista"), echoed so the owner can see we are
   *  reading the thing they pasted and not something else. */
  host: string;
  stage: ImportStage;
  elapsedMs: number;
  onMeanwhile: () => void;
  onStop: () => void;
}) {
  const t = useTranslations("host.import");
  const line = stageLine(stage, elapsedMs);
  const label = {
    fetching: t("stageFetching"),
    reading: t("stageReading"),
    matching: t("stageMatching"),
  }[line.key];

  return (
    <div className="mx-auto w-full max-w-[35rem]">
      <section className="rounded-(--radius-card) border border-line bg-surface px-6 py-[22px] shadow-(--shadow-card)">
        <h1 className="font-display text-[1.1875rem] font-bold text-ink">{t("readingTitle")}</h1>

        {host && (
          <p className="data mt-3 inline-block max-w-full truncate rounded-full bg-river-soft px-3 py-1 text-[0.78125rem] font-semibold text-ink">
            {host}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          {/* River, and a graphic rather than text — 3:1 is the bar it has to
              clear, which is the one river-deep can hold. Still under
              prefers-reduced-motion: a spinner is the exact thing that rule
              is about, and the status line already says what is happening. */}
          <span
            aria-hidden="true"
            className="h-[1.1875rem] w-[1.1875rem] shrink-0 animate-spin rounded-full border-2 border-river-deep border-t-transparent motion-reduce:animate-none"
          />
          <p className="text-[0.8125rem] text-ink" aria-live="polite">
            {label}
          </p>
        </div>

        <p className="mt-4 text-[0.78125rem] leading-[1.55] text-body">{t("honest")}</p>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          {/* The prominent one, on purpose. A read that outlives the screen it
              started on is the whole reason a minute of waiting is acceptable:
              the merge only fills fields the owner has not touched, so filling
              it in meanwhile costs nothing. */}
          <button
            type="button"
            onClick={onMeanwhile}
            className="rounded-(--radius-control) bg-brand px-4 py-[11px] text-[0.84375rem] font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong"
          >
            {t("meanwhile")}
          </button>
          <button
            type="button"
            onClick={onStop}
            className="text-[0.78125rem] text-body underline underline-offset-2 transition-colors duration-(--dur-standard) hover:text-ink"
          >
            {t("stop")}
          </button>
        </div>
      </section>
    </div>
  );
}

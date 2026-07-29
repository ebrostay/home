"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { Progress } from "@/lib/wizard";

// One card holds every step. The step itself is only ever the question and the
// fields under it — the progress header, the aside and the footer are the same
// furniture nine times, and a step that drew its own would be nine chances for
// the ninth to disagree with the other eight about where Back sits.
//
// ── The two floors ───────────────────────────────────────────────────────
// The body is a question column beside a 285px aside. Both have a floor, and
// they are the whole responsive story of this card: the question column never
// goes below 420px, and the aside never grows past 285px. Under that the two
// invert and the aside starts reading as the main column — which is what an
// `auto`-sized sidebar does to a page the moment its own text is longer than
// the question's. Below the breakpoint the aside drops beneath the question
// rather than shrinking further.

export function StepCard({
  progress,
  head,
  lede,
  why,
  children,
  footer,
}: {
  progress: Progress;
  head: string;
  lede: string;
  /** The `WHY WE ASK` aside. Every step carries one, each concrete and
   *  different — it is what justifies the intrusion in guest-demand terms
   *  rather than in ours. */
  why: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const t = useTranslations("host.new");
  const heading = useRef<HTMLHeadingElement>(null);

  // Focus moves to the question on every advance. Without it a keyboard or
  // screen-reader user presses Continue and stays parked on a button at the
  // bottom of a card whose entire contents have just been replaced.
  useEffect(() => {
    heading.current?.focus();
  }, [head]);

  return (
    // NOT overflow-hidden, though the tinted header and footer would love it:
    // the pricing step opens a calendar popover that hangs below the card, and
    // a clipping card cuts it off mid-July. The two bars follow the card's
    // corners by rounding themselves instead — the same reason Manage's
    // SectionCard doesn't clip either.
    <section className="flex flex-col rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card)">
      <div className="flex items-center gap-3.5 rounded-t-[inherit] border-b border-line bg-surface-2 px-[22px] py-3.5">
        {/* Not a <progress>: this is a decorative echo of the counter beside
            it, which is the accessible statement of the same fact. Two of them
            announced would be the same number read twice. */}
        <div
          aria-hidden
          className="h-[5px] min-w-[3.75rem] flex-1 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-(--dur-standard)"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <p className="data whitespace-nowrap text-[0.6875rem] text-ink">
          {t("counter", { position: progress.position, total: progress.total })}
        </p>
        <span aria-hidden className="text-xs text-muted">
          ·
        </span>
        <p className="whitespace-nowrap text-xs text-muted max-[30rem]:hidden">
          {t("minutesLeft", { minutes: progress.minutesLeft })}
        </p>
      </div>

      <div className="grid items-start gap-8 px-6 pb-7 pt-8 min-[56rem]:grid-cols-[minmax(26.25rem,1fr)_minmax(13.4375rem,17.8125rem)] sm:px-9">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            {/* tabIndex -1 so focus can be moved here on advance; it is not in
                the tab order, so nobody tabs onto a heading. */}
            <h2
              ref={heading}
              tabIndex={-1}
              className="font-display text-[1.6875rem] font-bold leading-[1.15] tracking-[-0.015em] text-ink outline-none"
            >
              {head}
            </h2>
            <p className="max-w-[56ch] text-[0.90625rem] leading-[1.55] text-body">
              {lede}
            </p>
          </div>
          {children}
        </div>

        {/* Brand-soft and borderless: it is ours talking, not another thing to
            fill in. */}
        <aside className="flex flex-col gap-2 self-start rounded-(--radius-card) bg-brand-soft px-[18px] py-4">
          <p className="data text-[0.65625rem] tracking-[0.1em] text-brand-strong">
            {t("whyWeAsk")}
          </p>
          <p className="text-[0.8125rem] leading-[1.55] text-ink">{why}</p>
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-b-[inherit] border-t border-line bg-surface-2 px-6 py-4 sm:px-9">
        {footer}
      </div>
    </section>
  );
}

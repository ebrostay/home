"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

// The one step with nothing behind it.
//
// There is no document model, no upload endpoint and no terms record on this
// branch — `energyRating` is a plain A–G field in Basics and nothing else here
// has a counterpart. So this ships inside the prototype's own
// NOT BUILT YET · DESIGN INTENT frame: the five rows are inert, the checkbox
// stores nothing, and submit does not require either (ADR-030 Decision 6).
//
// Shown rather than dropped because the five documents ARE what an owner will
// be asked for, and knowing that at the point of listing is worth more than a
// tidy page. What is not acceptable is showing them as if they worked — hence
// the frame, which is the only place in the product where design intent is on
// screen and the only place it is labelled as such.

const DOCUMENTS = ["id", "deed", "energy", "cadastre", "iban"] as const;

export function PaperworkStep() {
  const t = useTranslations("host.new.paperwork");

  return (
    // Amber carries this frame through its BORDER and its discs, and through
    // nothing else. Neither the colour nor the wash survives a contrast check
    // in light mode: `--warn` text tops out at 3.66:1 on any surface we have,
    // and on a `--warn-soft` wash even `--ink` falls to 5.6 while body text
    // hits 3.06 — under the 4.5 that 10px mono needs. A dashed amber rule and
    // a dot say "not built" just as loudly and stay readable.
    <div className="flex flex-col gap-4 rounded-(--radius-card) border border-dashed border-warn p-4">
      <p className="data flex items-center gap-2 text-[0.625rem] tracking-[0.1em] text-ink">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
        {t("visionBadge")}
      </p>

      {/* No blanket opacity. Fading the whole subtree to signal "inert" costs
          every ratio inside it the same fraction, and the rows are already
          inert in the way that matters: nothing here hovers, focuses or takes
          a click. Legible and inert beats faded and inert. */}
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[0.78125rem] font-semibold text-ink">
            {t("documents")}
          </span>
          <span className="data text-[0.65625rem] tracking-[0.06em] text-body">
            {t("ready", { done: 0, total: DOCUMENTS.length })}
          </span>
        </div>

        <ul className="flex list-none flex-col gap-2 p-0">
          {DOCUMENTS.map((key) => (
            <li
              key={key}
              className="flex items-center gap-3 rounded-(--radius-control) border border-warn bg-surface px-[15px] py-3"
            >
              <span
                aria-hidden
                className="h-5 w-5 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--warn)]"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[0.84375rem] font-semibold text-ink">
                  {t(`doc.${key}.name` as "doc.id.name")}
                </span>
                <span className="text-xs leading-[1.4] text-muted">
                  {t(`doc.${key}.hint` as "doc.id.hint")}
                </span>
              </span>
              <span className="data shrink-0 text-[0.65625rem] tracking-[0.06em] text-body">
                {t("addFile")}
              </span>
            </li>
          ))}
        </ul>

        {/* The commercial terms are NAMED in the consent text rather than
            hidden behind a link, and they state the real model: 15% capped at
            thirty days' rent charged once, daily proration, 31–364 days. */}
        <div className="flex items-start gap-3 rounded-(--radius-card) border border-line bg-surface-2 px-4 py-3.5">
          <span
            aria-hidden
            className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-2 border-line-strong"
          >
            <Check size={11} strokeWidth={3} className="text-transparent" />
          </span>
          <p className="text-[0.8125rem] leading-[1.55] text-body">{t("terms")}</p>
        </div>
      </div>

      <p className="text-xs leading-[1.45] text-body">{t("visionNote")}</p>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { ImportMark } from "./ImportMark";
import { IMPORT_STEP_OF, type ImportKey } from "@/lib/import";
import type { StepKey } from "@/lib/wizard";

// The only change an import makes to the nine steps. No step's fields, order,
// validation or copy changes because an import happened.
//
// There is no summary screen (ADR-033): an earlier version put a "what we read"
// ledger between the extraction and step 1, and it was cut because it was
// read-only, said everything the form was about to say again, and let an owner
// feel finished before looking at anything. So the marks and this banner are
// the entire review surface — which is why it has NO BUTTONS and NO NUMBERS.
// A count of marked fields is a number the owner can see for themselves, and a
// list of what was missing is a second copy of the form in prose that then has
// to be kept in sync with it. There is no "clear these marks" button either:
// editing the field is the only way to say "I have looked at this".
//
// Variant is chosen by StepKey, NEVER by number: the design handoff's §10.3–10.5
// numbers predate the ninth step and are off by one past the first.

/** The two steps an import is not allowed to fill, whatever the portal had.
 *  They already have their reasons written for the offer screen, so the banner
 *  says the same thing here rather than inventing a shorter version of it. */
const POLICY_STEPS = new Set<StepKey>(["photos", "paperwork"]);

export function ImportBanner({
  step,
  source,
  imported,
  justLanded,
}: {
  step: StepKey;
  source: string;
  imported: string[];
  /** The result arrived while the owner was already in the form — they took
   *  "Start filling it in meanwhile" and fields moved under them. Someone who
   *  watched the wait to the end is not startled and does not need shouting at. */
  justLanded: boolean;
}) {
  const t = useTranslations("host.import");
  const named = source ? source[0].toUpperCase() + source.slice(1) : source;
  const policy = POLICY_STEPS.has(step);
  const touched = imported.some((k) => IMPORT_STEP_OF[k as ImportKey] === step);

  const eyebrow = policy
    ? t("bannerPolicy")
    : justLanded
      ? t("bannerJustLanded", { source: named })
      : touched
        ? t("bannerFrom", { source: named })
        : t("bannerNothing");

  return (
    <aside className="flex gap-3 rounded-(--radius-card) border border-river bg-river-soft px-4 py-3">
      <span aria-hidden="true" className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-river-deep" />
      <div>
        <p className="data text-[0.65625rem] font-semibold tracking-[0.1em] text-ink">
          {eyebrow}
        </p>
        {/* --river-deep and --muted both fail 4.5:1 on --river-soft, so neither
            is a text colour on this panel. Body copy goes --body-text, the
            eyebrow --ink. The glyph keeps river because it is not text. */}
        <p className="mt-1 text-[0.78125rem] leading-[1.5] text-body">
          {policy ? (
            step === "photos" ? (
              t("neverPhotos")
            ) : (
              t("neverPaperwork")
            )
          ) : touched ? (
            <>
              <ImportMark /> {t("bannerKey", { source: named })}
            </>
          ) : (
            t("bannerNothingLine", { source: named })
          )}
        </p>
        {/* The price is carried across UNCHANGED — a portal quotes a calendar
            month and this field is thirty days flat (ADR-023). Multiplying by
            30/31 would be a guess about the owner's intent landing in the one
            field with contract consequences, so the caution says it instead. */}
        {step === "pricing" && touched && (
          <p className="mt-1 text-[0.78125rem] leading-[1.5] text-body">
            {t("bannerPricingCaution")}
          </p>
        )}
      </div>
    </aside>
  );
}

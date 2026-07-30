"use client";

import { useTranslations } from "next-intl";
import { ImportMark } from "./ImportMark";
import { IMPORT_KEYS, IMPORT_STEP_OF, type ImportKey } from "@/lib/import";
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

/** The steps an import can reach at all. `nearby` is absent by design — no key
 *  maps to it, because nothing an advert publishes belongs in a measured
 *  walking time — so there, "the portal had nothing" is true whether or not we
 *  watched the read land. */
const IMPORTABLE_STEPS = new Set<string>(IMPORT_KEYS.map((k) => IMPORT_STEP_OF[k]));

export function ImportBanner({
  step,
  source,
  imported,
  arrived,
  justLanded,
}: {
  step: StepKey;
  source: string;
  /** What is still MARKED — i.e. what nobody has looked at yet. Shrinks as the
   *  owner works. */
  imported: string[];
  /** What ARRIVED, which is a different question and never shrinks. Null on a
   *  resumed draft: the arrival set is not persisted, so after a reload we know
   *  an import happened and what is still marked, but not what has since been
   *  reviewed away. */
  arrived: string[] | null;
  /** The result arrived while the owner was already in the form — they took
   *  "Start filling it in meanwhile" and fields moved under them. Someone who
   *  watched the wait to the end is not startled and does not need shouting at. */
  justLanded: boolean;
}) {
  const t = useTranslations("host.import");
  const named = source ? source[0].toUpperCase() + source.slice(1) : source;
  const policy = POLICY_STEPS.has(step);
  const here = (keys: string[]) => keys.some((k) => IMPORT_STEP_OF[k as ImportKey] === step);

  // Is there still something on this step nobody has read? That is a question
  // about REVIEW, and the eyebrow is the only line entitled to answer it.
  const unreviewed = here(imported);

  // Did the portal send anything for this step? A question about ARRIVAL, and
  // the answer must not change because the owner did their job: the body line
  // for "no" says the portal had nothing, and once the last mark on a step
  // clears — the normal end state of using this feature, which every step
  // reaches — reading that off the live set turns it into a lie about a step
  // the owner has just finished reviewing.
  //
  // With the arrival set gone (a resumed draft) the honest answer is "we
  // cannot tell", so it falls back to what is knowable without it: whether an
  // import COULD have landed here. That keeps the true sentence on `nearby`
  // and, on a step that can take an import, prefers the line that only
  // explains the glyph over the one that would assert something false.
  const arrivedHere = arrived === null ? IMPORTABLE_STEPS.has(step) : here(arrived);

  const eyebrow = policy
    ? t("bannerPolicy")
    : justLanded
      ? t("bannerJustLanded", { source: named })
      : unreviewed
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
          ) : arrivedHere ? (
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
            field with contract consequences, so the caution says it instead.
            On `unreviewed`, not `arrivedHere`: it is a thing to go and check,
            and once every price on the step has been looked at there is
            nothing left to check it against. */}
        {step === "pricing" && unreviewed && (
          <p className="mt-1 text-[0.78125rem] leading-[1.5] text-body">
            {t("bannerPricingCaution")}
          </p>
        )}
      </div>
    </aside>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import type { HostListing } from "@/lib/api";
import {
  AMENITY_ICONS,
  BASELINE_KEYS,
  amenityState,
  unansweredBaseline,
  type AmenityState,
} from "@/lib/amenities";
import { AmenityBrowser } from "@/components/amenities/AmenityBrowser";
import type { MarkFor } from "@/components/host/new/import/ImportMark";

// What the home offers — asked as two different questions, because they are
// two different questions.
//
// THE BASELINE is a checklist of nine, each answered yes or no. Our listing
// research found the failure this fixes: a guest reading a page with no
// mention of heating cannot tell a flat with none from an owner who stopped
// ticking boxes halfway, and assumes the former is impossible. So the nine are
// asked outright, and a no is published as a no. An owner who skips the
// question still publishes as a no — silence is not a third answer to a
// reader — but only the owner is told which ones they left unanswered, so the
// nudge names a gap rather than accusing them of having no hot water.
//
// EVERYTHING ELSE is opt-in and searchable. Free text would give every listing
// its own word for the washing machine and no filter could find any of them,
// so the vocabulary is fixed; search over synonyms in both languages is what
// keeps a fixed vocabulary usable at sixty entries.
//
// Selection order is preserved rather than sorted into the catalogue's order:
// the card and the detail page both read the list in the property's own order,
// so the first amenities an owner picks are the ones a guest sees first in the
// grid. Sorting here would quietly re-rank them.

const BASELINE_SET: ReadonlySet<string> = new Set(BASELINE_KEYS);

export function AmenityPicker({
  value,
  onChange,
  mark,
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
  /** The import's glyph, per field key — see `AddressFields`' own prop. The
   *  whole grid is ONE key: a portal's feature list mapping onto nine of
   *  sixty chips is still one answer to one question, so the mark sits on
   *  the group's own line and any toggle clears it. */
  mark?: MarkFor;
}) {
  const t = useTranslations("amenity");
  const te = useTranslations("host.edit.amenities");
  const absent = value.amenitiesAbsent ?? [];
  const selected = new Set(value.amenities);

  /** Answering the baseline moves a key between the two arrays; answering it
   *  the way it is already answered clears it back to unanswered, so a
   *  mis-tap is undoable with the same control that caused it. */
  const answer = (key: string, next: "yes" | "no") => {
    const now = amenityState(key, value.amenities, absent);
    const clearing = now === next;
    onChange({
      ...value,
      amenities:
        !clearing && next === "yes"
          ? [...value.amenities.filter((a) => a !== key), key]
          : value.amenities.filter((a) => a !== key),
      amenitiesAbsent:
        !clearing && next === "no"
          ? [...absent.filter((a) => a !== key), key]
          : absent.filter((a) => a !== key),
    });
  };

  /** The extras are a plain multi-select — an amenity outside the baseline is
   *  never published as an absence, so it has no "no" to record. */
  const toggleExtra = (key: string) =>
    onChange({
      ...value,
      amenities: selected.has(key)
        ? value.amenities.filter((a) => a !== key)
        : [...value.amenities, key],
    });

  const unanswered = unansweredBaseline(value.amenities, absent);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="ledger-rule">
          <span>{te("baselineTitle")}</span>
        </div>
        <p className="text-[0.84375rem] leading-relaxed text-body">
          {te("baselineIntro")} {mark?.("amenities")}
        </p>

        <ul className="flex flex-col divide-y divide-line rounded-(--radius-card) border border-line bg-surface">
          {BASELINE_KEYS.map((key) => (
            <BaselineRow
              key={key}
              amenityKey={key}
              label={t(key)}
              state={amenityState(key, value.amenities, absent)}
              onAnswer={(next) => answer(key, next)}
              yesLabel={te("yes")}
              noLabel={te("no")}
            />
          ))}
        </ul>

        {/* A count, not a blocker. Continue still works — the wizard reports
            this again on the last step, where it can be acted on next to the
            Send button. */}
        {unanswered.length > 0 && (
          // The dot carries the amber, the words do not: `--warn` cannot reach
          // 4.5:1 on any light-mode surface we have, which is the same reason
          // the wizard's "N things left" heading is set in ink (`Remaining`).
          <p className="flex items-start gap-2 text-xs leading-[1.45] text-body">
            <span
              className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn"
              aria-hidden
            />
            {te("unansweredNote", {
              count: unanswered.length,
              names: unanswered.map((k) => t(k)).join(", "),
            })}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="ledger-rule">
          <span>{te("extrasTitle")}</span>
        </div>
        <p className="text-[0.84375rem] leading-relaxed text-body">
          {te("extrasIntro")}
        </p>
        <AmenityBrowser
          selected={selected}
          onToggle={toggleExtra}
          omit={BASELINE_SET}
        />
      </section>

      {/* The handoff lists "pets allowed" among the chips. It is a house rule
          on this same page, and offering it twice lets one listing answer it
          both ways — so the pointer goes here rather than a second control. */}
      <p className="text-xs leading-[1.4] text-muted">{te("petsNote")}</p>
    </div>
  );
}

/** One baseline question. Two buttons in a tray, and — unlike `Segmented` —
 *  a real third state where neither is chosen, because "not answered yet" is
 *  the state this whole section exists to make visible. */
function BaselineRow({
  amenityKey,
  label,
  state,
  onAnswer,
  yesLabel,
  noLabel,
}: {
  amenityKey: string;
  label: string;
  state: AmenityState;
  onAnswer: (next: "yes" | "no") => void;
  yesLabel: string;
  noLabel: string;
}) {
  const Icon = AMENITY_ICONS[amenityKey];
  const unanswered = state === "unanswered";

  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      {/* The amber bar is the row's whole unanswered signal, and it sits on
          the edge rather than beside the label so nine of them read as one
          ragged column an owner can work down. */}
      <span
        aria-hidden
        className={`-my-2.5 h-11 w-[3px] shrink-0 rounded-full ${
          unanswered ? "bg-warn" : "bg-transparent"
        }`}
      />
      {Icon ? (
        <Icon
          size={17}
          strokeWidth={1.75}
          aria-hidden
          className={`shrink-0 ${state === "yes" ? "text-brand" : "text-muted"}`}
        />
      ) : (
        <span className="w-[17px] shrink-0" aria-hidden />
      )}
      <span
        className={`flex-1 text-sm ${state === "no" ? "text-muted" : "text-ink"}`}
      >
        {label}
      </span>

      <div
        role="group"
        aria-label={label}
        className="flex shrink-0 gap-[3px] rounded-(--radius-control) border border-line bg-surface-2 p-[3px]"
      >
        <AnswerButton
          on={state === "yes"}
          onClick={() => onAnswer("yes")}
          tone="yes"
          label={yesLabel}
          icon={<Check size={13} strokeWidth={3} aria-hidden />}
        />
        <AnswerButton
          on={state === "no"}
          onClick={() => onAnswer("no")}
          tone="no"
          label={noLabel}
          icon={<X size={13} strokeWidth={3} aria-hidden />}
        />
      </div>
    </li>
  );
}

function AnswerButton({
  on,
  onClick,
  tone,
  label,
  icon,
}: {
  on: boolean;
  onClick: () => void;
  tone: "yes" | "no";
  label: string;
  icon: React.ReactNode;
}) {
  // A chosen "no" is stated in ink on the surface, not in danger red: a home
  // without a lift is a fact about the home, not a fault in the form.
  const chosen =
    tone === "yes"
      ? "bg-brand text-white"
      : "bg-surface text-ink shadow-(--shadow-card)";
  return (
    <button
      type="button"
      // aria-pressed rather than a radio pair: the group has a third state
      // (neither pressed), which a radiogroup cannot express.
      aria-pressed={on}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.78125rem] font-semibold transition-colors duration-(--dur-standard) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring) ${
        on ? chosen : "text-muted hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

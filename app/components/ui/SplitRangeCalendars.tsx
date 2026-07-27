"use client";

import { useState } from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import { es, enGB } from "react-day-picker/locale";
import { useLocale } from "next-intl";
import "react-day-picker/style.css";

// ============================================================
// Two independent calendars picking one span: the left one sets the start,
// the right one the end, and both render the SAME highlighted span.
//
// Independent is the point. A linked two-month view forces you to walk the
// pair together, so choosing next April means clicking the arrow nine times;
// here each side flies to its own month. It also means the two dates are
// visible at once at whatever distance they sit apart, which a single scrolling
// range picker cannot do.
//
// This is the calendar BODY only — no popover, no trigger cells, no labels of
// its own beyond the two column headings. The guest-facing search bar wraps it
// in a popover (SplitDateRangeField); the owner's availability editor renders
// it inline. Every rule is a prop, because the two callers have genuinely
// different rules: a tenant's stay is legally 31–364 days, and an owner closing
// their own flat for a long weekend is answerable to nobody.
//
// KNOWN LIMIT, by construction: two independent calendars stop you LANDING on
// a disabled day but cannot stop a span that STEPS OVER a disabled block. A
// caller that cares must check the whole range itself — both current callers
// do (booking via stayFits, the availability editor via an overlap guard).
// ============================================================

export type SplitRange = { moveIn?: Date; moveOut?: Date };

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
export function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}
export function startOfMonth(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}
export function addMonths(base: Date, n: number): Date {
  const d = startOfMonth(base);
  d.setMonth(d.getMonth() + n);
  return d;
}
export function dayDiff(a: Date, b: Date): number {
  return Math.round((addDays(b, 0).getTime() - addDays(a, 0).getTime()) / 86_400_000);
}

/** Pure, so a caller can render its own message in its own namespace instead
 *  of this component owning copy for rules it did not set. */
export function rangeError(
  { moveIn, moveOut }: SplitRange,
  minDays: number,
  maxDays?: number,
): "tooShort" | "tooLong" | null {
  if (!moveIn || !moveOut) return null;
  const span = dayDiff(moveIn, moveOut);
  if (span < minDays) return "tooShort";
  if (maxDays !== undefined && span > maxDays) return "tooLong";
  return null;
}

export function SplitRangeCalendars({
  value,
  onChange,
  startLabel,
  endLabel,
  booked = [],
  minDays,
  maxDays,
  maxEnd,
  minDate,
  navStart,
  navEnd,
  captionLayout,
  pickStartHint,
}: {
  value: SplitRange;
  onChange: (next: SplitRange) => void;
  startLabel: string;
  endLabel: string;
  /** Days already taken: struck out and unselectable on both calendars. */
  booked?: Matcher[];
  /** Shortest span, in days between the two picked dates. 0 lets the same day
   *  serve as both ends. */
  minDays: number;
  /** Longest span, or undefined for no ceiling. */
  maxDays?: number;
  /** A ceiling tighter than `maxDays` — e.g. a listing's own max stay. The
   *  caller computes the date, because months are not a fixed day count. */
  maxEnd?: Date;
  /** Earliest selectable day, or undefined to allow the past. */
  minDate?: Date;
  navStart?: Date;
  navEnd?: Date;
  captionLayout?: "label" | "dropdown";
  /** Shown under the right calendar while no start date is picked. */
  pickStartHint: string;
}) {
  const locale = useLocale();
  const dpLocale = locale === "es" ? es : enGB;
  const { moveIn, moveOut } = value;

  const [leftMonth, setLeftMonth] = useState<Date>(moveIn ?? minDate ?? startOfToday());
  const [rightMonth, setRightMonth] = useState<Date>(
    moveOut ?? (moveIn ? addDays(moveIn, minDays) : (minDate ?? startOfToday())),
  );

  // Both calendars render the same span: the endpoints get the green marks,
  // the days strictly between get the soft fill.
  const rangeMods: Record<string, Matcher | Matcher[]> = {
    dpStart: moveIn ? [moveIn] : [],
    dpEnd: moveOut ? [moveOut] : [],
    dpMid:
      moveIn && moveOut && dayDiff(moveIn, moveOut) > 0
        ? { after: moveIn, before: moveOut }
        : [],
    // Same class the inline range picker uses, so a taken day looks taken
    // everywhere in the product.
    booked,
  };
  const rangeClasses = {
    dpStart: "dp-range-start",
    dpEnd: "dp-range-end",
    dpMid: "dp-range-mid",
    booked: "day-booked",
  };

  const leftDisabled: Matcher[] = [...(minDate ? [{ before: minDate }] : []), ...booked];

  const lastEnd =
    moveIn && maxDays !== undefined
      ? maxEnd && maxEnd < addDays(moveIn, maxDays)
        ? maxEnd
        : addDays(moveIn, maxDays)
      : (maxEnd ?? undefined);

  const rightDisabled: Matcher | Matcher[] = moveIn
    ? [
        { before: addDays(moveIn, minDays) },
        ...(lastEnd ? [{ after: lastEnd }] : []),
        ...booked,
      ]
    : () => true; // no start yet → nothing on the right is selectable

  const pickLeft = (day: Date) => {
    // The end is kept even when it no longer fits: silently correcting a date
    // the user chose is worse than telling them the pair does not work.
    onChange({ moveIn: day, moveOut });
    const span = moveOut ? dayDiff(day, moveOut) : null;
    const stillFits =
      span !== null && span >= minDays && (maxDays === undefined || span <= maxDays);
    if (!stillFits) setRightMonth(addDays(day, minDays));
  };

  return (
    <div
      className={`dp-split flex flex-col gap-4 sm:flex-row ${
        moveIn && moveOut ? "dp-has-range" : ""
      }`}
    >
      <div>
        <p className="mb-1 px-1 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-body">
          {startLabel}
        </p>
        <DayPicker
          locale={dpLocale}
          captionLayout={captionLayout}
          startMonth={navStart}
          endMonth={navEnd}
          month={leftMonth}
          onMonthChange={setLeftMonth}
          disabled={leftDisabled}
          onDayClick={(day, mods) => {
            if (!mods.disabled) pickLeft(day);
          }}
          modifiers={rangeMods}
          modifiersClassNames={rangeClasses}
          numberOfMonths={1}
        />
      </div>

      <div>
        <p className="mb-1 px-1 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-body">
          {endLabel}
        </p>
        <DayPicker
          locale={dpLocale}
          captionLayout={captionLayout}
          startMonth={navStart}
          endMonth={navEnd}
          month={rightMonth}
          onMonthChange={setRightMonth}
          disabled={rightDisabled}
          onDayClick={(day, mods) => {
            if (!mods.disabled) onChange({ moveIn, moveOut: day });
          }}
          modifiers={rangeMods}
          modifiersClassNames={rangeClasses}
          numberOfMonths={1}
        />
        {!moveIn && <p className="mt-1 px-1 text-xs text-muted">{pickStartHint}</p>}
      </div>
    </div>
  );
}

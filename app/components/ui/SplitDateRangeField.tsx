"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { DayPicker, type Matcher } from "react-day-picker";
import { es, enGB } from "react-day-picker/locale";
import { useLocale, useTranslations } from "next-intl";
import "react-day-picker/style.css";

// ============================================================
// EXPERIMENT — split move-in / move-out calendars in one popover.
//
// Two independent DayPickers: the left picks the arrival, the right the
// departure. Both render the SAME selected span. Selection does NOT close
// the popover (only an outside click does). Constraints:
//   · left  — no dates in the past
//   · right — no dates before move-in + 28 days, none on/after move-in + 364
//             (so the inclusive span stays under 365 days)
// On an invalid pair we show a hint and keep the values (never auto-correct).
//
// The 31-day floor matches the Spanish-law minimum in lib/pricing.ts
// (MIN_STAY_DAYS) — a "temporary" stay is no shorter than 31 days.
// ============================================================

const MIN_STAY_DAYS = 31; // move-out ≥ move-in + 31
const MAX_OFFSET_DAYS = 363; // move-out ≤ move-in + 363 (inclusive span < 365)

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}
function startOfMonth(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}
function addMonths(base: Date, n: number): Date {
  const d = startOfMonth(base);
  d.setMonth(d.getMonth() + n);
  return d;
}
function dayDiff(a: Date, b: Date): number {
  return Math.round((addDays(b, 0).getTime() - addDays(a, 0).getTime()) / 86_400_000);
}

export type SplitRange = { moveIn?: Date; moveOut?: Date };

export function SplitDateRangeField({
  value,
  onChange,
  moveInLabel,
  moveOutLabel,
  placeholder = "—",
  variant = "boxed",
  align = "start",
  booked = [],
  maxMoveOut,
}: {
  value: SplitRange;
  onChange: (next: SplitRange) => void;
  moveInLabel: string;
  moveOutLabel: string;
  placeholder?: string;
  // "boxed" is the standalone bordered control; "hero" renders two flush cells
  // that drop into the search bar next to City / Bedrooms.
  variant?: "boxed" | "hero";
  // Which edge the (wide) popover hangs from. "end" is for a control living in
  // a right-hand column, where anchoring left would push the calendars off the
  // viewport. Ignored by "hero", which always centres on the field.
  align?: "start" | "end";
  // Days already taken on this listing: struck out on both calendars and not
  // selectable. NOTE this only stops you LANDING on a booked day — with two
  // independent calendars nothing prevents a span that steps over a booked
  // block, so a caller that cares must still check the whole range (the
  // booking panel does, via stayFits).
  booked?: Matcher[];
  // A ceiling tighter than the legal one — the listing's own max stay. The
  // caller computes the date because months are not a fixed number of days.
  maxMoveOut?: Date;
}) {
  const locale = useLocale();
  const t = useTranslations("search.datePicker");
  const dpLocale = locale === "es" ? es : enGB;
  const { moveIn, moveOut } = value;

  const [open, setOpen] = useState(false);
  const [leftMonth, setLeftMonth] = useState<Date>(moveIn ?? startOfToday());
  const [rightMonth, setRightMonth] = useState<Date>(
    moveOut ?? (moveIn ? addDays(moveIn, MIN_STAY_DAYS) : startOfToday()),
  );

  // Bound the month/year dropdowns to a useful window: this month through 18
  // months out (a stay tops out just under a year, so its end is always in
  // range). Also stops the arrows wandering into the past.
  const navStart = startOfMonth(startOfToday());
  const navEnd = addMonths(navStart, 18);

  const fmt = (d?: Date) =>
    d
      ? new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(d)
      : placeholder;

  // Both calendars render the same span (req 7): the endpoints get the green
  // marks, the days strictly between get the soft fill.
  const rangeMods: Record<string, Matcher | Matcher[]> = {
    dpStart: moveIn ? [moveIn] : [],
    dpEnd: moveOut ? [moveOut] : [],
    dpMid:
      moveIn && moveOut && dayDiff(moveIn, moveOut) > 0
        ? { after: moveIn, before: moveOut }
        : [],
    // Same class the range picker uses, so a taken day looks taken everywhere.
    booked,
  };
  const rangeClasses = {
    dpStart: "dp-range-start",
    dpEnd: "dp-range-end",
    dpMid: "dp-range-mid",
    booked: "day-booked",
  };

  const leftDisabled: Matcher[] = [{ before: startOfToday() }, ...booked];
  // The listing's own cap, when it bites before the legal one.
  const lastMoveOut =
    moveIn && maxMoveOut && maxMoveOut < addDays(moveIn, MAX_OFFSET_DAYS)
      ? maxMoveOut
      : moveIn
        ? addDays(moveIn, MAX_OFFSET_DAYS)
        : undefined;
  const rightDisabled: Matcher | Matcher[] = moveIn
    ? [
        { before: addDays(moveIn, MIN_STAY_DAYS) },
        { after: lastMoveOut! },
        ...booked,
      ]
    : () => true; // no move-in yet → nothing on the right is selectable

  const error: "tooShort" | "tooLong" | null =
    moveIn && moveOut
      ? dayDiff(moveIn, moveOut) < MIN_STAY_DAYS
        ? "tooShort"
        : dayDiff(moveIn, moveOut) > MAX_OFFSET_DAYS
          ? "tooLong"
          : null
      : null;

  const pickLeft = (day: Date) => {
    // req 11: keep move-out untouched even if it no longer fits.
    onChange({ moveIn: day, moveOut });
    const stillFits =
      moveOut &&
      dayDiff(day, moveOut) >= MIN_STAY_DAYS &&
      dayDiff(day, moveOut) <= MAX_OFFSET_DAYS;
    if (!stillFits) setRightMonth(addDays(day, MIN_STAY_DAYS));
  };
  const pickRight = (day: Date) => onChange({ moveIn, moveOut: day });
  const toggle = () => setOpen((o) => !o);

  const hero = variant === "hero";

  return (
    <div
      className={
        hero
          ? "relative flex flex-col md:flex-row md:flex-[2]"
          : "relative"
      }
    >
      {hero ? (
        <>
          <HeroCell
            label={moveInLabel}
            value={fmt(moveIn)}
            active={open}
            onClick={toggle}
            className="border-b border-line md:border-b-0 md:border-r"
          />
          <HeroCell
            label={moveOutLabel}
            value={fmt(moveOut)}
            active={open}
            onClick={toggle}
            className="border-b border-line md:border-b-0 md:border-r"
          />
        </>
      ) : (
        <div className="grid grid-cols-2 overflow-hidden rounded-(--radius-control) border border-line bg-surface">
          <Cell
            label={moveInLabel}
            value={fmt(moveIn)}
            active={open}
            onClick={toggle}
            className="border-r border-line"
          />
          <Cell
            label={moveOutLabel}
            value={fmt(moveOut)}
            active={open}
            onClick={toggle}
          />
        </div>
      )}

      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          {/* Hero: centre the popover on the field so the gap between the two
              calendars sits over the divider between the two cells. Boxed: the
              control is narrow, so anchor left to keep the wide popover onscreen. */}
          <div
            className={`absolute z-50 mt-2 w-max max-w-[calc(100vw-2rem)] overflow-x-auto rounded-(--radius-card) border border-line bg-surface p-3 shadow-(--shadow-pop) ${
              hero
                ? "left-1/2 -translate-x-1/2"
                : align === "end"
                  ? "right-0"
                  : "left-0"
            }`}
          >
            <div
              className={`dp-split flex flex-col gap-4 sm:flex-row ${
                moveIn && moveOut ? "dp-has-range" : ""
              }`}
            >
              <div>
                <p className="mb-1 px-1 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-body">
                  {moveInLabel}
                </p>
                <DayPicker
                  locale={dpLocale}
                  captionLayout="dropdown"
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
                  {moveOutLabel}
                </p>
                <DayPicker
                  locale={dpLocale}
                  captionLayout="dropdown"
                  startMonth={navStart}
                  endMonth={navEnd}
                  month={rightMonth}
                  onMonthChange={setRightMonth}
                  disabled={rightDisabled}
                  onDayClick={(day, mods) => {
                    if (!mods.disabled) pickRight(day);
                  }}
                  modifiers={rangeMods}
                  modifiersClassNames={rangeClasses}
                  numberOfMonths={1}
                />
                {!moveIn && (
                  <p className="mt-1 px-1 text-xs text-muted">
                    {t("pickMoveInFirst")}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <p className="mt-2 rounded-(--radius-control) bg-warn-soft px-3 py-2 text-xs text-warn">
                {t(error)}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  active,
  onClick,
  className = "",
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors duration-(--dur-standard) hover:bg-surface-2 ${
        active ? "bg-surface-2" : ""
      } ${className}`}
    >
      <CalendarDays
        size={16}
        strokeWidth={2}
        className="shrink-0 text-muted"
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-muted">
          {label}
        </span>
        <span className="data block truncate text-sm font-semibold text-ink">
          {value}
        </span>
      </span>
    </button>
  );
}

// Search-bar cell — matches the hero's City / Bedrooms cells (label over value,
// sans, no leading icon) so the four fields read as one seamless bar.
function HeroCell({
  label,
  value,
  active,
  onClick,
  className = "",
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col gap-1 px-4 py-2.5 text-left transition-colors duration-(--dur-standard) ${
        active ? "bg-surface-2" : "hover:bg-surface-2/60"
      } ${className}`}
    >
      <span className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-body">
        {label}
      </span>
      <span className="truncate text-[0.9375rem] font-semibold text-ink">
        {value}
      </span>
    </button>
  );
}

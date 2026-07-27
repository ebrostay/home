"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { useLocale, useTranslations } from "next-intl";
import {
  SplitRangeCalendars,
  addMonths,
  rangeError,
  startOfMonth,
  startOfToday,
  type SplitRange,
} from "./SplitRangeCalendars";

// ============================================================
// The guest-facing date field: two trigger cells that open the split
// calendars in a popover. Selection does NOT close the popover (only an
// outside click does), so a visitor can adjust both ends without reopening.
//
// The calendars themselves live in SplitRangeCalendars — shared with the
// owner's availability editor, which renders them inline and without these
// constraints. What stays HERE is everything specific to a tenant booking a
// stay: the legal 31-day floor, the under-a-year ceiling, no dates in the
// past, and the move-in / move-out vocabulary.
//
// The 31-day floor matches the Spanish-law minimum in lib/pricing.ts
// (MIN_STAY_DAYS) — a "temporary" stay is no shorter than 31 days.
// ============================================================

const MIN_STAY_DAYS = 31; // move-out ≥ move-in + 31
const MAX_OFFSET_DAYS = 363; // move-out ≤ move-in + 363 (inclusive span < 365)

export type { SplitRange };

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
  // Days already taken on this listing: struck out and not selectable. NOTE
  // this only stops you LANDING on a booked day — with two independent
  // calendars nothing prevents a span that steps over a booked block, so the
  // caller must still check the whole range (the booking panel does, via
  // stayFits).
  booked?: Matcher[];
  // A ceiling tighter than the legal one — the listing's own max stay. The
  // caller computes the date because months are not a fixed number of days.
  maxMoveOut?: Date;
}) {
  const locale = useLocale();
  const t = useTranslations("search.datePicker");
  const { moveIn, moveOut } = value;

  const [open, setOpen] = useState(false);

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

  const error = rangeError(value, MIN_STAY_DAYS, MAX_OFFSET_DAYS);
  const toggle = () => setOpen((o) => !o);
  const hero = variant === "hero";

  return (
    <div className={hero ? "relative flex flex-col md:flex-row md:flex-[2]" : "relative"}>
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
            <SplitRangeCalendars
              value={value}
              onChange={onChange}
              startLabel={moveInLabel}
              endLabel={moveOutLabel}
              booked={booked}
              minDays={MIN_STAY_DAYS}
              maxDays={MAX_OFFSET_DAYS}
              maxEnd={maxMoveOut}
              minDate={startOfToday()}
              navStart={navStart}
              navEnd={navEnd}
              captionLayout="dropdown"
              pickStartHint={t("pickMoveInFirst")}
            />

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

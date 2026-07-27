"use client";

import { DayPicker, type Matcher } from "react-day-picker";
import { es, enGB } from "react-day-picker/locale";
import { useLocale } from "next-intl";
import "react-day-picker/style.css";

// A calendar you read, not one you fill in. No selection, no range, no
// onSelect — its whole job is showing which days of which months are taken,
// and letting you walk through months to find out.
//
// The month is CONTROLLED so the caller knows what is on screen. That is what
// lets the twelve-month band above it highlight the pair being viewed: the
// band becomes a map of where you are, instead of two controls showing the
// same year and never referring to each other.
//
// Days stay focusable rather than disabled wholesale. Marking every day
// disabled to enforce read-only would grey the calendar out and destroy the
// one thing it exists to show; a click that does nothing is the cheaper price.

export function AvailabilityCalendar({
  month,
  onMonthChange,
  booked = [],
  navStart,
  navEnd,
  numberOfMonths = 2,
  label,
}: {
  month: Date;
  onMonthChange: (month: Date) => void;
  /** Days already taken — solid, and not presented as available. */
  booked?: Matcher[];
  navStart?: Date;
  navEnd?: Date;
  numberOfMonths?: number;
  /** Names the calendar for assistive tech; it carries no visible heading. */
  label: string;
}) {
  const locale = useLocale();

  return (
    <div role="group" aria-label={label}>
      <DayPicker
        locale={locale === "es" ? es : enGB}
        captionLayout="dropdown"
        month={month}
        onMonthChange={onMonthChange}
        startMonth={navStart}
        endMonth={navEnd}
        numberOfMonths={numberOfMonths}
        disabled={booked}
        modifiers={{ booked }}
        modifiersClassNames={{ booked: "day-booked" }}
      />
    </div>
  );
}

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
// `mode="single"` with a permanently empty selection is doing real work, and
// dropping it breaks the calendar silently. Without a mode, react-day-picker
// renders each day as bare text in a cell — no `.rdp-day_button` — and every
// themed rule in globals.css (booked days, today, hover, disabled) targets
// that button. The result looks like a working calendar with no bookings on
// it, which is the worst way to be wrong. Selection stays impossible because
// `selected` is fixed at undefined and onSelect does nothing.

// Controlled at undefined: a click can never land anywhere.
const NO_SELECTION = () => {};

export function AvailabilityCalendar({
  month,
  onMonthChange,
  booked = [],
  turnaround = [],
  navStart,
  navEnd,
  numberOfMonths = 2,
  label,
}: {
  month: Date;
  onMonthChange: (month: Date) => void;
  /** Days already taken — solid, and not presented as available. */
  booked?: Matcher[];
  /** Days shut for the turnaround after a stay (ADR-026). Unavailable like a
   *  booking, but drawn differently: an owner looking at a full month needs to
   *  know which days are earning and which are the cost of the ones that did. */
  turnaround?: Matcher[];
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
        mode="single"
        selected={undefined}
        onSelect={NO_SELECTION}
        locale={locale === "es" ? es : enGB}
        captionLayout="dropdown"
        month={month}
        onMonthChange={onMonthChange}
        startMonth={navStart}
        endMonth={navEnd}
        numberOfMonths={numberOfMonths}
        disabled={[...turnaround, ...booked]}
        modifiers={{ turnaround, booked }}
        // `booked` last: a day that is both — two stays back to back — is a
        // booking first, and the CSS lets the later rule win.
        modifiersClassNames={{ turnaround: "day-turnaround", booked: "day-booked" }}
      />
    </div>
  );
}

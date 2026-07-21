"use client";

import { DayPicker, type DateRange, type Matcher } from "react-day-picker";
import { es, enGB } from "react-day-picker/locale";
import { useLocale } from "next-intl";
import "react-day-picker/style.css";

export type { DateRange };

// Inline range calendar (react-day-picker v10) themed via .rdp-root overrides
// in globals.css. Booked spans are passed both as `disabled` (not selectable)
// and as the `booked` modifier (solid occupied styling). Chosen over v1's
// flatpickr, which needed hand-patched Safari/dark-mode/month-dropdown CSS.
export function DateRangePicker({
  value,
  onChange,
  booked = [],
  numberOfMonths = 2,
  startMonth,
}: {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
  booked?: Matcher[];
  numberOfMonths?: number;
  startMonth?: Date;
}) {
  const locale = useLocale();

  return (
    <DayPicker
      mode="range"
      selected={value}
      onSelect={onChange}
      numberOfMonths={numberOfMonths}
      startMonth={startMonth}
      disabled={booked}
      modifiers={{ booked }}
      modifiersClassNames={{ booked: "day-booked" }}
      locale={locale === "es" ? es : enGB}
      excludeDisabled
    />
  );
}

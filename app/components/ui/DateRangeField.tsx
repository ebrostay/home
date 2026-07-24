"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { useLocale } from "next-intl";
import { DateRangePicker, type DateRange } from "./DateRangePicker";
import type { Matcher } from "react-day-picker";

// A compact two-cell trigger (Move in / Move out) that opens the themed
// DateRangePicker in a popover — the replacement candidate for a pair of
// native <input type="date"> fields. One control, one calendar, booked days
// struck out, no browser-native date UI to fight.
export function DateRangeField({
  value,
  onChange,
  moveInLabel,
  moveOutLabel,
  placeholder = "—",
  booked = [],
  numberOfMonths = 2,
  startMonth,
}: {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
  moveInLabel: string;
  moveOutLabel: string;
  placeholder?: string;
  booked?: Matcher[];
  numberOfMonths?: number;
  startMonth?: Date;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const fmt = (d: Date | undefined) =>
    d
      ? new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(d)
      : placeholder;

  return (
    <div className="relative">
      <div className="grid grid-cols-2 overflow-hidden rounded-(--radius-control) border border-line bg-surface">
        <Cell
          label={moveInLabel}
          value={fmt(value?.from)}
          active={open}
          onClick={() => setOpen((o) => !o)}
          className="border-r border-line"
        />
        <Cell
          label={moveOutLabel}
          value={fmt(value?.to)}
          active={open}
          onClick={() => setOpen((o) => !o)}
        />
      </div>

      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 z-50 mt-2 overflow-x-auto rounded-(--radius-card) border border-line bg-surface p-3 shadow-(--shadow-pop)">
            <DateRangePicker
              value={value}
              onChange={(range) => {
                onChange?.(range);
                // Close once a whole range is chosen; keep open after the first
                // click so the user can pick the end date.
                if (range?.from && range?.to) setOpen(false);
              }}
              booked={booked}
              numberOfMonths={numberOfMonths}
              startMonth={startMonth}
            />
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
      <CalendarDays size={16} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
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

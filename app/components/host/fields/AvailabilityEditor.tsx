"use client";

import { useState } from "react";
import { CalendarPlus, Lock, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortMonths } from "@/i18n/dates";
import { shortDate, type ShortMonths } from "@/lib/dates";
import type { HostRange, PublicRange } from "@/lib/api";
import { addDays, rangesOverlap, stayDays } from "@/lib/pricing";
import { monthStates, turnaroundRanges, withTurnover } from "@/lib/availability";
import { BAND_MONTHS, LIMITS, isoDay } from "@/lib/manage";
import { AvailabilityBand } from "@/components/MonthBand";
import { AvailabilityCalendar } from "@/components/ui/AvailabilityCalendar";
import { SplitDateRangeField } from "@/components/ui/SplitDateRangeField";
import {
  addMonths as addMonthsTo,
  startOfMonth,
  type SplitRange,
} from "@/components/ui/SplitRangeCalendars";
import { Button } from "@/components/ui/Button";

// The owner's calendar, in two halves that answer two different questions.
//
// The BAND answers "how does my next year look" at a glance — the same
// twelve-month control the portfolio rows and the public listing card use, so
// the owner is reading the same summary a visitor reads. It is a summary and
// stays read-only: its three states are derived (a month is "part-booked"
// because a range clips it), and clicking a summary cell to mean a date range
// is what the prototype's strip did and why it could not represent a stay that
// runs from the 12th to the 9th.
//
// Under it the CALENDAR, read-only, two months at a time with month
// dropdowns — the day-level truth the band summarises, and the way to walk
// through the year. The band highlights the pair the calendar is showing, so
// the two are one control in two resolutions rather than two pictures of the
// same year that never refer to each other.
//
// Then the CLOSED-DATES list: the ranges themselves, as dates. Band, calendar
// and list together answer "what is this home doing" — one read-only block,
// with no controls in the middle of it.
//
// Closing dates is then a separate one-line action at the foot of the section,
// using the SAME field as the search bar: two cells that open the split
// calendars in a popover. An owner is also a visitor, and a second full-size
// calendar embedded in a page that already shows a twelve-month band was two
// pictures of the same year.
//
// None of the guest constraints come with the field. A tenant's stay is
// legally 31–364 days and cannot start in the past; an owner closing their own
// flat for a weekend answers to nobody. The one thing that must be re-checked
// here is overlap: two independent calendars stop you landing on a closed day
// but not spanning one, so a crossing selection is caught below rather than
// bounced by the API.
//
// Controlled: blocks in, blocks out. The wizard composes this with an empty
// list and gets a working calendar for a home that does not exist yet.

export function AvailabilityEditor({
  blocks,
  holds = [],
  availableFrom,
  turnoverDays,
  onChange,
  locale,
  now,
}: {
  blocks: HostRange[];
  /** Booking-flow holds. Shown, never editable — releasing one is the booking
   *  flow's job, and the API preserves them across a save regardless. */
  holds?: HostRange[];
  availableFrom: string | null;
  /** Days shut after each stay (ADR-026). Live from the pricing form, so
   *  changing it moves the calendar before anything is saved. */
  turnoverDays: number;
  onChange: (blocks: HostRange[]) => void;
  locale: string;
  now: Date;
}) {
  const t = useTranslations("host.manage.availability");
  const months = useShortMonths();
  const [range, setRange] = useState<SplitRange>({});
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  // Which pair the read-only calendar is showing. Lazy init: `now` is captured
  // with the page's data so the prerendered HTML has no clock in it.
  const [browse, setBrowse] = useState(() => startOfMonth(now));

  const all = [...blocks, ...holds];
  // What a guest would be shown: the blocks with their turnaround folded in.
  // The band and the occupancy figure read THIS, so the owner's summary can
  // never claim a month is freer than the search page will sell it as.
  const sellable = withTurnover(all, turnoverDays);
  const turnaround = turnaroundRanges(all, turnoverDays);
  const open = monthStates(sellable, availableFrom, locale, now, BAND_MONTHS).filter(
    (m) => m.state === "open",
  ).length;

  // `end` is exclusive but a calendar selection is inclusive of its last day,
  // so every conversion in this component goes through these two lines.
  const toMatcher = (r: PublicRange) => ({
    from: day(r.start),
    to: day(addDays(r.end, -1)),
  });
  // Half-open on the way in, like everything else in the system: the owner
  // picks the LAST closed day, storage wants the first free one.
  const selection =
    range.moveIn && range.moveOut
      ? {
          start: isoDay(range.moveIn),
          end: addDays(isoDay(range.moveOut), 1),
        }
      : null;

  // Two independent calendars can straddle a block neither of them let you
  // land on. Catching it here beats a round trip that comes back
  // `blocks_overlap` with the selection already gone.
  // Checked against the RAW blocks, not the buffered ones: an owner closing
  // the days right after a stay is closing days that are already shut, which is
  // harmless and occasionally deliberate. Only a real double-booking is an error.
  const conflict =
    !!selection &&
    all.some((r) =>
      rangesOverlap(selection.start, selection.end, r.start, r.end),
    );

  // The band is the summary of the same twelve months the ledger reads, with
  // the calendar's current pair marked on it. Every month carries the flag,
  // not just the two — that is what tells the band it has a calendar to track.
  const shown = MONTHS_SHOWN.map((offset) => addMonthsTo(browse, offset));
  const band = monthStates(sellable, availableFrom, locale, now, BAND_MONTHS).map(
    (m, i) => {
      const month = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return { ...m, inView: shown.some((s) => sameMonth(s, month)) };
    },
  );

  const full = blocks.length >= LIMITS.maxBlocks;

  const add = () => {
    if (!selection || full || conflict) return;
    onChange(
      [
        ...blocks,
        {
          ...selection,
          status: "confirmed",
          note: note.trim() || null,
          turnoverDaysOverride: null,
          // The server stamps this on save (a new span through the owner's
          // endpoint is own use by definition, ADR-031); set here too so the
          // band and calendar draw the block WITHOUT a turnaround hatch in
          // the seconds before the save — the same reason turnoverOf runs on
          // this side at all.
          kind: "own_use",
        },
      ].sort((a, b) => a.start.localeCompare(b.start)),
    );
    setRange({});
    setNote("");
  };

  const remove = (target: HostRange) => {
    onChange(blocks.filter((b) => b !== target));
    setConfirming(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[0.84375rem] leading-[1.5] text-body">
            {t("bandIntro")}
          </p>
          <span className="data shrink-0 text-[0.65625rem] tracking-[0.08em] text-brand-strong">
            {t("monthsOpen", { count: open })}
          </span>
        </div>
        <AvailabilityBand months={band} />
        <Legend />
      </div>

      {/* Read-only: the day-level truth behind the band, and the way to walk
          through the year. Closing dates happens at the foot of the section. */}
      <AvailabilityCalendar
        label={t("calendarLabel")}
        month={browse}
        onMonthChange={setBrowse}
        booked={all.map(toMatcher)}
        turnaround={turnaround.map(toMatcher)}
        navStart={addMonthsTo(startOfMonth(now), -12)}
        navEnd={addMonthsTo(startOfMonth(now), 24)}
      />
      <p className="-mt-3 text-xs text-muted">{t("browseHint")}</p>

      <div className="flex flex-col gap-2">
        <p className="data text-[0.65625rem] tracking-[0.1em] text-muted">
          {t("blocksLabel", { count: blocks.length + holds.length })}
        </p>

        {all.length === 0 ? (
          <p className="rounded-(--radius-control) border border-dashed border-line-strong px-4 py-6 text-center text-[0.8125rem] text-muted">
            {t("noBlocks")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {holds.map((h, i) => (
              <li
                key={`hold-${i}`}
                className="flex items-center gap-3 border-b border-line py-2.5"
              >
                <Lock
                  size={14}
                  strokeWidth={2}
                  className="shrink-0 text-muted"
                  aria-hidden
                />
                <span className="data min-w-0 flex-1 truncate text-[0.8125rem] text-muted">
                  {rangeLabel(h.start, h.end, locale, months)}
                </span>
                <span className="shrink-0 text-xs text-muted">{t("held")}</span>
              </li>
            ))}

            {blocks.map((b, i) => (
              <li
                key={`${b.start}-${b.end}-${i}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5"
              >
                <span className="data text-[0.8125rem] text-ink">
                  {rangeLabel(b.start, b.end, locale, months)}
                </span>
                <span className="data text-xs text-muted">
                  {t("days", { count: stayDays(b.start, b.end) })}
                </span>
                {b.note && (
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    {b.note}
                  </span>
                )}
                {/* Two-step, because there is no undo and no stay record:
                      a block may be the only trace of an accepted stay. */}
                {confirming === keyOf(b) ? (
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => remove(b)}
                      className="text-xs font-semibold text-danger underline"
                    >
                      {t("removeConfirm")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="text-xs text-muted underline"
                    >
                      {t("cancel")}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(keyOf(b))}
                    aria-label={t("remove", {
                      range: rangeLabel(b.start, b.end, locale, months),
                    })}
                    className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-(--radius-control) text-muted transition-colors duration-(--dur-standard) hover:bg-surface-2 hover:text-ink"
                  >
                    <X size={14} strokeWidth={2.2} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs leading-[1.45] text-muted">{t("blocksNote")}</p>
      </div>

      {/* Closing dates is one line, not a second calendar. The overview above
          answers "what is this home doing"; this answers "shut these days",
          and it borrows the search bar's field so the same two-calendar
          popover serves both — an owner is also a visitor. */}
      <div className="flex flex-col gap-2 rounded-(--radius-control) border border-line bg-surface-2 p-3">
        <p className="data text-[0.65625rem] tracking-[0.1em] text-muted">
          {t("pickLabel")}
        </p>

        {/* Said BEFORE the dates are picked, not discovered on the band after:
            dates the owner closes themselves get no turnaround (ADR-031), so
            if a stay starts right after them, nobody will have prepared the
            home but the owner. The icon carries the amber; --warn text cannot
            reach 4.5:1 on any light surface we have. */}
        <p className="flex items-start gap-2 text-xs leading-[1.45] text-body">
          <TriangleAlert
            size={14}
            strokeWidth={2}
            className="mt-0.5 shrink-0 text-warn"
            aria-hidden
          />
          {t("ownUseNote")}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[17rem] flex-1">
            <SplitDateRangeField
              value={range}
              onChange={setRange}
              moveInLabel={t("from")}
              moveOutLabel={t("to")}
              // Both, so a tenant-facing closure and its turnaround are equally
              // unpickable — the owner cannot open a window that is not there.
              booked={[...all, ...turnaround].map(toMatcher)}
              // An owner's own block has no floor, no ceiling and no rule
              // against the past — this records the home, it does not sell it.
              minDays={0}
              maxDays={undefined}
              allowPast
              captionLayout="label"
              pickStartHint={t("pickFromFirst")}
            />
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, LIMITS.maxNote))}
            placeholder={t("notePlaceholder")}
            aria-label={t("noteLabel")}
            className="h-[46px] min-w-[12rem] flex-1 rounded-(--radius-control) border border-line bg-surface px-3 text-[0.8125rem] text-ink outline-none transition-colors duration-(--dur-standard) placeholder:text-muted focus:border-brand"
          />

          <Button
            onClick={add}
            disabled={!selection || full || conflict}
            title={full ? t("full") : undefined}
            className="h-[46px] shrink-0 gap-2 text-[0.8125rem]"
          >
            <CalendarPlus size={15} strokeWidth={2} aria-hidden />
            {t("block")}
          </Button>
        </div>

        <p
          className={`text-[0.8125rem] ${conflict ? "text-warn" : "text-muted"}`}
        >
          {conflict
            ? t("conflict")
            : selection
              ? t("selected", {
                  range: rangeLabel(selection.start, selection.end, locale, months),
                  days: stayDays(selection.start, selection.end),
                })
              : t("selectPrompt")}
        </p>
      </div>
    </div>
  );
}

function Legend() {
  const t = useTranslations("host.manage.availability.legend");
  const items = [
    { key: "open", className: "bg-river" },
    { key: "partial", className: "" },
    { key: "booked", className: "bg-occupied" },
    { key: "turnaround", className: "" },
  ] as const;

  return (
    <ul className="flex flex-wrap gap-x-[18px] gap-y-1.5">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-2 text-xs text-body">
          <span
            aria-hidden
            className={`h-[9px] w-[15px] rounded-full ${i.className}`}
            style={
              i.key === "partial"
                ? {
                    background:
                      "linear-gradient(90deg, var(--occupied) 50%, var(--river) 50%)",
                  }
                : i.key === "turnaround"
                  ? {
                      // Same hatch as the calendar cell, so the swatch is the
                      // key to the thing rather than an approximation of it.
                      background:
                        "repeating-linear-gradient(45deg, transparent 0 3px, color-mix(in oklab, var(--occupied) 28%, transparent) 3px 6px) var(--surface-2)",
                    }
                  : undefined
            }
          />
          {t(i.key)}
        </li>
      ))}
    </ul>
  );
}

/** The calendar shows two months; the band marks both. */
const MONTHS_SHOWN = [0, 1];

// Compared as real dates rather than month numbers: browse + 1 from December
// is month 12 of the same year, which matches nothing.
const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const keyOf = (r: HostRange) => `${r.start}|${r.end}`;

const day = (iso: string) => new Date(`${iso}T12:00:00`);

/** Inclusive on both ends for the reader — nobody reads "to 1 Oct" as
 *  "through 30 Sep", however the range is stored. */
function rangeLabel(
  start: string,
  end: string,
  locale: string,
  months: ShortMonths,
): string {
  const fmt = (d: Date) => shortDate(d, months, { locale, day: true, year: true });
  return `${fmt(day(start))} – ${fmt(day(addDays(end, -1)))}`;
}

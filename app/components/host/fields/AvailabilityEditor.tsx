"use client";

import { useState } from "react";
import { CalendarPlus, Lock, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HostRange } from "@/lib/api";
import { addDays, rangesOverlap, stayDays } from "@/lib/pricing";
import { monthStates } from "@/lib/availability";
import { BAND_MONTHS, LIMITS, isoDay } from "@/lib/manage";
import { AvailabilityBand } from "@/components/MonthBand";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
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
// The CALENDAR answers "which days". Days are what the model stores (§2.2.3:
// half-open ranges, `end` exclusive) and what a stay actually occupies.
//
// Controlled: blocks in, blocks out. The wizard composes this with an empty
// list and gets a working calendar for a home that does not exist yet.

export function AvailabilityEditor({
  blocks,
  holds = [],
  availableFrom,
  onChange,
  locale,
  now,
}: {
  blocks: HostRange[];
  /** Booking-flow holds. Shown, never editable — releasing one is the booking
   *  flow's job, and the API preserves them across a save regardless. */
  holds?: HostRange[];
  availableFrom: string | null;
  onChange: (blocks: HostRange[]) => void;
  locale: string;
  now: Date;
}) {
  const t = useTranslations("host.manage.availability");
  const [range, setRange] = useState<DateRange | undefined>();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const all = [...blocks, ...holds];
  const open = monthStates(all, availableFrom, locale, now, BAND_MONTHS).filter(
    (m) => m.state === "open",
  ).length;

  // `end` is exclusive but a calendar selection is inclusive of its last day,
  // so every conversion in this component goes through these two lines.
  const toMatcher = (r: HostRange) => ({
    from: day(r.start),
    to: day(addDays(r.end, -1)),
  });
  // Half-open, like everything else in the system. `to` falls back to `from`
  // so the band lights up on the first click rather than waiting for the
  // second — mid-selection is exactly when the feedback is worth something.
  const preview = range?.from
    ? { start: isoDay(range.from), end: addDays(isoDay(range.to ?? range.from), 1) }
    : null;
  const selection = range?.from && range.to ? preview : null;

  // The band is the summary of the same twelve months the ledger reads, with
  // the pending selection painted on top. Marking every month rather than only
  // the chosen ones is what tells the band it is in a selectable context.
  const band = monthStates(all, availableFrom, locale, now, BAND_MONTHS).map((m, i) =>
    preview
      ? {
          ...m,
          selected: rangesOverlap(
            isoDay(new Date(now.getFullYear(), now.getMonth() + i, 1)),
            isoDay(new Date(now.getFullYear(), now.getMonth() + i + 1, 1)),
            preview.start,
            preview.end,
          ),
        }
      : m,
  );

  const full = blocks.length >= LIMITS.maxBlocks;

  const add = () => {
    if (!selection || full) return;
    onChange(
      [...blocks, { ...selection, status: "confirmed", note: note.trim() || null }].sort(
        (a, b) => a.start.localeCompare(b.start),
      ),
    );
    setRange(undefined);
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
          <p className="text-[0.84375rem] leading-[1.5] text-body">{t("bandIntro")}</p>
          <span className="data shrink-0 text-[0.65625rem] tracking-[0.08em] text-brand-strong">
            {t("monthsOpen", { count: open })}
          </span>
        </div>
        <AvailabilityBand months={band} />
        <Legend />
      </div>

      <div className="grid gap-5 min-[62rem]:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <p className="data text-[0.65625rem] tracking-[0.1em] text-muted">
            {t("pickLabel")}
          </p>
          <DateRangePicker
            value={range}
            onChange={setRange}
            booked={all.map(toMatcher)}
          />

          <div className="flex flex-col gap-2 rounded-(--radius-control) border border-line bg-surface-2 p-3">
            <p className="text-[0.8125rem] text-body">
              {selection
                ? t("selected", {
                    range: rangeLabel(selection.start, selection.end, locale),
                    days: stayDays(selection.start, selection.end),
                  })
                : t("selectPrompt")}
            </p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, LIMITS.maxNote))}
              placeholder={t("notePlaceholder")}
              aria-label={t("noteLabel")}
              className="h-9 rounded-(--radius-control) border border-line-strong bg-surface px-3 text-[0.8125rem] text-ink outline-none transition-colors duration-(--dur-standard) placeholder:text-muted focus:border-brand"
            />
            <Button
              onClick={add}
              disabled={!selection || full}
              title={full ? t("full") : undefined}
              className="h-[38px] self-start gap-2 text-[0.8125rem]"
            >
              <CalendarPlus size={15} strokeWidth={2} aria-hidden />
              {t("block")}
            </Button>
          </div>
        </div>

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
                  <Lock size={14} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
                  <span className="data min-w-0 flex-1 truncate text-[0.8125rem] text-muted">
                    {rangeLabel(h.start, h.end, locale)}
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
                    {rangeLabel(b.start, b.end, locale)}
                  </span>
                  <span className="data text-xs text-muted">
                    {t("nights", { count: stayDays(b.start, b.end) })}
                  </span>
                  {b.note && (
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">{b.note}</span>
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
                        range: rangeLabel(b.start, b.end, locale),
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
                : undefined
            }
          />
          {t(i.key)}
        </li>
      ))}
    </ul>
  );
}

const keyOf = (r: HostRange) => `${r.start}|${r.end}`;

const day = (iso: string) => new Date(`${iso}T12:00:00`);

/** Inclusive on both ends for the reader — nobody reads "to 1 Oct" as
 *  "through 30 Sep", however the range is stored. */
function rangeLabel(start: string, end: string, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${fmt.format(day(start))} – ${fmt.format(day(addDays(end, -1)))}`;
}

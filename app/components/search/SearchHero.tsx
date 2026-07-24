"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { addMonths } from "@/lib/pricing";
import { Select } from "@/components/ui/Select";
import { SplitDateRangeField } from "@/components/ui/SplitDateRangeField";

// ============================================================
// The hero states the offer and takes the only two inputs that
// actually narrow a mid-term search: when you arrive and when you
// leave. Stay length is DERIVED from those dates and shown back as
// a read-out (see the date chip in the filter bar) — it is never
// the primary input, because a relocation is planned against a
// calendar, not a slider.
// ============================================================

export type SearchQuery = {
  moveIn: string; // YYYY-MM-DD
  moveOut: string; // YYYY-MM-DD
  bedrooms: number; // 0 = any
};

export const BEDROOM_OPTIONS = [0, 1, 2, 3, 4] as const;

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function defaultQuery(): SearchQuery {
  const moveIn = todayIso();
  return { moveIn, moveOut: addMonths(moveIn, 3), bedrooms: 0 };
}

// The search bar carries dates as ISO strings; the calendar control speaks
// Date. Parse as LOCAL midnight so a "2026-09-01" never slips a day via UTC.
function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToIso(d?: Date): string {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SearchHero({
  query,
  onChange,
  onSearch,
}: {
  query: SearchQuery;
  onChange: (q: SearchQuery) => void;
  onSearch: () => void;
}) {
  const t = useTranslations("search.hero");

  return (
    <section className="relative mx-auto max-w-7xl">
      <div className="relative h-[320px] overflow-hidden md:h-[420px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized */}
        <img
          src="/brand/zaragoza-hero.webp"
          alt=""
          className="h-full w-full object-cover"
        />
        {/* Angled, not vertical: the weight sits behind the text on the left
            and releases over the balcony on the right. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, rgba(21,37,31,.78) 0%, rgba(21,37,31,.55) 38%, rgba(21,37,31,.18) 70%, rgba(21,37,31,.05) 100%)",
          }}
        />
        <div className="absolute inset-x-6 bottom-16 text-white md:inset-x-12 md:bottom-[136px]">
          <h1 className="max-w-[18ch] font-display text-[2rem] font-bold leading-[1.05] text-white md:text-[3.25rem] md:leading-[1.02]">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-[46ch] text-base leading-snug text-white/90 md:text-[1.0625rem]">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
        /* z-30 so the date popover clears the sticky filter bar (z-20) below. */
        className="relative z-30 -mt-6 mx-4 flex flex-col rounded-(--radius-card) bg-surface p-2.5 shadow-(--shadow-pop) md:absolute md:inset-x-12 md:bottom-[34px] md:mx-0 md:mt-0 md:flex-row md:items-stretch"
      >
        {/* Zaragoza is the whole market today, so the menu holds one option —
            but it reads as a real control, ready for more cities later. The
            label lives inside the trigger so the whole cell opens the menu,
            matching the date fields. */}
        <Select
          bare
          label={t("city")}
          aria-label={t("city")}
          value="zaragoza"
          onChange={() => {}}
          options={[{ value: "zaragoza", label: "Zaragoza" }]}
          className="border-b border-line md:flex-[1.4] md:border-b-0 md:border-r"
        />

        <SplitDateRangeField
          variant="hero"
          moveInLabel={t("moveIn")}
          moveOutLabel={t("moveOut")}
          value={{
            moveIn: isoToDate(query.moveIn),
            moveOut: isoToDate(query.moveOut),
          }}
          onChange={(next) =>
            onChange({
              ...query,
              moveIn: dateToIso(next.moveIn),
              moveOut: dateToIso(next.moveOut),
            })
          }
        />

        <Select
          bare
          label={t("bedrooms")}
          aria-label={t("bedrooms")}
          value={String(query.bedrooms)}
          onChange={(v) => onChange({ ...query, bedrooms: Number(v) })}
          options={BEDROOM_OPTIONS.map((n) => ({
            value: String(n),
            label: n === 0 ? t("bedroomsAny") : t("bedroomsPlus", { count: n }),
          }))}
          className="border-b border-line md:flex-[0.8] md:border-b-0 md:border-r"
        />

        <button
          type="submit"
          className="mt-2.5 flex items-center justify-center gap-2.5 rounded-(--radius-control) bg-brand px-6 py-3 text-[0.9375rem] font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong md:mt-0 md:ml-2 md:py-0"
        >
          <Search size={17} strokeWidth={2.2} aria-hidden />
          {t("search")}
        </button>
      </form>
    </section>
  );
}

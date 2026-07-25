"use client";

import { useEffect, useRef, useState } from "react";
import { Car, SlidersHorizontal, Wifi, Wind, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatEuro } from "@/lib/pricing";
import { Chip } from "./Chip";
import type { SearchQuery } from "./SearchHero";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { BudgetBand } from "./BudgetBand";

export const AMENITY_FILTERS = [
  "wifi",
  "desk",
  "lift",
  "ac",
  "washer",
  "parking",
] as const;

// The handful of amenities common enough to earn a permanent one-tap toggle on
// the bar itself. They are NOT repeated as removable chips (their toggle already
// shows the active state); everything else lives behind "More filters".
const QUICK_AMENITIES: { key: string; Icon: LucideIcon }[] = [
  { key: "wifi", Icon: Wifi },
  { key: "ac", Icon: Wind },
  { key: "parking", Icon: Car },
];
const QUICK_KEYS = QUICK_AMENITIES.map((a) => a.key);

export type Filters = {
  type: string; // "all" | apartment | room | home
  budget: string; // "" = no limit
  amenities: string[];
  sort: string; // best | price | new
};

export const defaultFilters: Filters = {
  type: "all",
  budget: "",
  amenities: [],
  // Was "best" (by rating). With no ratings in the data that comparator fell
  // through to its price tiebreak anyway, so price-ascending is the same order
  // the list has actually been showing.
  sort: "price",
};

// The bar shows what is ACTUALLY narrowing the results, one removable chip
// each, and parks the full control set behind "More filters". An empty bar
// therefore means an unfiltered list — you never have to read the controls to
// know that.
export function FilterBar({
  filters,
  onFiltersChange,
  applied,
  onClearStay,
  prices,
  resultCount,
  loading,
  formatRange,
}: {
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  applied: SearchQuery | null;
  onClearStay: () => void;
  prices: number[]; // every home the other filters allow — see BudgetBand
  resultCount: number;
  loading: boolean;
  formatRange: (q: SearchQuery) => string;
}) {
  const t = useTranslations();
  const tf = useTranslations("search.filters");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  // The bar is sticky and stacks under the header; the map column sizes to
  // (viewport − header − bar). The bar's height isn't fixed — the chip row
  // wraps as filters are added — so publish the live height as --filter-h for
  // that calc to read. Written to :root so any sticky element can consume it.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--filter-h",
        `${el.offsetHeight}px`,
      );
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      // Hand the token back to its CSS fallback when the bar unmounts, so other
      // pages don't inherit a stale search-page height.
      document.documentElement.style.removeProperty("--filter-h");
    };
  }, []);

  // Counts only what "More filters" hides — the quick amenities have their own
  // visible toggles, so they must not inflate the badge.
  const activeCount =
    (filters.type === "all" ? 0 : 1) +
    (filters.budget ? 1 : 0) +
    filters.amenities.filter((a) => !QUICK_KEYS.includes(a)).length;

  const set = (patch: Partial<Filters>) =>
    onFiltersChange({ ...filters, ...patch });

  const toggleAmenity = (a: string) =>
    set({
      amenities: filters.amenities.includes(a)
        ? filters.amenities.filter((x) => x !== a)
        : [...filters.amenities, a],
    });

  return (
    <div
      ref={barRef}
      className="sticky top-(--header-h) z-20 border-b border-line bg-surface"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2.5 px-4 py-4 sm:px-6">
        {applied && (
          <Chip active onClear={onClearStay} clearLabel={tf("clearDates")}>
            <span className="data">{formatRange(applied)}</span>
          </Chip>
        )}
        {applied && applied.bedrooms > 0 && (
          <Chip>
            {tf("bedroomsChip", { count: applied.bedrooms })}
          </Chip>
        )}
        {filters.type !== "all" && (
          <Chip
            active
            onClear={() => set({ type: "all" })}
            clearLabel={tf("clearType")}
          >
            {t(`type.${filters.type}`)}
          </Chip>
        )}
        {filters.budget && (
          <Chip
            active
            onClear={() => set({ budget: "" })}
            clearLabel={tf("clearBudget")}
          >
            {tf("budgetChip", {
              amount: formatEuro(Number(filters.budget), locale),
            })}
          </Chip>
        )}
        {/* Amenities chosen in "More filters" show as removable chips — except
            the quick ones, which are represented by their permanent toggles. */}
        {filters.amenities
          .filter((a) => !QUICK_KEYS.includes(a))
          .map((a) => (
            <Chip
              key={a}
              active
              onClear={() =>
                set({ amenities: filters.amenities.filter((x) => x !== a) })
              }
              clearLabel={tf("clearAmenity", { name: t(`amenity.${a}`) })}
            >
              {t(`amenity.${a}`)}
            </Chip>
          ))}

        <Chip onClick={() => setOpen(true)}>
          <SlidersHorizontal size={14} strokeWidth={2} aria-hidden />
          {tf("more")}
          {activeCount > 0 && (
            <span className="data rounded-full bg-brand px-1.5 text-[0.625rem] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </Chip>

        {/* Always-present one-tap toggles for the most common amenities. */}
        {QUICK_AMENITIES.map(({ key, Icon }) => (
          <Chip
            key={key}
            active={filters.amenities.includes(key)}
            onClick={() => toggleAmenity(key)}
          >
            <Icon size={14} strokeWidth={2} aria-hidden />
            {t(`amenity.${key}`)}
          </Chip>
        ))}

        <p role="status" className="ml-auto text-[0.8125rem] text-muted">
          {loading ? (
            tf("loading")
          ) : (
            <>
              <b className="data font-semibold text-ink">{resultCount}</b>{" "}
              {tf("homesInCity", { count: resultCount })}
            </>
          )}
        </p>

        {/* Wide enough for the longest label ("Orden: Precio: menor a mayor")
            on one line; nowrap on the trigger so a future label overflows
            visibly rather than silently wrapping the control taller. */}
        <div className="w-64">
          <Select
            className="whitespace-nowrap"
            value={filters.sort}
            onChange={(v) => set({ sort: v })}
            options={["price", "new"].map((v) => ({
              value: v,
              label: tf("sortAs", { value: t(`sort.${v}`) }),
            }))}
          />
        </div>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={tf("more")}>
        <div className="flex flex-col gap-5">
          <Field label={t("filters.type")}>
            {(id) => (
              <Select
                id={id}
                value={filters.type}
                onChange={(v) => set({ type: v })}
                options={["all", "apartment", "room", "home"].map((v) => ({
                  value: v,
                  label: t(`type.${v}`),
                }))}
              />
            )}
          </Field>

          {/* The ceiling is set against the distribution of the homes the
              other filters already allow — "1.200 €" means nothing until you
              can see how much of the market sits under it. */}
          <BudgetBand
            prices={prices}
            value={filters.budget ? Number(filters.budget) : null}
            onChange={(v) => set({ budget: v === null ? "" : String(v) })}
          />

          <fieldset>
            <legend className="text-xs font-semibold tracking-wide text-ink">
              {t("filters.amenities")}
            </legend>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {AMENITY_FILTERS.map((a) => {
                const on = filters.amenities.includes(a);
                return (
                  <label
                    key={a}
                    className={`data cursor-pointer rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide transition-colors duration-(--dur-standard) ${
                      on
                        ? "border-brand bg-brand-soft text-brand-strong"
                        : "border-line text-muted hover:border-line-strong"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={(e) =>
                        set({
                          amenities: e.target.checked
                            ? [...filters.amenities, a]
                            : filters.amenities.filter((x) => x !== a),
                        })
                      }
                    />
                    {t(`amenity.${a}`)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex justify-between gap-3 border-t border-line pt-4">
            <Button
              variant="ghost"
              onClick={() => onFiltersChange({ ...defaultFilters, sort: filters.sort })}
            >
              {tf("reset")}
            </Button>
            <Button onClick={() => setOpen(false)}>{tf("apply")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

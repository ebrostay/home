"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatEuro } from "@/lib/pricing";
import { Chip } from "./Chip";
import type { SearchQuery } from "./SearchHero";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";

export const AMENITY_FILTERS = [
  "wifi",
  "desk",
  "lift",
  "ac",
  "washer",
  "parking",
] as const;

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
  sort: "best",
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
  resultCount,
  loading,
  formatRange,
}: {
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  applied: SearchQuery | null;
  onClearStay: () => void;
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

  const activeCount =
    (filters.type === "all" ? 0 : 1) +
    (filters.budget ? 1 : 0) +
    filters.amenities.length;

  const set = (patch: Partial<Filters>) =>
    onFiltersChange({ ...filters, ...patch });

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
        {filters.amenities.map((a) => (
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

        <div className="w-44">
          <Select
            value={filters.sort}
            onChange={(v) => set({ sort: v })}
            options={["best", "price", "new"].map((v) => ({
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

          <Field label={t("filters.budget")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                placeholder={t("filters.anyBudget")}
                value={filters.budget}
                onChange={(e) => set({ budget: e.target.value })}
              />
            )}
          </Field>

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

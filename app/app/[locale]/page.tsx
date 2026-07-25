"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchProperties, biText, type PropertySummary } from "@/lib/api";
import { formatEuro } from "@/lib/pricing";
import { monthStates, stayFits } from "@/lib/availability";
import {
  PropertyCard,
  type CardView,
  type PropertyCardData,
} from "@/components/PropertyCard";
import { ResultsMap, type MapPin } from "@/components/search/ResultsMap";
import { Button } from "@/components/ui/Button";
import {
  SearchHero,
  defaultQuery,
  type SearchQuery,
} from "@/components/search/SearchHero";
import {
  FilterBar,
  defaultFilters,
  type Filters,
} from "@/components/search/FilterBar";
import { ViewControls } from "@/components/search/ViewControls";
import { WhyEbrostay } from "@/components/search/WhyEbrostay";

export default function HomePage() {
  const t = useTranslations();
  const locale = useLocale();

  const [all, setAll] = useState<PropertySummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState<SearchQuery>(defaultQuery);
  // v1 parity: the stay search only filters once submitted (R-Home-2); the
  // grid shows everything until then.
  const [applied, setApplied] = useState<SearchQuery | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const [view, setView] = useState<CardView>("grid");
  const [wide, setWide] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setAll(null);
    fetchProperties()
      .then((data) => !cancelled && setAll(data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Everything the OTHER filters allow, budget ignored. The budget control
  // draws its distribution from this: a histogram fed by its own output would
  // collapse as you drag the ceiling, and the shape has to hold still to be
  // read.
  const budgetScope = useMemo(() => {
    if (!all) return [];
    return all.filter(
      (p) =>
        (filters.type === "all" || p.type === filters.type) &&
        filters.amenities.every((a) => p.amenities.includes(a)) &&
        (!applied ||
          (p.bedrooms >= applied.bedrooms &&
            stayFits(
              applied.moveIn,
              applied.moveOut,
              p.availability,
              p.availableFrom,
            ))),
    );
  }, [all, filters.type, filters.amenities, applied]);

  const budgetPrices = useMemo(
    () => budgetScope.map((p) => p.priceNumber),
    [budgetScope],
  );

  const results = useMemo(() => {
    const max = filters.budget ? Number(filters.budget) : Infinity;
    const list = budgetScope.filter((p) => p.priceNumber <= max);
    const bySort = {
      price: (a: PropertySummary, b: PropertySummary) =>
        a.priceNumber - b.priceNumber,
      new: (a: PropertySummary, b: PropertySummary) =>
        Number(b.isNew) - Number(a.isNew) || a.priceNumber - b.priceNumber,
    }[filters.sort]!;
    return [...list].sort(bySort);
  }, [budgetScope, filters.budget, filters.sort]);

  // "1 sept → 20 nov" — the ledger voice for a stay, no year unless it matters.
  const formatRange = (q: SearchQuery) => {
    const fmt = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      day: "numeric",
      month: "short",
    });
    const at = (iso: string) => fmt.format(new Date(`${iso}T00:00:00`));
    return `${at(q.moveIn)} → ${at(q.moveOut)}`;
  };

  const now = useMemo(() => new Date(), []);
  const cards: PropertyCardData[] = useMemo(
    () =>
      results.map((p) => ({
        id: p.id,
        name: p.name,
        area: biText(p.area, locale),
        photoUrl: p.coverUrl ?? "/brand/zaragoza-hero.webp",
        pricePerMonth: p.priceNumber,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        sizeSqm: p.sizeM2,
        amenities: p.amenities,
        verified: p.checked,
        billsIncluded: p.billsPolicy === "included",
        depositProtected: p.depositProtected,
        months: monthStates(p.availability, p.availableFrom, locale, now),
      })),
    [results, locale, now],
  );

  const pins: MapPin[] = useMemo(
    () =>
      results.map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        label: `${formatEuro(p.priceNumber, locale)} €`,
      })),
    [results, locale],
  );

  return (
    /* overflow-x-clip contains the hero's full-bleed backdrop (and wide-map row)
       at the viewport edge without creating a scroll container — so it never
       spawns a horizontal scrollbar, and the sticky header/filter bar/map keep
       working (overflow-y stays visible, unlike overflow-x-hidden). */
    <main className="overflow-x-clip">
      <SearchHero
        query={query}
        onChange={setQuery}
        onSearch={() => {
          setApplied(query);
          document
            .getElementById("listings")
            ?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        applied={applied}
        onClearStay={() => setApplied(null)}
        prices={budgetPrices}
        resultCount={results.length}
        loading={all === null && !failed}
        formatRange={formatRange}
      />

      {/* Results + map. Wide mode breaks the row out of the 1280 page frame so
          the map can run to the viewport edge, while the results column holds
          a fixed width — the cards must not stretch just because the map grew. */}
      <div
        id="listings"
        className={`flex items-stretch ${
          wide ? "w-screen ml-[calc(50%-50vw)]" : "mx-auto max-w-7xl"
        }`}
      >
        <div
          className={`min-w-0 px-4 py-6 sm:px-6 ${
            wide ? "lg:w-[808px] lg:flex-none" : "flex-1"
          }`}
        >
          <ViewControls
            view={view}
            onViewChange={setView}
            wide={wide}
            onWideChange={setWide}
          />

          {failed ? (
            <div className="rounded-(--radius-card) border border-line bg-surface p-8 text-center">
              <p className="text-ink">{t("home.error")}</p>
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                {t("home.retry")}
              </Button>
            </div>
          ) : all === null ? (
            <div
              className={`grid gap-[22px] ${view === "grid" ? "sm:grid-cols-2" : ""}`}
            >
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="rounded-(--radius-card) border border-line bg-surface p-3.5"
                >
                  <div className="skeleton aspect-[16/11] rounded-[0.625rem]" />
                  <div className="mt-3.5 space-y-2.5">
                    <div className="skeleton h-4 w-32" />
                    <div className="skeleton h-3 w-24" />
                    <div className="skeleton h-3 w-40" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-(--radius-card) border border-line bg-surface p-8 text-center">
              <p className="font-display text-lg font-semibold text-ink">
                {t("home.noResultsTitle")}
              </p>
              <p className="mt-2 text-sm text-muted">{t("home.noResultsBody")}</p>
            </div>
          ) : (
            <div
              className={`grid gap-[22px] ${view === "grid" ? "sm:grid-cols-2" : ""}`}
            >
              {cards.map((c) => (
                <PropertyCard
                  key={c.id}
                  property={c}
                  locale={locale}
                  view={view}
                  /* `applied`, not `query`: the bar is prefilled with today +
                     3 months, so the live value is not evidence anyone chose
                     it. Submitting is what makes the dates the visitor's — it
                     is already what filters this list (R-Home-2). */
                  stay={
                    applied
                      ? { moveIn: applied.moveIn, moveOut: applied.moveOut }
                      : undefined
                  }
                  active={hoveredId === c.id || selectedId === c.id}
                  selected={selectedId === c.id}
                  onHover={setHoveredId}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          )}
        </div>

        {/* The map is a companion to results — hidden when there is nothing to
            plot (empty, loading, error) so it never floats over a blank list. */}
        {cards.length > 0 && (
          <div
            className={`hidden py-6 pr-4 sm:pr-6 lg:block ${
              wide ? "lg:flex-1" : "lg:w-[472px] lg:flex-none"
            }`}
          >
            <ResultsMap
              pins={pins}
              hoveredId={hoveredId}
              selectedId={selectedId}
              onHover={setHoveredId}
              onSelect={setSelectedId}
              /* Sticky sidebar. Height TRACKS the results (h-full fills the
                 column, which items-stretch sizes to the cards), so a short
                 list gets a short map. It is only CAPPED at the visible strip
                 below the header + filter bar (max-h) — never taller than the
                 viewport — and floored at one card (min-h). */
              className="sticky top-[calc(var(--header-h)+var(--filter-h)+16px)] h-full max-h-[calc(100dvh-var(--header-h)-var(--filter-h)-32px)] min-h-[29rem]"
            />
          </div>
        )}
      </div>

      <WhyEbrostay />
    </main>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useShortMonths } from "@/i18n/dates";
import { shortDate } from "@/lib/dates";
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
  emptyQuery,
  type SearchQuery,
} from "@/components/search/SearchHero";
import {
  FilterBar,
  defaultFilters,
  type Filters,
} from "@/components/search/FilterBar";
import { ViewControls } from "@/components/search/ViewControls";
import { WhyEbrostay } from "@/components/search/WhyEbrostay";
import {
  readResultsState,
  writeResultsState,
} from "@/components/search/searchUrl";
import {
  rememberResults,
  takeFocus,
} from "@/components/search/resultsHandoff";

// How many cards fit across, asked of the results column rather than the
// window — because the window cannot tell this column's widths apart. At
// 1024px the map leaves it 504px; at 1280 it is 760 whether the map is wide
// or fitted; at 834 there is no map beside it at all and it is 786.
//
// The thresholds come from the narrowest thing on a card: the month band,
// whose min-content is 219px with its labels on, inside 14px of card padding.
// Two columns from 31rem leaves each card 237px (223 of content), three from
// 48rem leaves 241 (227) — the same margin the two-column rung has been
// shipping at 1024 all along. Both figures are locale-proof: the labels are
// three characters of Spline Sans Mono in either language.
//
// Both the skeleton and the results use it, so the placeholder cannot lay out
// differently from the thing it stands in for.
const GRID = "grid grid-cols-1 gap-[22px] @min-[31rem]:grid-cols-2 @min-[48rem]:grid-cols-3";
const COLUMN = "grid grid-cols-1 gap-[22px]";

export default function HomePage() {
  const t = useTranslations();
  const locale = useLocale();
  const months = useShortMonths();

  const [all, setAll] = useState<PropertySummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // v1 parity: the stay search only filters once submitted (R-Home-2); the
  // grid shows everything until then.
  const [applied, setApplied] = useState<SearchQuery | null>(null);
  // No clock in the first render. This page is prerendered at build time, so
  // "today + 3 months" computed here is the BUILD's today — frozen into the
  // HTML — while every visitor's browser computes their own and disagrees with
  // it on hydration: a day out the day after a deploy, a month out a month
  // later. The bar ships with its em-dash placeholder and the mount effect
  // below fills the dates in, which is where the URL restore already waits for
  // the same reason.
  const [query, setQuery] = useState<SearchQuery>(emptyQuery);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const [view, setView] = useState<CardView>("grid");
  const [wide, setWide] = useState(false);
  // Sets, not single ids: a map pin can stand for several homes at one
  // address, and clicking it has to be able to mark all of them.
  const [hovered, setHovered] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  // Restore from the URL AFTER mount, not during the first render. This page is
  // prerendered at build time with the defaults above — its hero is the site's
  // one piece of static marketing HTML — so a first render that read the query
  // string would disagree with that HTML and trip hydration. (useSearchParams()
  // is the tidier API but forces the whole subtree client-only, which empties
  // the prerendered page.) Costs one frame of default chrome on return.
  // Mount only: from here React state is the truth and the URL trails it.
  // Re-reading would fight the visitor every time they touched a control.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const s = readResultsState(new URLSearchParams(window.location.search));
    /* eslint-disable react-hooks/set-state-in-effect -- this IS the external
       system the rule carves out for: the URL is state React does not own, and
       it can only be read once there is a document to read it from. */
    if (s.applied) {
      setApplied(s.applied);
      setQuery(s.applied); // the bar must show what is actually filtering
    } else {
      // Nothing was submitted, so the bar gets its prefilled suggestion —
      // today + 3 months, read here rather than during render because the
      // HTML is older than the visit (see `emptyQuery` above).
      setQuery(defaultQuery());
    }
    setFilters(s.filters);
    setView(s.view);
    setWide(s.wide);
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Mirror the state back into the URL so Back lands on this list, not a blank
  // one. replaceState, not router.replace: this is bookkeeping on the entry we
  // are already on — a router call would re-render and fight the scroll
  // position. Gated on `restored` so the mount pass cannot wipe the query
  // string before it has been read.
  useEffect(() => {
    if (!restored) return;
    const qs = writeResultsState({ applied, filters, view, wide });
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, [restored, applied, filters, view, wide]);

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

  // Coming back from a home: put its card back under the visitor's eye. Has to
  // wait for the list — the cards do not exist until the fetch resolves, which
  // is also why the browser's own scroll restoration cannot do this job.
  const focusDone = useRef(false);
  useEffect(() => {
    if (all === null || focusDone.current) return;
    focusDone.current = true;
    const id = takeFocus();
    if (!id) return;
    // A frame for the cards to lay out before we measure them.
    requestAnimationFrame(() => {
      const el = document.getElementById(`home-${id}`);
      if (!el) {
        // Filtered out since, or the home is gone. The "all homes" link came
        // in with scroll={false} on the strength of this restore, so nothing
        // else will move the page — land at the top rather than wherever the
        // home's page happened to be scrolled to.
        window.scrollTo(0, 0);
        return;
      }
      // Instant, not smooth: this is a restoration, not a journey. A long
      // animated scroll from the top would also trip prefers-reduced-motion.
      el.scrollIntoView({ block: "center", behavior: "auto" });
      setSelected([id]);
    });
  }, [all]);

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
    const at = (iso: string) =>
      shortDate(new Date(`${iso}T00:00:00`), months, { locale, day: true });
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
        photoCardUrl: p.coverCardUrl,
        photoDetailUrl: p.coverDetailUrl,
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
        price: p.priceNumber,
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
        {/* `@container`, because the viewport cannot tell this column's two
            widths apart: at 1280 it is 760px wide in wide mode and 1232 in
            narrow. A viewport breakpoint that gave three columns to one would
            give three to the other, and three columns of 239px do not hold a
            month band. The grids below ask this element how wide it is. */}
        <div
          className={`@container min-w-0 px-4 py-6 sm:px-6 ${
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
              className={view === "grid" ? GRID : COLUMN}
            >
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="rounded-(--radius-card) border border-line bg-surface p-3.5"
                >
                  {/* Same cap AND same `w-full` as the card's photo, or the
                      list jumps when the skeletons are replaced by the homes
                      they stood in for. Without the explicit width the ratio
                      transfers the max-height into a max-width and the box
                      stops at 314px — in every engine, this one. */}
                  <div className="skeleton aspect-[16/11] max-h-[13.5rem] w-full rounded-[0.625rem]" />
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
              className={view === "grid" ? GRID : COLUMN}
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
                  /* The URL is already in sync at this point (the effect
                     above runs on every state change), so its query string
                     IS this list. */
                  onOpen={(id) => rememberResults(id, window.location.search)}
                  active={hovered.includes(c.id) || selected.includes(c.id)}
                  selected={selected.includes(c.id)}
                  onHover={(id) => setHovered(id ? [id] : [])}
                  onSelect={(id) => setSelected([id])}
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
              hoveredIds={hovered}
              selectedIds={selected}
              onHover={setHovered}
              onSelect={setSelected}
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

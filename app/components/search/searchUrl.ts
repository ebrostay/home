import { AMENITY_FILTERS, defaultFilters, type Filters } from "./FilterBar";
import type { SearchQuery } from "./SearchHero";
import type { CardView } from "@/components/PropertyCard";

// ============================================================
// The results page in a query string.
//
// Everything the visitor set — the submitted stay, the filters, the layout
// they chose to read the list in — lives here so that leaving for a home and
// coming back restores it from history rather than from memory. It also makes
// a result list linkable, which it was not before.
//
// Only NON-DEFAULT values are written: an untouched page keeps a clean "/es/".
// Reading is defensive — a hand-edited or truncated URL falls back per field
// rather than rejecting the lot, so one bad value can't blank the page.
// ============================================================

export type ResultsState = {
  applied: SearchQuery | null; // null = stay search never submitted
  filters: Filters;
  view: CardView;
  wide: boolean;
};

const TYPES = ["all", "apartment", "room", "home"];
const SORTS = ["price", "new"];
const MAX_BEDROOMS = 4; // mirrors BEDROOM_OPTIONS

// A real "YYYY-MM-DD", not just the shape: "2026-02-31" must not survive.
function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
  );
}

export function readResultsState(params: URLSearchParams): ResultsState {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  // A stay is all-or-nothing: half a range would filter by something the
  // search bar could not show back.
  const applied =
    isIsoDate(from) && isIsoDate(to) && to > from
      ? { moveIn: from, moveOut: to, bedrooms: readBedrooms(params) }
      : null;

  const type = params.get("type") ?? "";
  const budget = params.get("budget") ?? "";
  const sort = params.get("sort") ?? "";

  return {
    applied,
    filters: {
      type: TYPES.includes(type) ? type : defaultFilters.type,
      // Whole euros only — the budget control's own step is never fractional.
      budget: /^[1-9]\d{0,6}$/.test(budget) ? budget : defaultFilters.budget,
      // Still checked against the vocabulary, not merely split: the list now
      // covers the whole catalogue, but a URL is user input and an unknown key
      // would ride into the filter state, match no listing, and leave a chip
      // on the bar that cannot be explained.
      amenities: (params.get("amenities") ?? "")
        .split(",")
        .filter((a) => AMENITY_FILTERS.includes(a)),
      sort: SORTS.includes(sort) ? sort : defaultFilters.sort,
    },
    view: params.get("view") === "list" ? "list" : "grid",
    wide: params.get("wide") === "1",
  };
}

function readBedrooms(params: URLSearchParams): number {
  const n = Number(params.get("bedrooms"));
  return Number.isInteger(n) && n > 0 && n <= MAX_BEDROOMS ? n : 0;
}

// Returns the query string WITHOUT "?" — empty when nothing has been set.
export function writeResultsState(s: ResultsState): string {
  const p = new URLSearchParams();
  if (s.applied) {
    p.set("from", s.applied.moveIn);
    p.set("to", s.applied.moveOut);
    if (s.applied.bedrooms > 0) p.set("bedrooms", String(s.applied.bedrooms));
  }
  if (s.filters.type !== defaultFilters.type) p.set("type", s.filters.type);
  if (s.filters.budget) p.set("budget", s.filters.budget);
  if (s.filters.amenities.length > 0)
    p.set("amenities", s.filters.amenities.join(","));
  if (s.filters.sort !== defaultFilters.sort) p.set("sort", s.filters.sort);
  if (s.view !== "grid") p.set("view", s.view);
  if (s.wide) p.set("wide", "1");
  return p.toString();
}

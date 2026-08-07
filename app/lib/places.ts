// ============================================================
// "Your places" — the commute question a relocating tenant actually asks:
// not "where is this flat" but "how far is it from the office".
//
// Places live in the BROWSER, not on the account. They are useful before
// anyone signs in, they follow the guest across every listing they open, and
// they are nobody else's business — the office address a guest measures homes
// against never reaches Cosmos. localStorage is therefore the store, and this
// module is the only thing that knows its shape.
//
// Two stores, kept apart on purpose:
//   · the places themselves — five at most, tiny, and the thing a guest would
//     be annoyed to lose;
//   · the routes measured for them — derived, per listing, and disposable.
//     Cached because measuring one costs an OpenRouteService call against a
//     shared daily ceiling (OrsBudget on the server), so re-opening a listing
//     must not spend a second one. This is the "cache pathing results locally"
//     half of the feature, and it is what keeps five saved places from turning
//     every listing view into five outbound calls.
//
// Everything below the browser wrappers is pure and string-in/string-out, so
// `places.test.ts` can cover it under vitest's node environment, where
// `localStorage` does not exist.
// ============================================================

import type { NearbyProfile } from "@/lib/nearby";

/** Five. Enough for the office, the school, the gym and two more; few enough
 *  that the list stays a glanceable comparison rather than a second search
 *  results page, and that one listing view can never cost more than five
 *  measurements per profile. */
export const MAX_PLACES = 5;

/** Routes are keyed per listing, so a guest browsing a dozen homes with five
 *  places accumulates sixty entries and keeps growing. Bounded by age so the
 *  store cannot creep towards the 5 MB localStorage ceiling and start throwing
 *  on write — the homes they looked at longest ago are the ones they are
 *  least likely to open again. */
export const MAX_CACHED_ROUTES = 80;

/** One saved destination, all of it from the geocoder — the address is the
 *  only thing the guest is asked for. */
export type SavedPlace = {
  /** Nominatim's own place id. Stable, and unique per OSM place, which makes
   *  "you already saved this one" a lookup rather than a fuzzy match. */
  id: string;
  /** The street line, as the list reads it: "Calle de Alfonso I 20, Zaragoza". */
  label: string;
  /** The neighbourhood and postcode under it, or "" when OSM knows neither.
   *  NOT Nominatim's `display_name`, which for this address is thirteen commas
   *  ending in "Spain" and repeats most of the label on the way past. */
  detail: string;
  lat: number;
  lng: number;
};

/** A measured route band, as the server returned it (ADR-041 — `RouteBand`
 *  in `lib/api.ts`) plus when we stored it. */
export type CachedRoute = {
  minutes: [number, number];
  metres: [number, number];
  trunk: string;
  stubA: string;
  stubB: string;
  /** Epoch ms. Only ever read to decide what to drop first. */
  at: number;
};

/** The same key the first version of this section used. Its entries had a
 *  `km` the guest typed and no coordinates at all, so they cannot be measured
 *  and `parsePlaces` drops them on sight — one key that cleans itself up,
 *  rather than a v2 key and an orphan left behind forever. */
export const PLACES_KEY = "ebrostay-your-places";
export const ROUTES_KEY = "ebrostay-place-routes";

// ---------------------------------------------------------------------------
// Pure: parse, serialise, key, prune
// ---------------------------------------------------------------------------

/** Everything we are willing to believe from the store.
 *
 *  Deliberately strict and deliberately silent: a corrupt or outdated entry is
 *  dropped, never repaired and never surfaced. The store is a convenience the
 *  guest can rebuild in three clicks, so the cost of losing one entry is far
 *  below the cost of rendering a place with a `NaN` distance. */
export function parsePlaces(raw: string | null): SavedPlace[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: SavedPlace[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const place = asPlace(item);
    if (!place || seen.has(place.id)) continue;
    seen.add(place.id);
    out.push(place);
    // The cap is enforced on the way IN as well as at the add button: a store
    // written by an older build, or edited by hand, must not make the list
    // longer than the feature promises.
    if (out.length === MAX_PLACES) break;
  }
  return out;
}

function asPlace(item: unknown): SavedPlace | null {
  if (typeof item !== "object" || item === null) return null;
  const v = item as Record<string, unknown>;
  if (typeof v.id !== "string" || v.id === "") return null;
  if (typeof v.label !== "string" || v.label === "") return null;
  if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return null;
  return {
    id: v.id,
    label: v.label,
    detail: typeof v.detail === "string" ? v.detail : "",
    lat: v.lat as number,
    lng: v.lng as number,
  };
}

/** Which measurement this is: this listing, this destination, this profile.
 *
 *  Keyed on the COORDINATES rather than the place id, so renaming a place — or
 *  saving the same office twice under two Nominatim ids — reuses the route
 *  that was already paid for. Five decimals is ~1 m, well below the precision
 *  the geocoder itself returns, so two keys differ only when the points
 *  genuinely do. */
export function routeKey(
  propertyId: string,
  place: { lat: number; lng: number },
  profile: NearbyProfile,
): string {
  return `${propertyId}|${place.lat.toFixed(5)},${place.lng.toFixed(5)}|${profile}`;
}

export function parseRoutes(raw: string | null): Record<string, CachedRoute> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

  const out: Record<string, CachedRoute> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const route = asRoute(value);
    if (route) out[key] = route;
  }
  return out;
}

/** A [lo, hi] pair of finite numbers — the shape both `minutes` and `metres`
 *  take on a `CachedRoute`. */
function isRange(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

function asRoute(item: unknown): CachedRoute | null {
  if (typeof item !== "object" || item === null) return null;
  const v = item as Record<string, unknown>;
  // An entry from before ADR-041 (`{ polyline, metres: number, seconds }`)
  // fails here — `minutes`/`metres` are not the `[lo, hi]` pairs this shape
  // requires — and is silently dropped. That IS the migration: there is no
  // repair path from a single measurement to a range.
  if (!isRange(v.minutes) || !isRange(v.metres)) return null;
  if (typeof v.trunk !== "string" || typeof v.stubA !== "string" || typeof v.stubB !== "string")
    return null;
  return {
    minutes: v.minutes,
    metres: v.metres,
    trunk: v.trunk,
    stubA: v.stubA,
    stubB: v.stubB,
    // A missing timestamp sorts oldest, so an entry from a build that did not
    // write one is the first to go rather than the last.
    at: Number.isFinite(v.at) ? (v.at as number) : 0,
  };
}

/** Add one measurement and keep the store bounded, newest kept. Pure — it
 *  returns the next cache rather than mutating the one it was given, which is
 *  what lets the test assert on both. */
export function putRoute(
  cache: Record<string, CachedRoute>,
  key: string,
  route: CachedRoute,
  max = MAX_CACHED_ROUTES,
): Record<string, CachedRoute> {
  const next = { ...cache, [key]: route };
  const keys = Object.keys(next);
  if (keys.length <= max) return next;

  // Ties broken by key so the result is deterministic: two routes measured in
  // the same millisecond (five places resolving off one render is exactly
  // that) must not drop a different one each run.
  const doomed = keys
    .sort((a, b) => next[a].at - next[b].at || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, keys.length - max);
  for (const key of doomed) delete next[key];
  return next;
}

// ---------------------------------------------------------------------------
// Browser wrappers
// ---------------------------------------------------------------------------
//
// Every one of these swallows its failure. Private mode, a full quota and a
// disabled store all reach the same place: the feature works for this page
// view and forgets afterwards. None of them is worth an error a guest reading
// a listing has to think about.

export function loadPlaces(): SavedPlace[] {
  try {
    return parsePlaces(localStorage.getItem(PLACES_KEY));
  } catch {
    return [];
  }
}

export function storePlaces(places: SavedPlace[]): void {
  try {
    localStorage.setItem(PLACES_KEY, JSON.stringify(places));
  } catch {
    // Kept for this page view only.
  }
}

export function readCachedRoute(
  propertyId: string,
  place: { lat: number; lng: number },
  profile: NearbyProfile,
): CachedRoute | null {
  try {
    return parseRoutes(localStorage.getItem(ROUTES_KEY))[
      routeKey(propertyId, place, profile)
    ] ?? null;
  } catch {
    return null;
  }
}

export function writeCachedRoute(
  propertyId: string,
  place: { lat: number; lng: number },
  profile: NearbyProfile,
  route: Omit<CachedRoute, "at">,
  now = Date.now(),
): void {
  try {
    const next = putRoute(
      parseRoutes(localStorage.getItem(ROUTES_KEY)),
      routeKey(propertyId, place, profile),
      { ...route, at: now },
    );
    localStorage.setItem(ROUTES_KEY, JSON.stringify(next));
  } catch {
    // The next visit measures it again, which is the whole cost.
  }
}

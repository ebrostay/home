// The structural half of the nearby vocabulary, plus the pure helpers.
//
// GROUPS and PROFILES are compile-time constants because they are structure,
// not configuration: groups key the icon map in Nearby.tsx, which is a
// Record<NearbyGroup, LucideIcon> and cannot be built from a runtime fetch.
//
// TYPES are NOT here. They are served by GET /api/nearby/vocabulary so that
// NearbyGroups.cs is their single definition — the server has to validate
// against its own copy regardless, and a second hand-maintained list would
// drift. The cost is that a type can arrive with no translation, so the editor
// hides any type it has no label for rather than throwing MISSING_MESSAGE.

import type { PublicReach } from "@/lib/api";

export const NEARBY_GROUPS = [
  "transport",
  "groceries",
  "food",
  "outdoors",
  "health",
] as const;
export type NearbyGroup = (typeof NEARBY_GROUPS)[number];

export const NEARBY_PROFILES = ["foot", "car"] as const;
export type NearbyProfile = (typeof NEARBY_PROFILES)[number];

/** The one default, so `Nearby.tsx` (which owns the profile) and
 *  `property/page.tsx` (which only mirrors it, Task 11) can't silently drift
 *  into initializing their two copies of the same state to different
 *  values. */
export const DEFAULT_NEARBY_PROFILE: NearbyProfile = "foot";

export type Reach = { metres: number; minutes: number };

export function reachFor(
  entry: { reach: Partial<Record<NearbyProfile, Reach>> },
  profile: NearbyProfile,
): Reach | null {
  return entry.reach[profile] ?? null;
}

/** How far a place is, per profile, as a visitor may see it — a range
 *  (ADR-041 point 3), never the owner's single eager `Reach`. Kept as its own
 *  function rather than a generic `reachFor<R>`: a type parameter inferred
 *  from an index-signature-shaped `reach` (`PublicNearbyEntry`'s) does not
 *  reliably resolve against `Partial<Record<NearbyProfile, R>>`, and two
 *  small, concretely-typed lookups are less trouble than one that silently
 *  infers `{}`. */
export function publicReachFor(
  entry: { reach: Record<string, PublicReach> },
  profile: NearbyProfile,
): PublicReach | null {
  return entry.reach[profile] ?? null;
}

/** Google encoded polyline, precision 5 — what ORS returns for
 *  `geometries=polyline`. An order of magnitude smaller than GeoJSON, which
 *  matters because these are stored per entry per profile. */
export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / factor, lng / factor]);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Candidate memo
// ---------------------------------------------------------------------------
//
// One category open costs TWO OpenRouteService matrix requests — one per
// profile — against a 1,500/day account ceiling, and the editor asks again
// every time the finder is reopened or a group is revisited. Flipping
// Transport → Groceries → Transport spends four requests to learn two things.
//
// So the same question is answered from memory. "The same question" is an
// EXACT pin plus a group: the pin is not rounded here the way the server
// rounds it for its Overpass cell (~110 m), because a rounded origin puts up
// to ~78 m of error into a distance we present as precise — ADR-028's reason
// for caching the place search but never the measurement. A key built from
// the full-precision pin has no such problem: a hit is the answer the server
// would have given.
//
// Deliberately small in scope:
//   · module-level, so it dies on reload — no eviction policy to get wrong,
//     and nothing to go stale over a session's length;
//   · successes only, so a failed lookup always retries;
//   · results, not in-flight promises. Two simultaneous asks for one key is
//     not a case this editor can produce (the finder shows one group).
//
// It does nothing for a second owner, a second listing, or a reload. Those
// want the server-side cache this deliberately is not.

const candidateMemo = new Map<string, unknown>();

/** Exact pin, never rounded — see above. `toString()` rather than a fixed
 *  precision so two pins that differ at all are two keys. */
export const candidateKey = (lat: number, lng: number, group: string) =>
  `${lat}|${lng}|${group}`;

/** Wraps a candidate fetch with the memo. The fetcher is a parameter so the
 *  memo is testable without a network, and so this module keeps knowing
 *  nothing about `lib/api`. */
export async function memoizedCandidates<T>(
  lat: number,
  lng: number,
  group: string,
  fetcher: () => Promise<T[]>,
): Promise<T[]> {
  const key = candidateKey(lat, lng, group);
  const hit = candidateMemo.get(key);
  if (hit !== undefined) return hit as T[];
  const fresh = await fetcher();
  candidateMemo.set(key, fresh);
  return fresh;
}

/** Tests only — the memo outlives any single component by design. */
export function resetCandidateMemo() {
  candidateMemo.clear();
}

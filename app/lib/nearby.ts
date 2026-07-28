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

export type Reach = { metres: number; minutes: number };

export function reachFor(
  entry: { reach: Partial<Record<NearbyProfile, Reach>> },
  profile: NearbyProfile,
): Reach | null {
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

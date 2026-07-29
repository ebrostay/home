// Which price pills can share the map, and which have to travel together.
//
// Two homes 34m apart are one pin at every zoom a visitor will use: measured
// on the seeded data, "980 €" covered 94% of "950 €" and the cheaper home was
// simply not on the map. That is not an edge case for this business — the
// inventory is corporate flats, and several units in one building (1 IZQ,
// 2 IZQ) is its normal shape.
//
// Kept as a pure function of projected points rather than something that
// reaches into Leaflet, so the geometry can be tested without a map.

export type ClusterInput = {
  id: string;
  lat: number;
  lng: number;
  /** The rendered pill text, e.g. "950 €" — its length is its width. */
  label: string;
  price: number;
};

export type Point = { x: number; y: number };

export type Cluster = {
  /** Stable across renders: the member ids in order. */
  key: string;
  ids: string[];
  /** The cheapest member's position and label — a group reads as "from". */
  lat: number;
  lng: number;
  label: string;
  price: number;
  /** Every member's coordinates, for a zoom-to-fit. */
  bounds: [number, number][];
  /** False when no amount of zooming pulls these apart (same building). */
  separable: boolean;
};

// The pill is 11px Spline Sans Mono with 9px of padding a side and a 1px
// border, so its width is a function of its text: measured 53px at "950 €"
// (5 chars) and 66.2px at "1.350 €" (7), which these two constants reproduce
// exactly. Height is fixed.
const CHAR_W = 6.6;
const PILL_PAD = 20;
const PILL_H = 23;
/** Breathing room, so pills that merely touch still count as colliding. */
const GAP = 4;

export const pillWidth = (label: string) => label.length * CHAR_W + PILL_PAD;

/** Half-widths summed: how far apart two pills' anchors must be horizontally. */
const needX = (a: string, b: string) => (pillWidth(a) + pillWidth(b)) / 2 + GAP;
const NEED_Y = PILL_H + GAP;

/**
 * Group pins whose pills would overlap on screen.
 *
 * `project` must return absolute pixel coordinates at the CURRENT zoom
 * (Leaflet's `map.project(latlng, zoom)`), which are translation-invariant —
 * so panning cannot change the answer and only a zoom needs to recompute.
 *
 * `zoomsLeft` is how many zoom levels remain below the map's maximum. Screen
 * distance doubles per level, which is what decides whether a group is worth
 * offering a zoom-in or has to be resolved some other way.
 */
export function clusterPins(
  pins: ClusterInput[],
  project: (lat: number, lng: number) => Point,
  zoomsLeft: number,
): Cluster[] {
  // Cheapest first, id as the tiebreak: the anchor of a group is then its
  // lowest price with no extra work, and the output is stable across renders
  // regardless of what order the results arrived in.
  const ordered = [...pins].sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));

  const groups: { head: ClusterInput; at: Point; members: ClusterInput[]; need: number }[] = [];

  for (const pin of ordered) {
    const at = project(pin.lat, pin.lng);
    // Tested against each group's anchor, not against every member: a chain of
    // near-misses across the city should not collapse into one pin.
    const hit = groups.find((g) => {
      const dx = Math.abs(at.x - g.at.x);
      const dy = Math.abs(at.y - g.at.y);
      return dx < needX(pin.label, g.head.label) && dy < NEED_Y;
    });

    if (!hit) {
      groups.push({ head: pin, at, members: [pin], need: 1 });
      continue;
    }

    hit.members.push(pin);
    // Clearing EITHER axis is enough to separate two pills, so the scale this
    // pair needs is the cheaper of the two — and the group needs the most
    // demanding of its pairs.
    const dx = Math.abs(at.x - hit.at.x);
    const dy = Math.abs(at.y - hit.at.y);
    const sx = dx > 0 ? needX(pin.label, hit.head.label) / dx : Infinity;
    const sy = dy > 0 ? NEED_Y / dy : Infinity;
    hit.need = Math.max(hit.need, Math.min(sx, sy));
  }

  return groups.map((g) => ({
    key: g.members.map((m) => m.id).join("+"),
    ids: g.members.map((m) => m.id),
    lat: g.head.lat,
    lng: g.head.lng,
    label: g.head.label,
    price: g.head.price,
    bounds: g.members.map((m) => [m.lat, m.lng] as [number, number]),
    separable: g.members.length === 1 || Math.pow(2, zoomsLeft) >= g.need,
  }));
}

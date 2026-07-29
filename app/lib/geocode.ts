// ============================================================
// Nominatim geocoding for the listing editor.
//
// Client-direct, no API key (spec-v2 §1.1; carried from v1, docs/spec/07 §7.4).
// The browser's own `Referer` is what identifies the application to Nominatim,
// which is the identification their usage policy asks of a website — a
// `User-Agent` cannot be set from `fetch` at all, it is a forbidden header.
//
// What their policy does require of us, and what this file is therefore
// responsible for: no more than one request a second, and not treating the
// service as a bulk endpoint. Hence the throttle below and the rule that the
// loosening chain only runs when the plain query finds nothing.
//
// Deliberately NOT cached. Repeat addresses are real here — Ebrostay lists
// several flats per building and `addressKey` exists to group them — but a
// cache is a second copy of an answer that has to be kept correct forever, and
// at this volume it would save a handful of requests.
// ============================================================

import { createThrottle, sleep } from "@/lib/throttle";

/** Everything we are willing to believe from one Nominatim hit. */
export type GeoCandidate = {
  /** Nominatim's own id, used to de-duplicate across the loosening attempts. */
  placeId: string;
  lat: number;
  lng: number;
  /** One line, for the candidate list. Nominatim's `display_name` is long. */
  label: string;
  /** Full `display_name`, as the title attribute — the disambiguator when two
   *  candidates share a short label. */
  detail: string;
  /** House number + road, when OSM knows both. */
  street: string | null;
  postcode: string | null;
  /** The neighbourhood, under whichever key this place happens to be mapped
   *  with. Feeds the listing's bilingual `area`. */
  area: string | null;
  /** The town. Not shown, but it decides the ranking — see `rank`. */
  locality: string | null;
};

// Nominatim's `address` object varies by how a place is mapped, so there is no
// single "neighbourhood" key to read. First one present wins, narrowest first:
// a listing's area should say Casco Histórico, not Zaragoza.
const AREA_KEYS = [
  "neighbourhood",
  "quarter",
  "suburb",
  "city_district",
  "district",
  "borough",
] as const;

type NominatimAddress = Partial<Record<string, string>>;

type NominatimHit = {
  place_id?: number | string;
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
};

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const REVERSE_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";

/** Where Ebrostay operates. Appended when the query does not already say so,
 *  because "Movera 7" alone matches half of Europe. */
const CITY = "Zaragoza";
const REGION = `${CITY}, España`;

/** Street-type words OSM often wants dropped: it stores "Movera", not
 *  "Calle Movera", and a literal search for the latter can miss.
 *
 *  Exported because it is Spanish address vocabulary, not a fact about
 *  Nominatim — the Catastro's street index needs the same words removed, and
 *  two copies of this list would drift. */
export const STREET_WORDS =
  /\b(calle|c\/|c\.|avenida|avda\.?|av\.?|paseo|po\.?|plaza|pza\.?|pl\.?|camino|ronda|via|vía|travesia|travesía|carretera|ctra\.?)\b/gi;

/** Nominatim asks for at most one request a second. This is the whole of our
 *  compliance with it, so it is enforced here rather than at each call site. */
const claimSlot = createThrottle(1_100);

async function throttled(url: string, signal?: AbortSignal): Promise<NominatimHit[]> {
  const wait = claimSlot();
  if (wait > 0) await sleep(wait, signal);

  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  return (await res.json()) as NominatimHit[];
}

/**
 * Resolve a typed address to candidates, best first.
 *
 * The query is loosened progressively because OSM frequently lacks the house
 * number, or files the street under its official name. Each attempt is a
 * separate request, so they run only while the previous one found nothing —
 * three requests per keystroke-pause would be exactly the "heavy use" the
 * usage policy rules out.
 */
export async function geocode(
  query: string,
  locale: string,
  signal?: AbortSignal,
): Promise<GeoCandidate[]> {
  const base = query.trim();
  if (base.length < 4) return [];

  const located = base.toLowerCase().includes(CITY.toLowerCase());
  const full = located ? base : `${base}, ${REGION}`;

  const attempts = [
    full,
    // Digits gone: "Movera 7" → "Movera". The building number is what OSM is
    // most often missing.
    full.replace(/\d+/g, " "),
    // And without the street-type word, which OSM may not store.
    full.replace(STREET_WORDS, " ").replace(/\d+/g, " "),
  ].map(tidy);

  const seen = new Set<string>();
  const out: GeoCandidate[] = [];

  for (const attempt of attempts) {
    if (attempt.length < 4 || seen.has(`q:${attempt}`)) continue;
    seen.add(`q:${attempt}`);

    const params = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      limit: "10",
      "accept-language": locale === "en" ? "en" : "es",
      q: attempt,
    });

    const hits = await throttled(`${ENDPOINT}?${params}`, signal);
    for (const hit of hits) {
      const candidate = toCandidate(hit);
      if (!candidate || seen.has(candidate.placeId)) continue;
      seen.add(candidate.placeId);
      out.push(candidate);
    }

    // Loosening exists to rescue an empty result, not to pad a good one.
    if (out.length > 0) break;
  }

  return rankSpainFirst(out);
}

/**
 * The neighbourhood at a point, for when the forward answer carried none.
 *
 * A house node's computed address hierarchy sometimes skips the barrio
 * entirely — Calle Elvira de Hidalgo 10 jumps from `road` straight to `city`
 * even though the point sits inside a mapped `Centro` boundary. Asked in
 * REVERSE at zoom 14 (suburb resolution), Nominatim answers from the boundary
 * polygon instead of the node's hierarchy, and the barrio comes back.
 *
 * One request, and only from the no-area path: an address whose forward
 * answer already names a neighbourhood never gets here. Spanish, like the
 * forward fill — most Zaragoza neighbourhoods are proper nouns that do not
 * translate, and the owner edits the English where it genuinely differs.
 *
 * `null` on any failure: a missing area is a convenience lost, never an
 * error worth surfacing — the field can still be typed by hand.
 */
export async function reverseArea(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    zoom: "14",
    "accept-language": "es",
    lat: String(lat),
    lon: String(lng),
  });

  try {
    // Same 1-per-second slot as the forward search: to Nominatim the two are
    // one client, and the promise is about the client, not the endpoint.
    const wait = claimSlot();
    if (wait > 0) await sleep(wait, signal);

    const res = await fetch(`${REVERSE_ENDPOINT}?${params}`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    const hit = (await res.json()) as NominatimHit;
    const a = hit.address ?? {};
    return AREA_KEYS.map((k) => a[k]).find(Boolean) ?? null;
  } catch {
    // Includes abort: the caller checks its own signal before using the
    // answer, so a null here and an abort land in the same place.
    return null;
  }
}

/** Collapse the whitespace the strip-and-replace passes leave behind, and the
 *  double commas they leave where a word used to be. */
const tidy = (q: string) =>
  q.replace(/\s+/g, " ").replace(/\s*,\s*(?=,)/g, "").replace(/^[\s,]+|[\s,]+$/g, "").trim();

function toCandidate(hit: NominatimHit): GeoCandidate | null {
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (hit.place_id === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const a = hit.address ?? {};
  const road = a.road ?? a.pedestrian ?? a.footway ?? null;
  const street = road
    ? [road, a.house_number].filter(Boolean).join(" ")
    : null;

  const display = hit.display_name ?? "";
  const locality = a.city ?? a.town ?? a.village ?? a.municipality ?? null;

  // Built from the structured address when OSM has one, because
  // `display_name` leads with whatever the hit matched — for a named building
  // that is "Unión de Consumidores de Aragón, 20", which tells an owner
  // nothing about which street they just picked.
  const label =
    street && locality
      ? `${street}, ${locality}`
      : display.split(",").slice(0, 2).join(",").trim() || display;

  return {
    placeId: String(hit.place_id),
    // Six decimals is ~0.1 m; past that the digits are noise, and they would
    // make the editor's dirty check fire on a pin nobody moved.
    lat: round(lat),
    lng: round(lng),
    label,
    detail: display,
    street,
    postcode: a.postcode ?? null,
    area: AREA_KEYS.map((k) => a[k]).find(Boolean) ?? null,
    locality,
  };
}

/** Best first, with Nominatim's own relevance preserved inside each group —
 *  `sort` is stable, so equal ranks keep their original order. */
const rankSpainFirst = (list: GeoCandidate[]) =>
  [...list].sort((a, b) => rank(a) - rank(b));

// The city has to outrank the province, and this is why. "Zaragoza" names both
// a city and the province around it, so appending it to a query pulls in the
// same street name from every town in the province — a search for Calle
// Alfonso I returns Ejea de los Caballeros, Daroca, Alagón and Tauste before
// the famous one in the middle of Zaragoza. Ebrostay lets homes in the city.
const rank = (c: GeoCandidate) => {
  if (c.locality && c.locality.toLowerCase() === CITY.toLowerCase()) return 0;
  return /(españa|spain)\s*$/i.test(c.detail) ? 1 : 2;
};

/** Metres for a short hop, kilometres once "56376 m" stops being a number
 *  anyone reads. Locale-formatted, because the decimal separator differs. */
export function formatDistance(metres: number, locale: string): string {
  const intl = locale === "en" ? "en-GB" : "es-ES";
  if (metres < 1_000) return `${new Intl.NumberFormat(intl).format(metres)} m`;
  return `${new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(metres / 1000)} km`;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

// ------------------------------------------------------------
// Distance, for the two-pin comparison.
// ------------------------------------------------------------

/** Metres between two points (haversine). Used to decide whether a geocode
 *  result is far enough from a hand-placed pin to be worth offering — and to
 *  tell the owner how far, which is what makes the choice a one-second one. */
export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Below this, the two pins are saying the same thing. Street-level geocoding
 *  is good to roughly 20–30 m, so a closer result is not a correction — and
 *  offering one would put a second pin on the map after every address edit. */
export const SAME_PLACE_M = 25;

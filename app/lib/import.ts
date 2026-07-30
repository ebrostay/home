import type { HostListing, HostPricing, ImportResult, ImportStage } from "@/lib/api";
import { paragraphDoc } from "@/lib/rich-text";

// ============================================================
// "Start faster" — the AI-assisted import (ADR-033).
//
// Nothing here draws anything and nothing here knows about React. Two screens,
// a banner and twenty-odd marks all state things about the same job, and
// computed at each site they would be twenty chances to disagree.
// ============================================================

/** The closed list, named on screen BEFORE anything is pasted. An unmapped
 *  page yields values in the wrong fields, and a wrong field the owner did not
 *  notice is worse than an empty form — so the answer arrives before the
 *  effort does. Mirrors `ImportSources.All` in api/Models/ImportModels.cs. */
export const IMPORT_SOURCES = [
  { key: "idealista", domains: ["idealista.com"], anyTld: false },
  { key: "fotocasa", domains: ["fotocasa.es"], anyTld: false },
  { key: "habitaclia", domains: ["habitaclia.com"], anyTld: false },
  { key: "pisos", domains: ["pisos.com"], anyTld: false },
  { key: "airbnb", domains: ["airbnb"], anyTld: true },
  { key: "booking", domains: ["booking"], anyTld: true },
] as const;

export type SourceKey = (typeof IMPORT_SOURCES)[number]["key"];

/** The pasted URL → one of the six, or null. The server re-checks this; the
 *  client's copy exists to light the pill and enable the button, not to be
 *  believed. */
export function matchSource(url: string): SourceKey | null {
  let host: string;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }

  for (const source of IMPORT_SOURCES) {
    for (const domain of source.domains) {
      if (source.anyTld) {
        // Airbnb and Booking answer on dozens of TLDs. Match the brand label,
        // then require everything after it to be TLD-shaped — so airbnb.co.uk
        // matches and airbnb.evil.com does not.
        const labels = host.split(".");
        const at = labels.indexOf(domain);
        if (at >= 0 && at < labels.length - 1 &&
            labels.slice(at + 1).every((l) => l.length > 0 && l.length <= 3))
          return source.key;
      } else if (host === domain || host.endsWith(`.${domain}`)) {
        return source.key;
      }
    }
  }
  return null;
}

/** Every field an import may claim. Mirrors `ImportKeys.All` in
 *  api/Models/ImportModels.cs — a drift is an unmarked field or a rejected
 *  callback, never a harmless difference.
 *
 *  Grouped controls carry ONE key for the group (`type`, `energyRating`,
 *  `amenities`, `billsPolicy`, `minStayMonths`, each house rule): a portal's
 *  feature list mapping to nine of fifteen amenities is still one answer to
 *  one question, so any toggle clears the group. */
export const IMPORT_KEYS = [
  "address", "postcode", "pin", "area", "cadastralRef",
  "name", "type", "sizeM2", "bedrooms", "bathrooms", "guests",
  "floorNumber", "energyRating",
  "copy", "details", "beds",
  "amenities",
  "price", "billsPolicy", "utilitiesCapEur", "depositAmount", "minStayMonths",
  "petsAllowed", "smokingAllowed", "couplesAllowed", "selfCheckin",
] as const;

export type ImportKey = (typeof IMPORT_KEYS)[number];

/** Which step an owner goes to in order to look at a marked field — the same
 *  job `STEP_OF` does for blockers. `nearby` is absent on purpose: nothing an
 *  advert publishes belongs in a measured walking time. */
export const IMPORT_STEP_OF: Record<ImportKey, string> = {
  address: "address", postcode: "address", pin: "address", area: "address",
  cadastralRef: "address",
  name: "basics", type: "basics", sizeM2: "basics", bedrooms: "basics",
  bathrooms: "basics", guests: "basics", floorNumber: "basics",
  energyRating: "basics",
  copy: "description", details: "description", beds: "description",
  amenities: "amenities",
  price: "pricing", billsPolicy: "pricing", utilitiesCapEur: "pricing",
  depositAmount: "pricing", minStayMonths: "pricing",
  petsAllowed: "rules", smokingAllowed: "rules", couplesAllowed: "rules",
  selfCheckin: "rules",
};

/** An arriving import MERGES, never overwrites: only fields the owner has not
 *  touched may be filled. This is the whole reason "Start filling it in
 *  meanwhile" is safe to offer.
 *
 *  `touched` is the set of keys the owner has typed into since the read
 *  started. The returned `imported` is what was ACTUALLY applied — a key the
 *  payload claimed but sent no value for is not a mark. */
export function mergeImport(
  listing: HostListing,
  pricing: HostPricing,
  result: ImportResult,
  touched: ReadonlySet<string>,
): { listing: HostListing; pricing: HostPricing; imported: ImportKey[] } {
  const claimed = new Set(result.imported);
  const applied: ImportKey[] = [];
  const next = { ...listing };
  const nextPricing = { ...pricing };
  const l = result.listing;
  const p = result.pricing;

  const take = <T,>(key: ImportKey, value: T | undefined, apply: (v: T) => void) => {
    if (value === undefined || !claimed.has(key) || touched.has(key)) return;
    apply(value);
    applied.push(key);
  };

  take("address", l.address, (v) => (next.address = v));
  take("postcode", l.postcode, (v) => (next.postcode = v));
  take("cadastralRef", l.cadastralRef, (v) => (next.cadastralRef = v));
  take("area", l.areaEs, (v) => (next.area = { es: v, en: null }));
  if (l.lat !== undefined && l.lng !== undefined)
    take("pin", l.lat, (v) => { next.lat = v; next.lng = l.lng!; });

  take("name", l.name, (v) => (next.name = v));
  take("type", l.type, (v) => (next.type = v));
  take("sizeM2", l.sizeM2, (v) => (next.sizeM2 = v));
  take("bedrooms", l.bedrooms, (v) => (next.bedrooms = v));
  take("bathrooms", l.bathrooms, (v) => (next.bathrooms = v));
  take("guests", l.guests, (v) => (next.guests = v));
  take("floorNumber", l.floorNumber, (v) => (next.floorNumber = v));
  take("energyRating", l.energyRating, (v) => (next.energyRating = v));

  // The Spanish only, always. `copyEnApproved` is untouched: there is no
  // English to approve, and an approval gate the owner clicks through is
  // worse than no English (§10.5).
  take("copy", l.copyEs, (v) => (next.copy = { es: paragraphDoc(v), en: null }));
  take("details", l.detailsEs, (v) => (next.details = { es: v, en: null }));
  take("beds", l.bedsEs, (v) => (next.beds = { es: v, en: null }));

  take("amenities", l.amenities, (v) => (next.amenities = v));
  take("petsAllowed", l.petsAllowed, (v) => (next.petsAllowed = v));
  take("smokingAllowed", l.smokingAllowed, (v) => (next.smokingAllowed = v));
  take("couplesAllowed", l.couplesAllowed, (v) => (next.couplesAllowed = v));
  take("selfCheckin", l.selfCheckin, (v) => (next.selfCheckin = v));

  // Carried across UNCHANGED. Portals quote a calendar month and this field is
  // thirty days flat (ADR-023); multiplying by 30/31 would be a guess about the
  // owner's intent landing in the one field with contract consequences, and the
  // step-6 banner says so instead.
  take("price", p.priceNumber, (v) => (nextPricing.priceNumber = v));
  take("depositAmount", p.depositAmount, (v) => (nextPricing.depositAmount = v));
  take("billsPolicy", p.billsPolicy, (v) => (nextPricing.billsPolicy = v as HostPricing["billsPolicy"]));
  take("utilitiesCapEur", p.utilitiesCapEur, (v) => (nextPricing.utilitiesCapEur = v));
  take("minStayMonths", p.minStayMonths, (v) => (nextPricing.minStayMonths = v));

  next.imported = applied;
  return { listing: next, pricing: nextPricing, imported: applied };
}

/** Editing a field clears its mark PERMANENTLY. Do not re-mark on undo: the
 *  marks that remain are exactly the values nobody has looked at, and that is
 *  the whole trust mechanism. */
export const clearMark = (imported: string[] | null, key: string): string[] =>
  (imported ?? []).filter((k) => k !== key);

const STAGE_KEYS = ["fetching", "reading", "matching"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export type StageLine = { key: StageKey };

/** The three status lines. A pipeline may report only done/failed on day one,
 *  so the clock advances them and a real reported stage always overrides the
 *  estimate. No percentage anywhere: the duration is not knowable, and a bar
 *  that stalls at 80% is a lie with a number on it. */
export function stageLine(stage: ImportStage, elapsedMs: number): StageLine {
  const byClock = elapsedMs < 12_000 ? 0 : elapsedMs < 26_000 ? 1 : 2;
  const reported = STAGE_KEYS.indexOf(stage as StageKey);
  return { key: STAGE_KEYS[Math.max(byClock, reported)] };
}

export const POLL_MS = 2_000;
export const POLL_CEILING_MS = 5 * 60_000;

/** 2s while the wait is still short, 5s after the first minute. A read that is
 *  going to take fifty seconds does not need twenty-five polls in its last
 *  half. */
export const pollDelay = (elapsedMs: number) => (elapsedMs < 60_000 ? POLL_MS : 5_000);

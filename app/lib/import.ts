import type { HostListing, HostPricing, ImportResult, ImportStage } from "@/lib/api";
import { canonical, paragraphDoc } from "@/lib/rich-text";

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

/** Where each key's value LIVES, so an edit to it can be recognised.
 *
 *  The wizard owns no fields — every step wraps a component the listing editor
 *  already uses, and those hand back a whole `HostListing` rather than "the
 *  postcode changed". So which key an owner just edited is READ BACK from the
 *  change, not reported by the control: the alternative is threading a
 *  key-reporting callback through twenty-five controls in six shared
 *  components, which is twenty-five chances for one of them to forget.
 *
 *  Total, not partial, on purpose: a key `mergeImport` can fill and this table
 *  has no reader for is a mark that can never clear, and the compiler is the
 *  only thing that will notice. */
type KeyReader =
  | { on: "listing"; read: (l: HostListing) => unknown }
  | { on: "pricing"; read: (p: HostPricing) => unknown };

const VALUE_OF: Record<ImportKey, KeyReader> = {
  address: { on: "listing", read: (l) => l.address ?? null },
  postcode: { on: "listing", read: (l) => l.postcode ?? null },
  // One answer, two numbers: a drag moves both, and a mark per coordinate
  // would be a mark on half a pin.
  pin: { on: "listing", read: (l) => [l.lat, l.lng] },
  area: { on: "listing", read: (l) => [l.area?.es ?? null, l.area?.en ?? null] },
  cadastralRef: { on: "listing", read: (l) => l.cadastralRef ?? null },
  name: { on: "listing", read: (l) => l.name },
  type: { on: "listing", read: (l) => l.type },
  sizeM2: { on: "listing", read: (l) => l.sizeM2 },
  bedrooms: { on: "listing", read: (l) => l.bedrooms },
  bathrooms: { on: "listing", read: (l) => l.bathrooms },
  guests: { on: "listing", read: (l) => l.guests },
  floorNumber: { on: "listing", read: (l) => l.floorNumber ?? null },
  energyRating: { on: "listing", read: (l) => l.energyRating ?? null },
  // `canonical`, not raw JSON: a rich-text document compared field-by-field
  // depends on key order and on absent-versus-null at every node, and a false
  // difference here would clear the mark on a paragraph nobody has read — the
  // same hazard `changedSections` documents for the editor's dirty check.
  copy: { on: "listing", read: (l) => [canonical(l.copy?.es), canonical(l.copy?.en)] },
  details: { on: "listing", read: (l) => [l.details?.es ?? null, l.details?.en ?? null] },
  beds: { on: "listing", read: (l) => [l.beds?.es ?? null, l.beds?.en ?? null] },
  amenities: { on: "listing", read: (l) => l.amenities },
  petsAllowed: { on: "listing", read: (l) => l.petsAllowed },
  smokingAllowed: { on: "listing", read: (l) => l.smokingAllowed },
  couplesAllowed: { on: "listing", read: (l) => l.couplesAllowed },
  selfCheckin: { on: "listing", read: (l) => l.selfCheckin },
  price: { on: "pricing", read: (p) => p.priceNumber },
  billsPolicy: { on: "pricing", read: (p) => p.billsPolicy },
  utilitiesCapEur: { on: "pricing", read: (p) => p.utilitiesCapEur ?? null },
  depositAmount: { on: "pricing", read: (p) => p.depositAmount ?? null },
  minStayMonths: { on: "pricing", read: (p) => p.minStayMonths },
};

const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

/** Which import keys this listing edit touched. Feeds both halves of the same
 *  promise: the key goes into `touched` so an arriving read may not overwrite
 *  it, and its mark is cleared so the glyph stops claiming nobody has looked. */
export const editedListingKeys = (before: HostListing, after: HostListing): ImportKey[] =>
  IMPORT_KEYS.filter((k) => {
    const r = VALUE_OF[k];
    return r.on === "listing" && differs(r.read(before), r.read(after));
  });

/** …and the same for the pricing block, which the wizard holds separately. */
export const editedPricingKeys = (before: HostPricing, after: HostPricing): ImportKey[] =>
  IMPORT_KEYS.filter((k) => {
    const r = VALUE_OF[k];
    return r.on === "pricing" && differs(r.read(before), r.read(after));
  });

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

/** The three stages a job stops at. The poll schedules no further round after
 *  one of these, and nothing else in the client may decide "is it over" by
 *  listing stages of its own. */
const TERMINAL_STAGES = new Set<ImportStage>(["done", "failed", "cancelled"]);
export const isTerminalStage = (stage: ImportStage) => TERMINAL_STAGES.has(stage);

/** Every error code an owner can be shown, from the four endpoints' 4xx and
 *  from a job's own `error.code`. Mirrors `ImportErrors.Failures` plus the
 *  rejection codes in api/Functions/ImportFunctions.cs and ImportWrites.cs —
 *  a drift here is a code that reaches an owner as the generic "not saved".
 *
 *  `bad_url` is the one no endpoint emits: the client refuses an unparseable
 *  link before it is ever sent, and the copy exists so that refusal has words. */
export const IMPORT_ERROR_CODES = [
  "unsupported_host", "bad_url", "body_required",
  "too_many_imports", "daily_import_limit",
  "job_finished", "cancel_conflict", "result_invalid",
  "login_wall", "not_found", "withdrawn", "unreadable", "timeout", "pipeline_error",
] as const;

export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

/** `unsupported_host` → `errorUnsupportedHost`. One table serves the 4xx from
 *  `POST /import` and the job's own `error.code`, so a code cannot be given
 *  copy in one place and left generic in the other. A key this produces that
 *  no message file has is a silent fall back to "something went wrong" —
 *  which is what `import.test.ts` asserts against, in both locales. */
export const importErrorKey = (code: string) =>
  `error${code
    .split("_")
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join("")}`;

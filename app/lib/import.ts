import type { HostListing, HostPricing, ImportResult, ImportStage } from "@/lib/api";
import { AMENITY_KEYS } from "@/lib/amenity-icons";
import { canonical, paragraphDoc } from "@/lib/rich-text";
// Type only, and erased at build: it buys the compiler's check on the two
// policy-step literals below without this module gaining a runtime dependency
// on the wizard's own ordering.
import type { StepKey } from "@/lib/wizard";

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

/** The amenity vocabulary, as a lookup. Ours, not any portal's. */
const KNOWN_AMENITIES = new Set<string>(AMENITY_KEYS);

// ------------------------------------------------------------
// The step banner's two lines, as a decision rather than as nested ternaries
// inside a component. It is the same argument this file opens with — a banner
// and twenty-odd marks all state things about one job, and computed at each
// site they are chances to disagree — and it earns its place here because the
// table is four cases wide and two reviews found it wrong.
// ------------------------------------------------------------

/** The eyebrow answers "is there anything on this step nobody has read yet". */
export type BannerEyebrow = "policy" | "justLanded" | "from" | "nothing";

/** The body answers "did the portal send anything for this step" — a different
 *  question, and `silent` is the answer when we honestly cannot tell. */
export type BannerBody = "policy" | "key" | "nothing" | "silent";

/** The two steps an import is not allowed to fill, whatever the portal had. */
const POLICY_STEPS = new Set<StepKey>(["photos", "paperwork"]);

/** The steps an import key can reach at all.
 *
 *  Read in ONE direction only. A step ABSENT from this set can never receive
 *  anything, so "the portal had nothing for this step" is certain there rather
 *  than guessed — `nearby` is the case, by design, because nothing an advert
 *  publishes belongs in a measured walking time.
 *
 *  The converse does NOT hold and must never be used: that a step COULD have
 *  received something says nothing about whether THIS import did, and reading
 *  it that way is precisely what made an unfilled step contradict itself —
 *  an eyebrow saying nothing is here above a body offering the key to marks
 *  that do not exist. */
const REACHABLE_STEPS = new Set<string>(IMPORT_KEYS.map((k) => IMPORT_STEP_OF[k]));

/**
 * What the banner says on this step.
 *
 * The two lines answer DIFFERENT questions and must read from different
 * sources, which is the bug this shape exists to prevent:
 *
 *   · the eyebrow is about REVIEW, so it reads the live marks — they shrink as
 *     the owner works, which is exactly what it is reporting;
 *   · the body is about ARRIVAL, so it reads `arrived`, which never shrinks.
 *     Reading it off the live set turned "the portal had nothing for this
 *     step" into a lie about a step the owner had just finished reviewing —
 *     the normal end state of using the feature, which every step reaches.
 *
 * `arrived` is null on a resumed draft: the arrival set is not persisted, so
 * after a reload we know an import happened and what is still marked, and
 * nothing else. Both constant fallbacks are wrong there —
 *
 *   · always "something arrived" makes an unfilled step contradict itself,
 *     eyebrow saying nothing is here while the body offers a key to marks that
 *     do not exist;
 *   · always "nothing arrived" makes a step that still carries live marks deny
 *     the very fields it is marking.
 *
 * So it says less instead of saying something false. Live marks are PROOF
 * something arrived, and stand in for the arrival set; with no marks left
 * there is genuinely no way to tell a step that received nothing from one that
 * has been read, and the body is dropped entirely rather than guessed.
 *
 * The one exception is where that ignorance does not apply: on a step no key
 * can reach (`REACHABLE_STEPS`), nothing CAN have arrived, so the true
 * sentence is still available and is still said.
 */
export function bannerVariant(
  step: StepKey,
  /** Still marked — what nobody has looked at yet. */
  imported: string[],
  /** What the read actually filled, or null on a resumed draft. */
  arrived: string[] | null,
  justLanded: boolean,
): { eyebrow: BannerEyebrow; body: BannerBody; caution: boolean } {
  if (POLICY_STEPS.has(step))
    return { eyebrow: "policy", body: "policy", caution: false };

  const here = (keys: string[]) => keys.some((k) => IMPORT_STEP_OF[k as ImportKey] === step);
  const unreviewed = here(imported);
  // GATED ON THIS STEP, and that gate is the whole point. `justLanded` is a
  // fact about the SESSION — a result landed while the owner was in the form —
  // and it outranks everything below it in this ladder, so ungated it says
  // "just arrived from Idealista" on all nine steps including the ones the
  // import never touched. Over a body reading "Idealista had nothing for this
  // step", which is the same self-contradiction the `arrived`/`imported` split
  // above exists to prevent, pointed the other way.
  const landedHere = justLanded && here(arrived ?? []);

  return {
    eyebrow: landedHere ? "justLanded" : unreviewed ? "from" : "nothing",
    body:
      arrived !== null
        ? here(arrived)
          ? "key"
          : "nothing"
        : unreviewed
          ? "key"
          : REACHABLE_STEPS.has(step)
            ? "silent"
            : "nothing",
    // The calendar-month caution. On the REVIEW question, not the arrival one:
    // it is a thing to go and check, and once every price on the step has been
    // looked at there is nothing left to check. Independent of `justLanded`,
    // which changes how loudly the banner announces itself and not whether the
    // price still wants checking.
    caution: step === "pricing" && unreviewed,
  };
}

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

  // The vocabulary is OURS, and a portal's word for a washing machine is not
  // in it. An unknown key is DROPPED rather than stored, because the server
  // deliberately checks an amenity's SHAPE and not its membership
  // (`api/Models/HostWrites.cs` — "shipping a new amenity never needs an API
  // deploy"), so a lowercase stray like `elevator` passes validation, is
  // written to the document, and then renders as nothing anywhere: it matches
  // no icon, no translation and no search filter. Silent loss on a field whose
  // whole purpose is being filterable.
  //
  // And if nothing survives the filter there is no MARK either — `undefined`
  // takes `take`'s early return. A glyph on an untouched grid would claim we
  // filled something we did not, which is the one thing the marks may never do.
  const amenities = l.amenities?.filter((a) => KNOWN_AMENITIES.has(a));
  take("amenities", amenities?.length ? amenities : undefined, (v) => (next.amenities = v));
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

/**
 * Do these two listings disagree about the import?
 *
 * A cleared mark is a fact the SERVER has to learn, and it is the only kind of
 * change to a listing that moves no field. `changedSections` cannot answer
 * this and must not learn to: it drives the editor's dirty indicator and
 * `goesBackToReview`, and neither has any business reacting to a glyph.
 *
 * Without this the wizard's save gate silently drops three cases, all of which
 * come back as a re-marked field on the next reload:
 *   · a PRICING edit — it clears a mark that lives on the listing, but only
 *     trips `pricingDirty`, and the pricing endpoint carries no marks;
 *   · an exact revert — type a character and delete it, and the mark is gone
 *     while every section is identical to the baseline again;
 *   · an import that filled ONLY pricing keys — `imported` and `importSource`
 *     are set with no listing section dirty, so the banner does not survive
 *     the first reload either.
 *
 * Order-insensitive: `mergeImport` emits its keys in a fixed order and the
 * round trip has no reason to reorder them, but a save gate that fires forever
 * because the server sorted an array is a worse failure than the one this
 * prevents. Duplicates cannot occur — `mergeImport` appends each key once.
 */
export function marksDiffer(a: HostListing, b: HostListing): boolean {
  if (a.importSource !== b.importSource) return true;
  const left = a.imported ?? [];
  const right = b.imported ?? [];
  if (left.length !== right.length) return true;
  const seen = new Set(left);
  return right.some((k) => !seen.has(k));
}

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

/** How many CONSECUTIVE failed polls the read survives. */
export const POLL_MAX_FAILURES = 2;

/** Does a failed poll get another round?
 *
 *  A single dropped response is not a dead read. The job is running on the
 *  server whatever the browser just failed to hear, and the failures this sees
 *  are overwhelmingly transient — a mobile handoff, a throttled background
 *  tab, a Functions cold start. Giving up on the first one evicts the owner to
 *  the start screen and ABANDONS a job that is still going: `?import=` is
 *  dropped, so nothing polls it again, so the reaper (which only runs on a
 *  poll) never sees it either, and it holds one of the owner's two running
 *  slots until its deadline.
 *
 *  `consecutiveFailures` counts the run, not the total: any successful poll
 *  resets it, so a read that limps through an hour of flaky network is not
 *  killed by the third failure of the hour.
 *
 *  The ceiling still wins. A poll that has been going five minutes is over
 *  regardless of why the last round failed. */
export const shouldRetryPoll = (consecutiveFailures: number, elapsedMs: number) =>
  consecutiveFailures <= POLL_MAX_FAILURES && elapsedMs < POLL_CEILING_MS;

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

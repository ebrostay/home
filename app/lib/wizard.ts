import type { HostListing, HostPricing } from "@/lib/api";
import { blockersOf, untranslated, type Blocker } from "@/lib/listing";

// ============================================================
// "Add a property" — the order of the questions, what each one needs before
// the next makes sense, and every figure the page states about its own
// progress (ADR-030).
//
// Nothing here draws anything, and nothing here knows about React. The wizard
// is a long page with a lot of arithmetic on screen — a progress bar, a
// counter, a time estimate, nine rail discs, a submit gate — and every one of
// those is a statement about the same two objects. Computed in the page they
// would be nine chances to disagree; the handoff's own rule was "no step
// hardcodes a number another step also shows".
// ============================================================

/** The order an owner can answer them in: where it is → what is around it →
 *  what it is → what it looks like → how you'd describe it → what it comes
 *  with → what it costs → your rules → the paperwork.
 *
 *  **Address leads** rather than following Basics, and that is the load-
 *  bearing one: the geocoder fills the postcode, the neighbourhood and the
 *  pin, so every later step starts populated. Nearby is second because it
 *  measures from that pin and cannot run before there is one. */
export const STEPS = [
  "address",
  "nearby",
  "basics",
  "photos",
  "description",
  "amenities",
  "pricing",
  "rules",
  "paperwork",
] as const;

export type StepKey = (typeof STEPS)[number];

/** Steps with an escape hatch. It advances exactly like Continue — the
 *  difference is permission, not behaviour. Photos and nearby places are both
 *  things an owner may not have to hand at the desk they are sitting at. */
export const SKIPPABLE = new Set<StepKey>(["nearby", "photos"]);

/** The step that owns the draft's creation. Everything before it is local;
 *  from here on there is a real document and a real id (ADR-030 Decision 2). */
export const CREATES_DRAFT: StepKey = "address";

/** Roughly how long the whole thing takes, in minutes — the one number on the
 *  page that is a promise rather than a fact, which is why it is stated once. */
const TOTAL_MINUTES = 12;

/** An empty listing, for the steps that run before the document exists.
 *  Mirrors `PropertyDoc`'s own defaults so the first save changes nothing the
 *  owner did not type. */
export function blankListing(): HostListing {
  return {
    name: "",
    type: "apartment",
    address: "",
    postcode: "",
    cadastralRef: null,
    lat: 0,
    lng: 0,
    area: null,
    copy: null,
    copyEnApproved: false,
    details: null,
    beds: null,
    guests: 0,
    bedrooms: 0,
    bathrooms: 0,
    sizeM2: 0,
    floorNumber: null,
    energyRating: null,
    amenities: [],
    petsAllowed: false,
    smokingAllowed: false,
    couplesAllowed: false,
    selfCheckin: false,
    photos: [],
    nearby: [],
  };
}

/** …and the pricing block beside it. `maxStayMonths` and the platform
 *  cleaning fee are policy: the API overwrites both on the first read, and
 *  these are only what the page shows for the second or two before it. */
export function blankPricing(): HostPricing {
  return {
    priceNumber: 0,
    depositAmount: null,
    billsPolicy: "excluded",
    utilitiesCapEur: null,
    minStayMonths: 1,
    maxStayMonths: 11,
    turnoverDays: 3,
    cleaningBy: "platform",
    cleaningFeeEur: null,
    platformCleaningFeeEur: 0,
  };
}

// ------------------------------------------------------------
// Two different questions, and the handoff conflated them.
//
// A STEP gates on what the following steps need to work — a pin before the
// nearby search that measures from it, an address before photos are worth
// taking. Everything else is reported at SUBMIT. A wizard that stops you at
// step 4 for something you meant to do at step 8 is a wizard you fight.
// ------------------------------------------------------------

/** Why Continue is not available yet. Empty means it is. */
export function stepBlockers(
  step: StepKey,
  listing: HostListing,
  pricing: HostPricing,
): string[] {
  const out: string[] = [];

  if (step === "address") {
    if (!listing.address?.trim()) out.push("street");
    // Present AND well-formed. `postcodeValid` in lib/listing allows empty,
    // because there it is checking a shape, not a presence.
    if (!/^[0-9]{5}$/.test(listing.postcode?.trim() ?? "")) out.push("postcode");
    // A pin at 0,0 is in the Gulf of Guinea and is what an ungeocoded listing
    // carries — the same test `blockersOf` makes, for the same reason.
    if (listing.lat === 0 && listing.lng === 0) out.push("pin");
  }

  if (step === "basics") {
    if (!listing.name.trim()) out.push("name");
    if (listing.sizeM2 <= 0) out.push("size");
    if (listing.bedrooms <= 0) out.push("bedrooms");
    if (listing.bathrooms <= 0) out.push("bathrooms");
  }

  // Spanish only. The English is gated at submit, where the approval it needs
  // can also be asked for — requiring both here would strand an owner who
  // writes the Spanish now and the English tonight.
  if (step === "description" && !listing.copy?.es?.trim()) out.push("copyEs");

  if (step === "pricing" && pricing.priceNumber <= 0) out.push("price");

  return out;
}

// ------------------------------------------------------------
// Submit.
//
// `blockersOf` is the editor's list and most of this one: the two pages ask
// for the same listing, so they must not disagree about what a good one is.
// What it does not cover is the four checks the API's own submit gate makes
// that the editor has no reason to make — an editor is never looking at a
// listing that has never had a name.
//
// This list must stay equal to `HostProjection.Sections` in
// api/Models/HostModels.cs. Server-side that gate is what refuses the write;
// here it is what stops us presenting a Send button that bounces.
// ------------------------------------------------------------

export type SubmitBlocker =
  | Exclude<Blocker, { key: "missingTranslation"; count: number }>
  | { key: "untransArea" }
  | { key: "untransCopy" }
  | { key: "untransDetails" }
  | { key: "untransBeds" }
  | { key: "noName" }
  | { key: "noCapacity" }
  | { key: "noPrice" }
  | { key: "noDeposit" };

export function submitBlockers(
  listing: HostListing,
  pricing: HostPricing,
): SubmitBlocker[] {
  // The editor's aggregate "N fields untranslated" is replaced with the
  // fields' NAMES. The editor can afford the count — every bilingual field it
  // owns is one page-scroll away. Here they are split across two steps
  // (`area` is asked with the address, the other three with the description),
  // and an owner sent to the wrong step by an unnamed count has no way to
  // find the one empty box. This is the bug that stranded the first real
  // walkthrough: the geocoder had filled only the Spanish zone.
  const out: SubmitBlocker[] = blockersOf(listing).filter(
    (b): b is Exclude<Blocker, { key: "missingTranslation"; count: number }> =>
      b.key !== "missingTranslation",
  );
  for (const field of untranslated(listing)) {
    out.push({
      key: (`untrans${field[0].toUpperCase()}${field.slice(1)}`) as
        | "untransArea"
        | "untransCopy"
        | "untransDetails"
        | "untransBeds",
    });
  }

  if (!listing.name.trim()) out.push({ key: "noName" });
  if (
    listing.guests <= 0 ||
    listing.bedrooms <= 0 ||
    listing.bathrooms <= 0 ||
    listing.sizeM2 <= 0
  )
    out.push({ key: "noCapacity" });
  if (pricing.priceNumber <= 0) out.push({ key: "noPrice" });
  // The deposit and its ceiling travel together: a listing that offers capped
  // bills without saying the cap has not answered the question.
  if (
    !(pricing.depositAmount && pricing.depositAmount > 0) ||
    (pricing.billsPolicy === "capped" &&
      !(pricing.utilitiesCapEur && pricing.utilitiesCapEur > 0))
  )
    out.push({ key: "noDeposit" });

  return out;
}

/** Which step an owner has to go back to in order to clear a blocker. This is
 *  the whole reason the rail can show an amber disc rather than a modal
 *  listing everything that is wrong. */
export const STEP_OF: Record<SubmitBlocker["key"], StepKey> = {
  noAddress: "address",
  // The zone is an ADDRESS answer — the geocoder fills it there, and its
  // English box is there. Routing it to Description with the other bilingual
  // fields is exactly the dead end the per-field split exists to prevent.
  untransArea: "address",
  nearbyTypeEnMissing: "nearby",
  nearbyNeedsCheck: "nearby",
  noName: "basics",
  noCapacity: "basics",
  noPhotos: "photos",
  untransCopy: "description",
  untransDetails: "description",
  untransBeds: "description",
  enNotApproved: "description",
  noAmenities: "amenities",
  noPrice: "pricing",
  noDeposit: "pricing",
};

/** The steps carrying an unmet requirement — the rail's amber discs. */
export function attentionSteps(blockers: SubmitBlocker[]): Set<StepKey> {
  return new Set(blockers.map((b) => STEP_OF[b.key]));
}

// ------------------------------------------------------------
// Derived progress. Every figure in the card's header comes from here, and
// all three are functions of the step index and nothing else.
// ------------------------------------------------------------

export type Progress = {
  /** Whole percent, for the track's fill. */
  percent: number;
  /** 1-based, for "Step N of M". */
  position: number;
  total: number;
  /** Never 0: an estimate that reaches zero while there is still a step on
   *  screen reads as a stopped clock, not as nearly-done. */
  minutesLeft: number;
};

export function progressAt(step: number): Progress {
  const total = STEPS.length;
  const position = Math.min(total, Math.max(1, step + 1));
  return {
    percent: Math.round((position / total) * 100),
    position,
    total,
    minutesLeft: Math.max(1, Math.round(TOTAL_MINUTES * (1 - step / total))),
  };
}

/** Clamp a step index onto the rail. Every jump goes through this, so an id
 *  in a URL or a stale index in a restored draft cannot land the page on a
 *  step that does not exist. */
export const clampStep = (i: number) => Math.max(0, Math.min(STEPS.length - 1, i));

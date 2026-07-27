import type { Bilingual, HostListing } from "@/lib/api";
import { AMENITY_KEYS } from "@/lib/amenity-icons";

// ============================================================
// The diff IS the page (ADR-027).
//
// The listing editor asks one question the whole time it is open: what have I
// changed, and what will go back to review when I save? Every signal on screen
// answers it — the rail's discs, the save-bar chips, the count in "3 unsaved
// changes", the review note, whether Save is live. So the comparison happens
// exactly once, here, and everything downstream reads its result.
//
// Manage's per-section saves earned their own dirty flags because each section
// is a separate decision. Here they would be six copies of one question, and
// the first time two of them disagreed the owner would be told a section is
// clean while its chip says otherwise.
// ============================================================

export const SECTIONS = [
  "basics",
  "address",
  "photos",
  "description",
  "amenities",
  "terms",
] as const;

export type SectionKey = (typeof SECTIONS)[number];

/** Sections whose change is a new claim about the home, and therefore sends an
 *  approved listing back to the queue. The server decides this for real (from
 *  `status`, §2.2.1) — this set only lets the save bar say so beforehand.
 *
 *  Today every section is reviewable, which is the honest state of things: the
 *  editor holds only content. It stays a set rather than a boolean because the
 *  moment one non-reviewable field lands here, a boolean would quietly lie. */
const REVIEWABLE = new Set<SectionKey>(SECTIONS);

/** What each section owns. The one place a field is assigned to a section —
 *  the rail, the chips and the review note all follow from it. */
const FIELDS: Record<SectionKey, (l: HostListing) => unknown[]> = {
  basics: (l) => [
    l.name,
    l.type,
    l.guests,
    l.bedrooms,
    l.bathrooms,
    l.sizeM2,
    l.floorNumber,
    l.energyRating,
  ],
  address: (l) => [l.address, l.postcode, l.cadastralRef, l.lat, l.lng, ...bi(l.area)],
  // Order is content: it decides the cover photo and the order a guest swipes
  // through the gallery, so a reorder is a change like any other.
  photos: (l) => l.photos.map((p) => `${p.url}|${p.isFloorplan}`),
  description: (l) => [
    ...bi(l.copy),
    l.copyEnApproved,
    ...bi(l.details),
    ...bi(l.beds),
  ],
  amenities: (l) => [...l.amenities],
  terms: (l) => [l.petsAllowed, l.smokingAllowed, l.couplesAllowed, l.selfCheckin],
};

/** Bilingual values flattened to a fixed pair. Comparing the objects directly
 *  would make the result depend on key order, and `{es, en}` built in the
 *  client is not the same string as `{es, en}` parsed from the API when one
 *  side is absent rather than null. */
const bi = (b: Bilingual | null): (string | null)[] => [b?.es ?? null, b?.en ?? null];

/** The sections that differ from the saved baseline, in rail order. */
export function changedSections(value: HostListing, base: HostListing): SectionKey[] {
  return SECTIONS.filter(
    (key) => JSON.stringify(FIELDS[key](value)) !== JSON.stringify(FIELDS[key](base)),
  );
}

export const goesBackToReview = (changed: SectionKey[]) =>
  changed.some((key) => REVIEWABLE.has(key));

// ------------------------------------------------------------
// Completeness — the ledger beside the title.
//
// Unlike Manage's ledger these are not money; they are the four things an
// owner can fix on this page that decide whether the listing is any good.
// Every one is computed from the WORKING value, so a figure moves while the
// owner is still fixing it — a completeness stat that only updates on save is
// a stat nobody trusts.
// ------------------------------------------------------------

/** The bilingual fields a listing must carry in both languages. Mirrors four
 *  of the API's submit-for-review checks (`HostProjection.Sections`); the
 *  others belong to Manage's half of the document and are not editable here. */
const BILINGUAL: (keyof HostListing)[] = ["area", "copy", "details", "beds"];

export type Completeness = {
  photos: number;
  floorplans: number;
  /** Fields filled in in BOTH languages, of `BILINGUAL.length`. */
  bilingual: number;
  bilingualTotal: number;
  amenities: number;
  amenitiesTotal: number;
};

export function completenessOf(l: HostListing): Completeness {
  return {
    photos: l.photos.filter((p) => !p.isFloorplan).length,
    floorplans: l.photos.filter((p) => p.isFloorplan).length,
    bilingual: BILINGUAL.filter((key) => bothLanguages(l[key] as Bilingual | null)).length,
    bilingualTotal: BILINGUAL.length,
    amenities: l.amenities.length,
    amenitiesTotal: AMENITY_KEYS.length,
  };
}

const bothLanguages = (b: Bilingual | null) =>
  !!b?.es?.trim() && !!b?.en?.trim();

// ------------------------------------------------------------
// Blockers — what still stands between this and a listing worth publishing.
//
// Shown in the save bar only while it is CLEAN, so the bar always says
// something useful: while you are editing it reports the edit, and the moment
// you save it goes back to reporting the gap.
// ------------------------------------------------------------

export type Blocker =
  | { key: "noPhotos" }
  | { key: "noAddress" }
  | { key: "noAmenities" }
  | { key: "missingTranslation"; count: number }
  | { key: "enNotApproved" };

export function blockersOf(l: HostListing): Blocker[] {
  const out: Blocker[] = [];
  if (l.photos.every((p) => p.isFloorplan)) out.push({ key: "noPhotos" });
  // A pin at 0,0 is in the Gulf of Guinea, and it is what an ungeocoded
  // listing carries — so it counts as no address, not as an address.
  if (!l.address?.trim() || (l.lat === 0 && l.lng === 0)) out.push({ key: "noAddress" });
  if (l.amenities.length === 0) out.push({ key: "noAmenities" });

  const missing = BILINGUAL.filter(
    (key) => !bothLanguages(l[key] as Bilingual | null),
  ).length;
  if (missing > 0) out.push({ key: "missingTranslation", count: missing });

  // Only worth saying once there is English to approve.
  if (l.copy?.en?.trim() && !l.copyEnApproved) out.push({ key: "enNotApproved" });

  return out;
}

/** Sections with something still missing in them. The rail's amber state, and
 *  the same conditions the blockers report — stated once here so the disc and
 *  the save bar can never disagree about whether a section is finished.
 *
 *  Edited beats attention on the same section: once an owner is working in a
 *  section, what they need to know is that the change is captured. */
export function attentionOf(l: HostListing): Set<SectionKey> {
  const out = new Set<SectionKey>();
  if (!l.name.trim() || l.sizeM2 === 0 || l.bedrooms === 0) out.add("basics");
  if (!l.address?.trim() || (l.lat === 0 && l.lng === 0) || !bothLanguages(l.area))
    out.add("address");
  if (l.photos.every((p) => p.isFloorplan)) out.add("photos");
  if (
    !bothLanguages(l.copy) ||
    !bothLanguages(l.details) ||
    !bothLanguages(l.beds) ||
    (!!l.copy?.en?.trim() && !l.copyEnApproved)
  )
    out.add("description");
  if (l.amenities.length === 0) out.add("amenities");
  return out;
}

// ------------------------------------------------------------
// Limits — mirrored from api/Models/HostWrites.cs.
//
// Here so a field can stop an owner at the boundary instead of letting the
// server reject a whole page of work over one number. The server is still the
// one that decides; these only keep the form from producing a payload it
// already knows will bounce.
// ------------------------------------------------------------

export const LIMITS = {
  maxName: 120,
  maxAddress: 200,
  maxArea: 120,
  maxCopy: 4_000,
  maxDetails: 2_000,
  maxBeds: 400,
  maxPhotos: 40,
  maxGuests: 32,
  maxRooms: 20,
  maxSizeM2: 2_000,
  minFloor: -2,
  maxFloor: 60,
} as const;

export const PROPERTY_TYPES = ["apartment", "room", "home"] as const;
export const ENERGY_RATINGS = ["A", "B", "C", "D", "E", "F", "G"] as const;

/** Postcode as the API validates it, so the field can say so before the save
 *  does. Empty is allowed — the check is on shape, not on presence. */
export const postcodeValid = (v: string) => v.trim() === "" || /^[0-9]{5}$/.test(v.trim());

export const cadastreValid = (v: string) =>
  v.trim() === "" || /^[A-Za-z0-9]{14,20}$/.test(v.trim());

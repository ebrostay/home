import type { Bilingual, HostListing, HostPhoto } from "@/lib/api";
import { AMENITY_KEYS } from "@/lib/amenity-icons";
import {
  canonical,
  isEmptyDoc,
  remapPlaceIds,
  validateDoc,
  type BilingualDoc,
  type RichError,
  type RichNode,
  type RichRefs,
} from "@/lib/rich-text";

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
  "nearby",
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
  // What the owner CHOSE — not what we measured. Reach figures are recomputed
  // server-side and can change with no owner action, so comparing them would
  // light the "changed" indicator on a freshly opened page. Sorted, because
  // array order is not content here: the public page orders by time.
  nearby: (l) =>
    l.nearby
      .map((n) =>
        [n.group, n.type ?? "", n.customType?.es ?? "", n.customType?.en ?? "",
         n.name, n.lat.toFixed(6), n.lng.toFixed(6)].join("|"),
      )
      .sort(),
  // Order is content: it decides the cover photo and the order a guest swipes
  // through the gallery, so a reorder is a change like any other.
  // `hiddenFromGallery` is owner intent, like `isFloorplan` — without it here
  // an owner's toggle in `PhotoManager` never marks this section dirty and is
  // dropped on save.
  photos: (l) => l.photos.map((p) => `${p.url}|${p.isFloorplan}|${p.hiddenFromGallery}`),
  description: (l) => [
    // Documents, not strings: raw JSON.stringify would depend on key order and
    // on absent-versus-undefined at EVERY node — the hazard `bi()` documents
    // for a two-key record, multiplied by the tree. Without the canonical form
    // the "changed" indicator lights on a freshly opened page.
    canonical(l.description?.es),
    canonical(l.description?.en),
    l.descriptionEnApproved,
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
const BILINGUAL = ["area", "description", "details", "beds"] as const;

export type BilingualField = (typeof BILINGUAL)[number];

/** Which of the four still lack a language. The editor's save bar only needs
 *  the count — every bilingual field it owns is on one page. The wizard needs
 *  the NAMES, because they are not: `area` is asked on the address step and
 *  the other three on the description step, and a blocker that says "1 field
 *  untranslated" while pointing at the wrong step is a dead end an owner
 *  cannot get out of. */
export const untranslated = (l: HostListing): BilingualField[] =>
  BILINGUAL.filter((key) => !fieldHasBothLanguages(l, key));

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
    // A photo hidden from the gallery (description-only) counts no more than
    // a floor plan does — otherwise a listing whose only non-floorplan photo
    // is hidden reads complete here while the gallery it describes is empty.
    photos: l.photos.filter((p) => !p.isFloorplan && !p.hiddenFromGallery).length,
    floorplans: l.photos.filter((p) => p.isFloorplan).length,
    bilingual: BILINGUAL.filter((key) => fieldHasBothLanguages(l, key)).length,
    bilingualTotal: BILINGUAL.length,
    amenities: l.amenities.length,
    amenitiesTotal: AMENITY_KEYS.length,
  };
}

const bothLanguages = (b: Bilingual | null) =>
  !!b?.es?.trim() && !!b?.en?.trim();

/** The document equivalent of `bothLanguages` — mirrors the server's
 *  `Both(BilingualDoc?)` in `api/Models/HostModels.cs`: existing is not
 *  enough, a `doc` with an empty `content` array, or one holding only a photo
 *  chip, is not a written description, so this counts WORDS, not presence.
 *  `isEmptyDoc` is exactly that test (`textLength() === 0`), applied per
 *  language. Client and server disagreeing about whether a listing is
 *  complete would be a bad bug. */
const bothLanguagesDoc = (d: BilingualDoc | null) =>
  !isEmptyDoc(d?.es) && !isEmptyDoc(d?.en);

/** `description` is a document; the other three `BILINGUAL` fields are plain
 *  strings. One list drives both `untranslated` and `completenessOf`, so the
 *  runtime check lives here rather than duplicated at each call site. */
const fieldHasBothLanguages = (l: HostListing, key: BilingualField): boolean =>
  key === "description" ? bothLanguagesDoc(l.description) : bothLanguages(l[key] as Bilingual | null);

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
  | { key: "enNotApproved" }
  | { key: "nearbyTypeEnMissing" }
  | { key: "nearbyNeedsCheck" };

/** A nearby entry using the Spanish-first custom-type escape hatch (ADR-028
 *  Decision 7) with no English yet — it falls back to Spanish on the public
 *  page, same as `enNotApproved` falls back for the description, and is
 *  flagged here the same way. */
const nearbyTypeEnMissing = (l: HostListing) =>
  l.nearby.some((n) => !!n.customType?.es?.trim() && !n.customType?.en?.trim());

/** A nearby entry the pin move re-measured beyond its group's radius
 *  (ADR-028 Decision 8) — earned by a measurement, never by a save. It stays
 *  visible on the public page (the figure is accurate), but an owner who
 *  never re-opens the Nearby section body should still be told. */
const nearbyNeedsCheck = (l: HostListing) => l.nearby.some((n) => n.needsCheck);

export function blockersOf(l: HostListing): Blocker[] {
  const out: Blocker[] = [];
  // A photo hidden from the gallery is no more "a photo" here than a floor
  // plan is — same fix as `completenessOf` above, same reason.
  if (l.photos.every((p) => p.isFloorplan || p.hiddenFromGallery)) out.push({ key: "noPhotos" });
  // A pin at 0,0 is in the Gulf of Guinea, and it is what an ungeocoded
  // listing carries — so it counts as no address, not as an address.
  if (!l.address?.trim() || (l.lat === 0 && l.lng === 0)) out.push({ key: "noAddress" });
  if (l.amenities.length === 0) out.push({ key: "noAmenities" });

  const missing = untranslated(l).length;
  if (missing > 0) out.push({ key: "missingTranslation", count: missing });

  // Only worth saying once there is English to approve — words, not merely a
  // document object (same test `bothLanguagesDoc` makes).
  if (!isEmptyDoc(l.description?.en) && !l.descriptionEnApproved) out.push({ key: "enNotApproved" });

  if (nearbyTypeEnMissing(l)) out.push({ key: "nearbyTypeEnMissing" });
  if (nearbyNeedsCheck(l)) out.push({ key: "nearbyNeedsCheck" });

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
  // Same fix as `completenessOf`/`blockersOf`: a hidden photo does not count.
  if (l.photos.every((p) => p.isFloorplan || p.hiddenFromGallery)) out.add("photos");
  if (
    !bothLanguagesDoc(l.description) ||
    !bothLanguages(l.details) ||
    !bothLanguages(l.beds) ||
    (!isEmptyDoc(l.description?.en) && !l.descriptionEnApproved)
  )
    out.add("description");
  if (l.amenities.length === 0) out.add("amenities");
  // Both nearby flags render only inside the Nearby section body (the
  // "needs check" chip on a single entry row, the missing-English fallback),
  // so an owner who moves their pin, saves, and never re-expands that
  // section would otherwise never be told an entry was flagged — the whole
  // point of the flag. Surfacing it on the rail disc is what makes it findable
  // without opening the section.
  if (nearbyTypeEnMissing(l) || nearbyNeedsCheck(l)) out.add("nearby");
  return out;
}

// ------------------------------------------------------------
// Description editor edits — a small, pure two-action state machine.
//
// DescriptionFields.tsx used to STAGE an upload's photo in a ref and fold it
// into whatever `setDescriptionDoc` call happened next. That "next" call is not
// guaranteed: ProseMirror's restricted heading/listItem content models
// (RichTextEditor.tsx) can make an insert a no-op — no document change, no
// `onUpdate`, no flush — so the staged photo would sit there until some
// LATER, entirely unrelated edit (any keystroke) flushed a now-stale
// snapshot, silently dropping the photo and anything edited in between.
//
// Fixed by applying each edit the instant it is known, via a functional
// `onChange`, with THIS reducer as the actual merge logic — pure, so it can
// be unit tested directly rather than trusted by inspection.
export type DescriptionEdit =
  | { type: "uploaded"; photo: HostPhoto }
  | { type: "descriptionChanged"; locale: "es" | "en"; doc: RichNode };

/** Applies one description-editor edit to the working listing.
 *
 * `"uploaded"` is an UPSERT by `url`, not a plain append: the photo may
 * already be in `listing.photos` — the page's own `onUploaded` prop (mirrors
 * `PhotoManager`'s) is what appends it there AND updates the SAVED baseline,
 * a concern this reducer does not touch — or it may not be yet, depending on
 * an ordering this function does not need to know or control. Either way the
 * result is the same, which is what removes the ordering dependency the
 * ref-staging approach had. */
export function applyDescriptionEdit(listing: HostListing, edit: DescriptionEdit): HostListing {
  switch (edit.type) {
    case "uploaded": {
      const exists = listing.photos.some((p) => p.url === edit.photo.url);
      return {
        ...listing,
        photos: exists
          ? listing.photos.map((p) => (p.url === edit.photo.url ? edit.photo : p))
          : [...listing.photos, edit.photo],
      };
    }
    case "descriptionChanged":
      return {
        ...listing,
        description: {
          es: listing.description?.es ?? null,
          en: listing.description?.en ?? null,
          [edit.locale]: edit.doc,
        },
      };
  }
}

/** Adopt the ids the server minted for nearby entries created by this save,
 *  in the form the owner still has open.
 *
 *  `NearbyEditor` mints a temporary `local-…` id for a place added but not yet
 *  saved, because the description has to be able to reference it immediately.
 *  The server replaces those with real ids and rewrites the stored
 *  description's `placeRef`s to match. Nothing rewrites the open FORM, and
 *  that is the whole problem this fixes: a form still holding `local-…` sends
 *  it again on the next save, the server recognises none of it, and every
 *  place is treated as brand new — fresh ids, discarded reach measurements,
 *  and a full round of metered routing calls, on every save for the rest of
 *  the session. Self-consistent, so nothing looks broken; purely wasted.
 *
 *  `sent` is the listing as handed to the API, NOT the current form: the
 *  mapping is positional, and only the sent array is known to line up with
 *  what came back. The server rebuilds its list in payload order, one entry
 *  per write, so `stored.nearby[i]` answers `sent.nearby[i]`.
 *
 *  `current` is read separately because the owner may have typed during the
 *  round trip; only the ids are adopted, and everything else is left as they
 *  left it. Returns `current` unchanged when no id moved, so the caller can
 *  skip the state update entirely. If the two arrays disagree on length the
 *  positional assumption is void and this does nothing rather than guess. */
export function adoptNearbyIds(
  current: HostListing,
  sent: HostListing,
  stored: HostListing,
): HostListing {
  if (sent.nearby.length !== stored.nearby.length) return current;

  const remap = new Map<string, string>();
  sent.nearby.forEach((was, i) => {
    const now = stored.nearby[i];
    if (was.id && now.id && was.id !== now.id) remap.set(was.id, now.id);
  });
  if (remap.size === 0) return current;

  const nearby = current.nearby.map((n) => {
    const id = remap.get(n.id);
    return id ? { ...n, id } : n;
  });

  const description = current.description
    ? {
        es: current.description.es ? remapPlaceIds(current.description.es, remap) : null,
        en: current.description.en ? remapPlaceIds(current.description.en, remap) : null,
      }
    : current.description;

  return { ...current, nearby, description };
}

/** The reference universe `validateDoc` checks a description's photo/place
 *  chips against — every photo and nearby id already on the INCOMING listing.
 *  Mirrors `HostWrites.CheckDetails`'s own `photoUrls`/`entryIds`, built from
 *  the payload rather than the stored document (D9): one save can both delete
 *  a photo and reference it, and validating against anything else would let
 *  a dangling reference through or refuse one this very save is about to make
 *  valid. */
export const richRefsFor = (l: HostListing): RichRefs => ({
  photoUrls: new Set(l.photos.map((p) => p.url)),
  entryIds: new Set(l.nearby.map((n) => n.id)),
});

/** Pre-empts the server's own walk (`HostValidation.RichText`, invoked from
 *  `CheckDetails` as `RichText(Es,...) ?? RichText(En,...)`) so a save can be
 *  refused before the round trip, with the same code the server would have
 *  answered — `ApiError`-driven message lookup (`host/edit/page.tsx`,
 *  `host/new/page.tsx`) handles it with no second error surface. Checks
 *  BOTH languages, same short-circuit order as the server, so a client-side
 *  pre-empt and a server 400 are never distinguishable by which document was
 *  at fault. */
export const richTextError = (l: HostListing): RichError | null => {
  const refs = richRefsFor(l);
  return validateDoc(l.description?.es ?? null, refs) ?? validateDoc(l.description?.en ?? null, refs);
};

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
  maxDescription: 4_000,
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

// ------------------------------------------------------------
// Cadastral reference check digits.
//
// The last two characters of a 20-character reference are a checksum over the
// other eighteen, so a mistyped one is detectable here, with no API call and
// no Catastro integration. That is worth having on its own: the reference
// names a specific FLAT, and Ebrostay lists several flats per building — one
// wrong character in the middle and the paperwork describes the neighbour.
//
// This is NOT verification. It proves the string is well-formed, never that
// the property exists or is this one. The MATCHED badge still waits for a real
// Catastro lookup (ADR-027).
//
// Published algorithm, verified against two real urban references
// (2339507DG6023N0009FO, 8407007UH6080N0001PH) and against the reference
// implementation over 800 generated cases. It does not cover rural references
// or the foral cadastres of Euskadi and Navarra — hence the tri-state below,
// and hence a failure is a warning in the UI rather than a rejection, and is
// not enforced server-side at all.
//
// It catches most typos but not every one, and the gap is worth knowing: the
// value table gives '1' and 'A' both the value 1, '2' and 'B' both 2, and so
// on to '9'/'I'. Swapping one for the other leaves the sum untouched, as does
// any change of exactly 23. So a clean checksum means "plausibly typed", never
// "correct".
// ------------------------------------------------------------

/** Position in this string is the character's value: A–N are 1–14, Ñ is 15,
 *  O–Z are 16–27, digits are themselves. */
const CADASTRE_ORDER = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
const CADASTRE_VALUE = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
];
const CADASTRE_WEIGHTS = [13, 15, 12, 5, 4, 17, 9, 21, 3, 7, 1];
/** The 23 characters a check digit can be, indexed by the weighted sum mod 23. */
const CADASTRE_CONTROL = "MQWERTYUIOPASDFGHJKLBZX";

function checkChar(eleven: string): string | null {
  let sum = 0;
  for (let i = 0; i < CADASTRE_WEIGHTS.length; i++) {
    const value = CADASTRE_VALUE[CADASTRE_ORDER.indexOf(eleven[i])];
    if (value === undefined) return null; // character outside the alphabet
    sum += CADASTRE_WEIGHTS[i] * value;
  }
  return CADASTRE_CONTROL[sum % 23];
}

/**
 * `true` / `false` when the checksum can be judged, `null` when it cannot —
 * which is a real answer, not a shrug. A 14-character parcel reference carries
 * no check digits, and a rural reference is checked by a different rule
 * entirely, so calling either of them wrong would be the bug.
 */
export function cadastreChecksum(raw: string): boolean | null {
  const ref = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{20}$/.test(ref)) return null;
  // Rural: two digits of province, three of municipality, then a letter.
  if (/^\d{5}[A-Z]/.test(ref)) return null;

  // First digit covers the parcel, second the map sheet — both together with
  // the four characters that name the unit inside the building.
  const first = checkChar(ref.slice(0, 7) + ref.slice(14, 18));
  const second = checkChar(ref.slice(7, 18));
  if (first === null || second === null) return null;
  return first + second === ref.slice(18, 20);
}

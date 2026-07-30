import { describe, expect, it } from "vitest";
import {
  SECTIONS,
  applyDescriptionEdit,
  attentionOf,
  blockersOf,
  changedSections,
  completenessOf,
  richTextError,
} from "./listing";
import type { HostListing, HostNearbyEntry, HostPhoto } from "./api";
import { paragraphDoc, type RichNode } from "./rich-text";

// A listing with only the fields the diff reads. Cast once here so each test
// stays about the rule under test rather than about fixture plumbing.
const base = (over: Partial<HostListing> = {}): HostListing =>
  ({
    name: "Movera 7",
    type: "apartment",
    guests: 2, bedrooms: 1, bathrooms: 1, sizeM2: 60,
    floorNumber: null, energyRating: null,
    address: "Calle", postcode: "50194", cadastralRef: null,
    lat: 41.65, lng: -0.89,
    area: null, copy: null, copyEnApproved: false, details: null, beds: null,
    amenities: [], photos: [],
    petsAllowed: false, smokingAllowed: false,
    couplesAllowed: false, selfCheckin: false,
    nearby: [],
    ...over,
  }) as HostListing;

const photo = (over: Partial<HostPhoto> = {}): HostPhoto => ({
  url: "a.webp",
  cardUrl: null,
  detailUrl: null,
  isFloorplan: false,
  sortOrder: 0,
  hiddenFromGallery: false,
  ...over,
});

// Mirrors HostNearbyEntry exactly — osmId and measuredAt are REQUIRED there,
// matching the C#, so a fixture omitting them will not typecheck.
const entry = (over: Partial<HostNearbyEntry> = {}): HostNearbyEntry => ({
  id: "a", group: "transport", type: "tram", customType: null,
  name: "Tranvía L1", lat: 41.651, lng: -0.891,
  reach: { foot: { metres: 340, minutes: 4 } },
  osmId: "node/1", measuredAt: "2026-07-28T00:00:00Z", needsCheck: false,
  ...over,
});

describe("SECTIONS", () => {
  it("includes nearby, after address", () => {
    expect(SECTIONS).toContain("nearby");
    expect(SECTIONS.indexOf("nearby")).toBe(SECTIONS.indexOf("address") + 1);
  });
});

describe("changedSections", () => {
  it("reports nothing when nothing moved", () => {
    expect(changedSections(base(), base())).toEqual([]);
  });

  it("notices an added entry", () => {
    expect(changedSections(base({ nearby: [entry()] }), base())).toEqual(["nearby"]);
  });

  it("notices a removed entry", () => {
    expect(changedSections(base(), base({ nearby: [entry()] }))).toEqual(["nearby"]);
  });

  it("notices a retyped entry", () => {
    expect(
      changedSections(
        base({ nearby: [entry({ type: "bus" })] }),
        base({ nearby: [entry()] }),
      ),
    ).toEqual(["nearby"]);
  });

  // Reach is measured server-side and can change without the owner doing
  // anything. Treating it as an edit would light the "changed" indicator on a
  // page the owner just opened — the exact bug that opened this whole thread.
  it("ignores a change to the measured figures", () => {
    expect(
      changedSections(
        base({ nearby: [entry({ reach: { foot: { metres: 999, minutes: 12 } } })] }),
        base({ nearby: [entry()] }),
      ),
    ).toEqual([]);
  });

  // Order is not content here: the public page sorts by time, so an array
  // reshuffle is not something the owner changed.
  it("ignores reordering", () => {
    const a = entry({ id: "a" });
    const b = entry({ id: "b", name: "Bus Ci1" });
    expect(changedSections(base({ nearby: [b, a] }), base({ nearby: [a, b] }))).toEqual([]);
  });
});

describe("changedSections – description document", () => {
  // Raw JSON.stringify depends on key order, and a document round-tripped
  // through the API can emit its keys in a different order than the one
  // Tiptap just built while meaning exactly the same thing. Without
  // `canonical()` the differ would light "description" as changed on a
  // freshly opened, untouched page.
  it("does not flag a document that differs only in key order", () => {
    const built: RichNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }],
    };
    const roundTripped: RichNode = {
      content: [{ content: [{ text: "Hola", type: "text" }], type: "paragraph" }],
      type: "doc",
    };
    const a = base({ copy: { es: built, en: null } });
    const b = base({ copy: { es: roundTripped, en: null } });
    expect(changedSections(a, b)).toEqual([]);
  });

  it("still flags a document whose text actually changed", () => {
    const a = base({
      copy: {
        es: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] },
        en: null,
      },
    });
    const b = base({
      copy: {
        es: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Adiós" }] }] },
        en: null,
      },
    });
    expect(changedSections(a, b)).toEqual(["description"]);
  });
});

describe("changedSections – photos", () => {
  // `hiddenFromGallery` is owner intent, like `isFloorplan` — without it in
  // the differ, toggling the gallery checkbox never marks the section dirty
  // and the toggle is silently dropped on save.
  it("flags a toggled hiddenFromGallery as changed", () => {
    const a = base({ photos: [photo({ hiddenFromGallery: true })] });
    const b = base({ photos: [photo({ hiddenFromGallery: false })] });
    expect(changedSections(a, b)).toEqual(["photos"]);
  });
});

// DescriptionFields.tsx used to stage an upload's photo in a ref and fold it
// into whichever setCopyDoc call happened next — but "next" was never
// guaranteed (ProseMirror's restricted heading/listItem content model can
// make a chip insert a no-op, so no onUpdate ever fires), so the ref could
// sit stale across arbitrarily many unrelated edits before finally flushing
// a snapshot that had fallen out of date. `applyDescriptionEdit` replaces
// that with a pure, immediate reducer — no staging, so these are the tests
// that would have caught the staging bug before it shipped.
describe("applyDescriptionEdit", () => {
  it('"uploaded" appends a photo not already on the listing', () => {
    const l = base({ photos: [photo({ url: "a.webp" })] });
    const next = applyDescriptionEdit(l, {
      type: "uploaded",
      photo: photo({ url: "b.webp", hiddenFromGallery: true }),
    });
    expect(next.photos.map((p) => p.url)).toEqual(["a.webp", "b.webp"]);
    expect(next.photos[1].hiddenFromGallery).toBe(true);
  });

  it('"uploaded" upserts by url when the photo is already present', () => {
    // Mirrors the page's own onUploaded/photosUploaded having already
    // appended the raw (unflagged) photo before this edit runs — the whole
    // point of the upsert is that this ordering does not matter.
    const l = base({ photos: [photo({ url: "b.webp", hiddenFromGallery: false })] });
    const next = applyDescriptionEdit(l, {
      type: "uploaded",
      photo: photo({ url: "b.webp", hiddenFromGallery: true }),
    });
    expect(next.photos).toHaveLength(1);
    expect(next.photos[0].hiddenFromGallery).toBe(true);
  });

  it('"copyChanged" sets one locale and leaves the other untouched', () => {
    const l = base({ copy: { es: paragraphDoc("Hola"), en: null } });
    const next = applyDescriptionEdit(l, {
      type: "copyChanged",
      locale: "en",
      doc: paragraphDoc("Hello"),
    });
    expect(next.copy).toEqual({ es: paragraphDoc("Hola"), en: paragraphDoc("Hello") });
  });

  // THE sequence round 1's ref-staging design got wrong: an upload lands,
  // then something ELSE edits `photos` (e.g. PhotoManager removing a
  // different photo elsewhere on the page) before the next copy change
  // arrives. A reducer that "remembers" the photo list from upload time and
  // reapplies it later would silently discard the edit made in between —
  // and would even resurrect a photo removed since. Because this reducer
  // touches only the field named by each edit and never remembers anything
  // between calls, neither is possible.
  it("does not clobber an unrelated photo edit made between an upload and the next copy change", () => {
    let l = base({ photos: [photo({ url: "a.webp" })] });
    l = applyDescriptionEdit(l, {
      type: "uploaded",
      photo: photo({ url: "b.webp", hiddenFromGallery: true }),
    });
    // The unrelated edit.
    l = { ...l, photos: l.photos.filter((p) => p.url !== "a.webp") };
    l = applyDescriptionEdit(l, { type: "copyChanged", locale: "es", doc: paragraphDoc("Hola") });
    expect(l.photos.map((p) => p.url)).toEqual(["b.webp"]);
    expect(l.copy?.es).toEqual(paragraphDoc("Hola"));
  });
});

// ADR-028 Decision 7: the custom-type escape hatch is Spanish required,
// English optional, falling back to Spanish with an attention flag —
// mirroring `enNotApproved`. Decision 8: a needsCheck entry is earned by a
// re-measurement, and both flags must surface outside the Nearby section
// body (the rail disc), not only inside it, or an owner who never re-opens
// the section is never told.
describe("nearby attention flags", () => {
  it("blockersOf flags a custom type with Spanish but no English", () => {
    const l = base({
      nearby: [entry({ type: null, customType: { es: "Panadería", en: null } })],
    });
    expect(blockersOf(l)).toContainEqual({ key: "nearbyTypeEnMissing" });
  });

  it("blockersOf does not flag a custom type once English is filled in", () => {
    const l = base({
      nearby: [entry({ type: null, customType: { es: "Panadería", en: "Bakery" } })],
    });
    expect(blockersOf(l)).not.toContainEqual({ key: "nearbyTypeEnMissing" });
  });

  it("blockersOf flags a needsCheck entry", () => {
    const l = base({ nearby: [entry({ needsCheck: true })] });
    expect(blockersOf(l)).toContainEqual({ key: "nearbyNeedsCheck" });
  });

  it("blockersOf reports neither flag for an ordinary entry", () => {
    const l = base({ nearby: [entry()] });
    expect(blockersOf(l)).not.toContainEqual({ key: "nearbyTypeEnMissing" });
    expect(blockersOf(l)).not.toContainEqual({ key: "nearbyNeedsCheck" });
  });

  it("attentionOf surfaces the nearby section for a Spanish-only custom type", () => {
    const l = base({
      nearby: [entry({ type: null, customType: { es: "Panadería", en: null } })],
    });
    expect(attentionOf(l).has("nearby")).toBe(true);
  });

  it("attentionOf surfaces the nearby section for a needsCheck entry", () => {
    const l = base({ nearby: [entry({ needsCheck: true })] });
    expect(attentionOf(l).has("nearby")).toBe(true);
  });

  it("attentionOf leaves the nearby section alone when nothing is flagged", () => {
    const l = base({ nearby: [entry()] });
    expect(attentionOf(l).has("nearby")).toBe(false);
  });
});

// Final-review finding (2026-07-30): completenessOf/blockersOf/attentionOf
// filtered only isFloorplan, so a listing whose only non-floorplan photo was
// hidden from the gallery (description-only) read as having a photo — it
// could be submitted and would publish with a null cover and an empty
// gallery. Same rule the server's `HostProjection.Sections` now enforces
// (`CoverPhotoTests.SectionsDoneDoesNotCountAHiddenPhotoAsAPhoto` on the API
// side): client and server are the same question asked twice.
describe("a photo hidden from the gallery does not count as a photo", () => {
  it("completenessOf counts neither a floorplan nor a hidden photo", () => {
    const l = base({ photos: [photo({ hiddenFromGallery: true })] });
    expect(completenessOf(l).photos).toBe(0);
  });

  it("completenessOf counts an ordinary visible photo", () => {
    const l = base({ photos: [photo({ hiddenFromGallery: false })] });
    expect(completenessOf(l).photos).toBe(1);
  });

  it("blockersOf flags noPhotos when the listing's only photo is hidden", () => {
    const l = base({ photos: [photo({ hiddenFromGallery: true })] });
    expect(blockersOf(l)).toContainEqual({ key: "noPhotos" });
  });

  it("blockersOf does not flag noPhotos once a visible photo joins the hidden one", () => {
    const l = base({
      photos: [photo({ hiddenFromGallery: true }), photo({ url: "b.webp", hiddenFromGallery: false })],
    });
    expect(blockersOf(l)).not.toContainEqual({ key: "noPhotos" });
  });

  it("attentionOf marks the photos section when the listing's only photo is hidden", () => {
    const l = base({ photos: [photo({ hiddenFromGallery: true })] });
    expect(attentionOf(l).has("photos")).toBe(true);
  });
});

// Final-review finding (2026-07-30): `validateDoc`'s ten rejection codes had
// no client-side caller at all — every save round-tripped to the server even
// where the answer was already knowable from the form. `richTextError` is
// that pre-empt; these pin it against the same reference universe the server
// builds from the incoming payload (`HostWrites.CheckDetails`'s `photoUrls`/
// `entryIds`), not the stored document.
describe("richTextError", () => {
  const photoRef = (url: string): RichNode => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "photoRef", attrs: { url } }] }],
  });
  const placeRef = (entryId: string): RichNode => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "placeRef", attrs: { entryId } }] }],
  });

  it("is null for a listing with no description yet", () => {
    expect(richTextError(base())).toBeNull();
  });

  it("is null for an ordinary paragraph", () => {
    const l = base({ copy: { es: paragraphDoc("Living here is quiet."), en: null } });
    expect(richTextError(l)).toBeNull();
  });

  it("flags a photo reference the listing's photos do not have", () => {
    const l = base({ copy: { es: photoRef("missing.jpg"), en: null } });
    expect(richTextError(l)).toBe("copy_photo_unknown");
  });

  it("accepts a photo reference that matches one of the listing's own photos", () => {
    const l = base({ photos: [photo({ url: "a.webp" })], copy: { es: photoRef("a.webp"), en: null } });
    expect(richTextError(l)).toBeNull();
  });

  it("flags a place reference the listing's nearby entries do not have", () => {
    const l = base({ copy: { es: placeRef("nope"), en: null } });
    expect(richTextError(l)).toBe("copy_place_unknown");
  });

  it("accepts a place reference that matches one of the listing's own nearby entries", () => {
    const l = base({ nearby: [entry({ id: "e1" })], copy: { es: placeRef("e1"), en: null } });
    expect(richTextError(l)).toBeNull();
  });

  it("checks both languages, Es short-circuiting En exactly like the server", () => {
    const l = base({ copy: { es: null, en: photoRef("missing.jpg") } });
    expect(richTextError(l)).toBe("copy_photo_unknown");
  });
});

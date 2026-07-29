import { describe, expect, it } from "vitest";
import { SECTIONS, attentionOf, blockersOf, changedSections } from "./listing";
import type { HostListing, HostNearbyEntry, HostPhoto } from "./api";
import type { RichNode } from "./rich-text";

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
  const photo = (over: Partial<HostPhoto> = {}): HostPhoto => ({
    url: "a.webp",
    cardUrl: null,
    detailUrl: null,
    isFloorplan: false,
    sortOrder: 0,
    hiddenFromGallery: false,
    ...over,
  });

  // `hiddenFromGallery` is owner intent, like `isFloorplan` — without it in
  // the differ, toggling the gallery checkbox never marks the section dirty
  // and the toggle is silently dropped on save.
  it("flags a toggled hiddenFromGallery as changed", () => {
    const a = base({ photos: [photo({ hiddenFromGallery: true })] });
    const b = base({ photos: [photo({ hiddenFromGallery: false })] });
    expect(changedSections(a, b)).toEqual(["photos"]);
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

import { describe, expect, it } from "vitest";
import { SECTIONS, changedSections } from "./listing";
import type { HostListing, HostNearbyEntry } from "./api";

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

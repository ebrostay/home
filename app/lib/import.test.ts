import { describe, expect, it } from "vitest";
import {
  IMPORT_KEYS,
  clearMark,
  matchSource,
  mergeImport,
  pollDelay,
  stageLine,
} from "./import";
import { blankListing, blankPricing } from "./wizard";
import type { ImportResult } from "./api";

const result = (over: Partial<ImportResult> = {}): ImportResult => ({
  listing: { name: "Piso en el Centro", sizeM2: 78, bedrooms: 2 },
  pricing: { priceNumber: 950 },
  imported: ["name", "sizeM2", "bedrooms", "price"],
  ...over,
});

describe("matchSource", () => {
  it("recognises the six", () => {
    expect(matchSource("https://www.idealista.com/inmueble/1/")).toBe("idealista");
    expect(matchSource("https://www.airbnb.co.uk/rooms/1")).toBe("airbnb");
    expect(matchSource("https://booking.com/hotel/es/x")).toBe("booking");
  });

  it("refuses anything else", () => {
    expect(matchSource("https://www.milanuncios.com/x")).toBeNull();
    expect(matchSource("https://airbnb.evil.com/x")).toBeNull();
    expect(matchSource("https://evilidealista.com/x")).toBeNull();
    expect(matchSource("not a url")).toBeNull();
  });
});

describe("mergeImport", () => {
  it("fills untouched fields", () => {
    const { listing, imported } = mergeImport(
      blankListing(), blankPricing(), result(), new Set());
    expect(listing.name).toBe("Piso en el Centro");
    expect(imported).toContain("name");
  });

  it("leaves a touched field alone and does not mark it", () => {
    const typed = { ...blankListing(), name: "Mi piso" };
    const { listing, imported } = mergeImport(
      typed, blankPricing(), result(), new Set(["name"]));
    expect(listing.name).toBe("Mi piso");
    expect(imported).not.toContain("name");
    // …and the rest still lands.
    expect(listing.sizeM2).toBe(78);
    expect(imported).toContain("sizeM2");
  });

  it("returns only the keys it actually applied", () => {
    const { imported } = mergeImport(
      blankListing(), blankPricing(),
      // Claims a key it sent no value for.
      result({ imported: ["name", "energyRating"] }), new Set());
    expect(imported).toEqual(["name"]);
  });

  it("wraps the Spanish description into a document", () => {
    const { listing } = mergeImport(
      blankListing(), blankPricing(),
      result({ listing: { copyEs: "Piso luminoso." }, imported: ["copy"] }),
      new Set());
    expect(listing.copy?.es?.type).toBe("doc");
    expect(listing.copy?.en).toBeNull();
  });
});

describe("clearMark", () => {
  it("removes one key and leaves its neighbours", () => {
    expect(clearMark(["name", "price", "sizeM2"], "price")).toEqual(["name", "sizeM2"]);
  });

  it("is a no-op for a key that is not marked", () => {
    expect(clearMark(["name"], "price")).toEqual(["name"]);
  });
});

describe("stageLine", () => {
  it("uses the reported stage when there is one", () => {
    expect(stageLine("matching", 500).key).toBe("matching");
  });

  it("advances on elapsed time while the pipeline only says queued", () => {
    expect(stageLine("queued", 0).key).toBe("fetching");
    expect(stageLine("queued", 30_000).key).toBe("matching");
  });

  it("never walks backwards", () => {
    // Reported 'matching' beats a young clock.
    expect(stageLine("matching", 0).key).toBe("matching");
  });
});

describe("pollDelay", () => {
  it("is 2s early and 5s after the first minute", () => {
    expect(pollDelay(1_000)).toBe(2_000);
    expect(pollDelay(90_000)).toBe(5_000);
  });
});

describe("IMPORT_KEYS", () => {
  it("holds 26 keys and no duplicates", () => {
    expect(new Set(IMPORT_KEYS).size).toBe(IMPORT_KEYS.length);
    expect(IMPORT_KEYS.length).toBe(26);
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_PLACES,
  parsePlaces,
  parseRoutes,
  putRoute,
  routeKey,
  type CachedRoute,
} from "@/lib/places";

// The store is the only part of "your places" that survives a reload, and it
// is written by a build the reading build has never met — a guest who saved
// places under the kilometres-you-typed version opens the routed one with
// that data still in localStorage. So the parsers are the contract: whatever
// is in there, what comes out is renderable.

const place = (over: Record<string, unknown> = {}) => ({
  id: "osm-1",
  label: "Calle Alfonso I 20",
  detail: "Casco Histórico · 50003",
  lat: 41.6533,
  lng: -0.8815,
  ...over,
});

const json = (v: unknown) => JSON.stringify(v);

describe("parsePlaces", () => {
  it("reads a well-formed store", () => {
    expect(parsePlaces(json([place()]))).toEqual([place()]);
  });

  it("treats an absent, empty or unparseable store as no places", () => {
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces("")).toEqual([]);
    expect(parsePlaces("{not json")).toEqual([]);
  });

  it("ignores a store that is not an array", () => {
    expect(parsePlaces(json({ id: "osm-1" }))).toEqual([]);
  });

  // The reason this file exists. The first version of the section stored a
  // label, a travel mode and a distance the guest typed; none of those can be
  // routed, so they are dropped rather than shown with a missing figure.
  it("drops entries from the pre-routing shape, which have no coordinates", () => {
    const legacy = [
      { id: "1754000000000-Work", label: "Work", mode: "tram", km: 2 },
      { id: "1754000000001-Gym", label: "Gym", mode: "walk", km: 1.2 },
    ];
    expect(parsePlaces(json(legacy))).toEqual([]);
  });

  it("keeps the good entries when only some are unreadable", () => {
    const mixed = [place({ id: "a" }), { id: "b", label: "No pin" }, place({ id: "c" })];
    expect(parsePlaces(json(mixed)).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it.each([
    ["a missing id", place({ id: undefined })],
    ["an empty id", place({ id: "" })],
    ["a missing label", place({ label: undefined })],
    ["a non-numeric lat", place({ lat: "41.65" })],
    ["a NaN lng", place({ lng: Number.NaN })],
  ])("drops an entry with %s", (_why, bad) => {
    expect(parsePlaces(json([bad]))).toEqual([]);
  });

  // The second line is the barrio and postcode, which OSM does not always
  // know. Absent, it is empty and the row simply has one line — never the
  // label repeated under itself.
  it("leaves the detail line empty when an entry carries none", () => {
    expect(parsePlaces(json([place({ detail: undefined })]))[0].detail).toBe("");
  });

  it("de-duplicates by id, keeping the first", () => {
    const twice = [place({ label: "First" }), place({ label: "Second" })];
    expect(parsePlaces(json(twice)).map((p) => p.label)).toEqual(["First"]);
  });

  // The add button enforces the cap, but a store written by hand or by a
  // future build must not make the list longer than the feature promises.
  it("caps a longer store at the limit", () => {
    const many = Array.from({ length: MAX_PLACES + 3 }, (_, i) => place({ id: `p${i}` }));
    expect(parsePlaces(json(many))).toHaveLength(MAX_PLACES);
  });
});

describe("routeKey", () => {
  it("separates listing, destination and profile", () => {
    expect(routeKey("home-1", { lat: 41.6533, lng: -0.8815 }, "foot")).toBe(
      "home-1|41.65330,-0.88150|foot",
    );
  });

  it.each([
    ["listing", routeKey("home-2", { lat: 41.6533, lng: -0.8815 }, "foot")],
    ["profile", routeKey("home-1", { lat: 41.6533, lng: -0.8815 }, "car")],
    ["destination", routeKey("home-1", { lat: 41.6544, lng: -0.8815 }, "foot")],
  ])("is a different key for a different %s", (_what, other) => {
    expect(other).not.toBe(routeKey("home-1", { lat: 41.6533, lng: -0.8815 }, "foot"));
  });

  // Five decimals is ~1 m, below the precision the geocoder returns at all —
  // so re-saving the same address under a second Nominatim id reuses the route
  // that was already paid for rather than measuring it again.
  it("gives two points a metre apart the same key", () => {
    expect(routeKey("home-1", { lat: 41.653301, lng: -0.881502 }, "foot")).toBe(
      routeKey("home-1", { lat: 41.6533, lng: -0.8815 }, "foot"),
    );
  });
});

describe("parseRoutes", () => {
  const route: CachedRoute = {
    minutes: [4, 6],
    metres: [340, 400],
    trunk: "cse}Fbq_D",
    stubA: "abc",
    stubB: "def",
    at: 100,
  };

  it("reads a well-formed cache", () => {
    expect(parseRoutes(json({ "home-1|41.65330,-0.88150|foot": route }))).toEqual({
      "home-1|41.65330,-0.88150|foot": route,
    });
  });

  it("treats an absent, unparseable or non-object cache as empty", () => {
    expect(parseRoutes(null)).toEqual({});
    expect(parseRoutes("{not json")).toEqual({});
    expect(parseRoutes(json([route]))).toEqual({});
  });

  it("drops entries with no geometry or no figures", () => {
    const cache = {
      good: route,
      noMinutes: { ...route, minutes: null },
      noMetres: { ...route, metres: [340] },
      noStubA: { ...route, stubA: null },
      noStubB: { ...route, stubB: 5 },
    };
    expect(Object.keys(parseRoutes(json(cache)))).toEqual(["good"]);
  });

  it("accepts an empty trunk — the ends never converged", () => {
    const cache = { straight: { ...route, trunk: "" } };
    expect(parseRoutes(json(cache)).straight.trunk).toBe("");
  });

  // The pre-ADR-041 shape: one route, one measurement, no band. There is no
  // repair path from a single number to a range, so an entry from an older
  // build is dropped on sight rather than shown half-migrated — that drop IS
  // the migration.
  it("drops an entry in the pre-band shape", () => {
    const legacy = {
      old: { polyline: "cse}Fbq_D", metres: 340, seconds: 260, at: 100 },
    };
    expect(parseRoutes(json(legacy))).toEqual({});
  });

  it("dates an entry with no timestamp to the epoch, so it is evicted first", () => {
    const cache = { old: { ...route, at: undefined } };
    expect(parseRoutes(json(cache)).old.at).toBe(0);
  });
});

describe("putRoute", () => {
  const at = (n: number): CachedRoute => ({
    minutes: [4, 6],
    metres: [340, 400],
    trunk: "cse}Fbq_D",
    stubA: "abc",
    stubB: "def",
    at: n,
  });

  it("adds without touching the cache it was given", () => {
    const before = { a: at(1) };
    const after = putRoute(before, "b", at(2));
    expect(Object.keys(after)).toEqual(["a", "b"]);
    expect(Object.keys(before)).toEqual(["a"]);
  });

  it("overwrites a re-measured key rather than growing", () => {
    expect(putRoute({ a: at(1) }, "a", at(9))).toEqual({ a: at(9) });
  });

  it("evicts the oldest once the cache is over its bound", () => {
    const cache = { a: at(1), b: at(3), c: at(2) };
    expect(Object.keys(putRoute(cache, "d", at(4), 3)).sort()).toEqual(["b", "c", "d"]);
  });

  // Five places resolving off one render all land in the same millisecond, so
  // "oldest" has to break ties on something — otherwise which one survives
  // changes between runs.
  it("breaks a timestamp tie on the key, so eviction is deterministic", () => {
    const cache = { b: at(1), a: at(1), c: at(1) };
    expect(Object.keys(putRoute(cache, "d", at(1), 2)).sort()).toEqual(["c", "d"]);
  });
});

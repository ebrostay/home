import { describe, expect, it } from "vitest";
import {
  AMENITY_GROUPS,
  AMENITY_KEYS,
  BASELINE_KEYS,
  amenityState,
  foldSearch,
  groupAmenities,
  groupOf,
  isBaseline,
  keysInGroup,
  searchAmenities,
  statedAbsent,
  unansweredBaseline,
} from "./amenities";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

const label = (dict: Record<string, string>) => (key: string) => dict[key] ?? key;
const EN = label(en.amenity as Record<string, string>);
const ES = label(es.amenity as Record<string, string>);

describe("the catalogue", () => {
  // The API rejects anything else (`HostValidation` in api/Models/HostWrites.cs)
  // — and it rejects it on SAVE, so a camelCase key added here would look fine
  // in the picker and lose the owner's work at the end of the wizard.
  it("only uses keys the API's shape rule accepts", () => {
    for (const key of AMENITY_KEYS) expect(key).toMatch(/^[a-z0-9-]{1,32}$/);
  });

  it("translates every key into both languages", () => {
    for (const key of AMENITY_KEYS) {
      expect(en.amenity, `en: ${key}`).toHaveProperty(key);
      expect(es.amenity, `es: ${key}`).toHaveProperty(key);
    }
  });

  it("names every group in both languages", () => {
    for (const group of AMENITY_GROUPS) {
      expect(en.amenityGroup, `en: ${group}`).toHaveProperty(group);
      expect(es.amenityGroup, `es: ${group}`).toHaveProperty(group);
    }
  });

  it("puts every key in exactly one group, and every group in the order", () => {
    expect(AMENITY_GROUPS.flatMap(keysInGroup).sort()).toEqual(
      [...AMENITY_KEYS].sort(),
    );
  });

  it("lists the baseline in the catalogue and marks it as baseline", () => {
    for (const key of BASELINE_KEYS) {
      expect(AMENITY_KEYS).toContain(key);
      expect(isBaseline(key)).toBe(true);
    }
    expect(isBaseline("pool")).toBe(false);
  });
});

describe("search", () => {
  it("finds a key by its label in the reader's own language", () => {
    expect(searchAmenities("dishwasher", EN).map((m) => m.key)).toContain("dishwasher");
    expect(searchAmenities("lavavajillas", ES).map((m) => m.key)).toContain("dishwasher");
  });

  // The whole reason synonyms exist: an owner reading Spanish types the English
  // word they use at work, and must still land on the key the filter uses.
  it("finds a key by a synonym from the OTHER language", () => {
    expect(searchAmenities("elevator", ES).map((m) => m.key)).toContain("lift");
    expect(searchAmenities("ascensor", EN).map((m) => m.key)).toContain("lift");
    expect(searchAmenities("teletrabajo", EN).map((m) => m.key)).toContain("desk");
  });

  // The invariant behind the case above, over the whole catalogue. `search`
  // only ever sees ONE label — the one the reader is looking at — so the other
  // language reaches a key through its synonyms or not at all. A key that
  // gains a translation and no synonym is invisible to half the market, and
  // that is exactly the silent kind of gap this file exists to close.
  it("finds EVERY key by its label in the other language too", () => {
    for (const key of AMENITY_KEYS) {
      const enLabel = EN(key);
      const esLabel = ES(key);
      expect(
        searchAmenities(esLabel, EN).map((m) => m.key),
        `an English reader searching “${esLabel}” should find ${key}`,
      ).toContain(key);
      expect(
        searchAmenities(enLabel, ES).map((m) => m.key),
        `a Spanish reader searching “${enLabel}” should find ${key}`,
      ).toContain(key);
    }
  });

  it("ignores accents and case in both the query and the label", () => {
    expect(searchAmenities("BALCON", ES).map((m) => m.key)).toContain("balcony");
    expect(searchAmenities("jardin", ES).map((m) => m.key)).toContain("garden");
    expect(foldSearch("  Aire  Acondicionado ")).toBe("aire acondicionado");
  });

  it("ranks a label prefix above a synonym-only hit", () => {
    // "parking" is the label of `parking` and a synonym of `street-parking`.
    const keys = searchAmenities("parking", EN).map((m) => m.key);
    expect(keys[0]).toBe("parking");
    expect(keys).toContain("street-parking");
  });

  it("matches nothing on an empty or blank query", () => {
    expect(searchAmenities("", EN)).toEqual([]);
    expect(searchAmenities("   ", EN)).toEqual([]);
  });

  it("leaves out keys the caller already handles elsewhere", () => {
    const exclude = new Set(["lift"]);
    expect(searchAmenities("lift", EN, { exclude }).map((m) => m.key)).not.toContain("lift");
  });
});

describe("the tri-state", () => {
  it("tells a stated no apart from a question never asked", () => {
    expect(amenityState("lift", ["lift"], [])).toBe("yes");
    expect(amenityState("lift", [], ["lift"])).toBe("no");
    expect(amenityState("lift", [], [])).toBe("unanswered");
  });

  it("counts only the baseline as unanswered", () => {
    expect(unansweredBaseline([], [])).toEqual([...BASELINE_KEYS]);
    expect(unansweredBaseline(["pool"], [])).toEqual([...BASELINE_KEYS]);
    const answered = unansweredBaseline(
      ["wifi", "heating", "ac", "furnished", "kitchen"],
      ["washer", "desk", "lift", "parking"],
    );
    expect(answered).toEqual([]);
  });

  // The decision the public page rests on: to a reader, "no lift" and "never
  // said" are the same sentence, so a listing written before the owner was ever
  // asked must read exactly like one whose owner answered no.
  it("states the same absences whether the no was recorded or not", () => {
    const recorded = statedAbsent(["wifi"]);
    expect(statedAbsent(["wifi"])).toEqual(recorded);
    expect(recorded).not.toContain("wifi");
    expect(recorded).toContain("lift");
    expect(recorded).toHaveLength(BASELINE_KEYS.length - 1);
  });

  it("never states a non-baseline amenity as missing", () => {
    expect(statedAbsent([])).toEqual([...BASELINE_KEYS]);
    expect(statedAbsent([]).some((k) => !isBaseline(k))).toBe(false);
  });
});

describe("grouping for display", () => {
  it("drops empty groups and keeps catalogue order", () => {
    const groups = groupAmenities(["pool", "wifi", "oven"]);
    expect(groups.map((g) => g.group)).toEqual(["essentials", "kitchen", "outdoor"]);
    expect(groups[0].keys).toEqual(["wifi"]);
  });

  // A listing may carry a key retired from the catalogue since it was written.
  // Dropping it would silently delete a claim the owner made.
  it("keeps a key it does not recognise rather than losing it", () => {
    expect(groupOf("sauna")).toBeNull();
    const groups = groupAmenities(["sauna"]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ group: "essentials", keys: ["sauna"] });
  });
});

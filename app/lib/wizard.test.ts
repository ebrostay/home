import { describe, expect, it } from "vitest";
import type { HostListing, HostPricing } from "@/lib/api";
import { paragraphDoc } from "@/lib/rich-text";
import {
  STEPS,
  STEP_OF,
  attentionSteps,
  blankListing,
  blankPricing,
  clampStep,
  progressAt,
  stepBlockers,
  submitBlockers,
  suggestedName,
} from "./wizard";

// A listing that would pass every check, to be broken one field at a time.
// Built from the blank one so a new required field shows up here as a failing
// test rather than as a submit button that never enables.
const complete = (over: Partial<HostListing> = {}): HostListing => ({
  ...blankListing(),
  name: "Ático en Movera",
  address: "Calle Movera 7",
  postcode: "50007",
  lat: 41.6289,
  lng: -0.8812,
  area: { es: "Torrero", en: "Torrero" },
  description: { es: paragraphDoc("Un ático"), en: paragraphDoc("A top-floor flat") },
  descriptionEnApproved: true,
  details: { es: "Detalles", en: "Details" },
  beds: { es: "1 cama doble", en: "1 double bed" },
  guests: 2,
  bedrooms: 1,
  bathrooms: 1,
  sizeM2: 60,
  amenities: ["wifi"],
  photos: [
    {
      url: "a.webp",
      cardUrl: null,
      detailUrl: null,
      isFloorplan: false,
      sortOrder: 0,
      hiddenFromGallery: false,
    },
  ],
  ...over,
});

const priced = (over: Partial<HostPricing> = {}): HostPricing => ({
  ...blankPricing(),
  priceNumber: 950,
  depositAmount: 950,
  ...over,
});

describe("stepBlockers", () => {
  it("lets a finished address through", () => {
    expect(stepBlockers("address", complete(), priced())).toEqual([]);
  });

  it("names each missing part of the address separately", () => {
    const out = stepBlockers(
      "address",
      complete({ address: "", postcode: "5007", lat: 0, lng: 0 }),
      priced(),
    );
    expect(out).toEqual(["street", "postcode", "pin"]);
  });

  it("treats a pin at 0,0 as no pin at all", () => {
    expect(stepBlockers("address", complete({ lat: 0, lng: 0 }), priced())).toEqual(["pin"]);
  });

  it("does not gate the skippable steps", () => {
    expect(stepBlockers("nearby", blankListing(), blankPricing())).toEqual([]);
    expect(stepBlockers("photos", blankListing(), blankPricing())).toEqual([]);
  });

  it("asks basics for a name and three numbers", () => {
    const out = stepBlockers("basics", blankListing(), blankPricing());
    expect(out).toEqual(["name", "size", "bedrooms", "bathrooms"]);
  });

  it("gates description on Spanish alone", () => {
    const es = complete({ description: { es: paragraphDoc("Hola"), en: null }, descriptionEnApproved: false });
    expect(stepBlockers("description", es, priced())).toEqual([]);
    const en = complete({ description: { es: null, en: paragraphDoc("Hello") } });
    expect(stepBlockers("description", en, priced())).toEqual(["descriptionEs"]);
  });

  // A document object existing is not the same as a written description —
  // mirrors the server's `Both(BilingualDoc?)` (api/Models/HostModels.cs),
  // which counts WORDS. A doc holding only a photo chip has a non-empty
  // `content` array but zero text, so a presence check (`!!listing.description?.es`)
  // would wrongly wave this step through.
  it("treats a document holding only a photo chip as no description", () => {
    const chipOnly = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [{ type: "photoRef" as const, attrs: { url: "a.webp" } }],
        },
      ],
    };
    const l = complete({ description: { es: chipOnly, en: null } });
    expect(stepBlockers("description", l, priced())).toEqual(["descriptionEs"]);
  });

  it("gates pricing on a price", () => {
    expect(stepBlockers("pricing", complete(), priced({ priceNumber: 0 }))).toEqual(["price"]);
    expect(stepBlockers("pricing", complete(), priced())).toEqual([]);
  });
});

describe("submitBlockers", () => {
  it("clears on a listing that meets every check", () => {
    expect(submitBlockers(complete(), priced())).toEqual([]);
  });

  it("carries the editor's own blockers through", () => {
    const keys = submitBlockers(complete({ amenities: [] }), priced()).map((b) => b.key);
    expect(keys).toContain("noAmenities");
  });

  it("adds the four the editor has no reason to check", () => {
    const keys = submitBlockers(
      complete({ name: "  ", bedrooms: 0 }),
      priced({ priceNumber: 0, depositAmount: null }),
    ).map((b) => b.key);
    expect(keys).toEqual(
      expect.arrayContaining(["noName", "noCapacity", "noPrice", "noDeposit"]),
    );
  });

  it("wants the cap whenever bills are capped", () => {
    const capped = priced({ billsPolicy: "capped", utilitiesCapEur: null });
    expect(submitBlockers(complete(), capped).map((b) => b.key)).toContain("noDeposit");
    const withCap = priced({ billsPolicy: "capped", utilitiesCapEur: 90 });
    expect(submitBlockers(complete(), withCap)).toEqual([]);
  });

  it("does not ask for English approval before there is English", () => {
    const noEn = complete({ description: { es: paragraphDoc("Un ático"), en: null }, descriptionEnApproved: false });
    const keys = submitBlockers(noEn, priced()).map((b) => b.key);
    expect(keys).toContain("untransDescription");
    expect(keys).not.toContain("enNotApproved");
  });

  it("names each untranslated field instead of counting them", () => {
    const keys = submitBlockers(
      complete({
        area: { es: "Delicias", en: null },
        beds: { es: "1 cama doble", en: "" },
      }),
      priced(),
    ).map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining(["untransArea", "untransBeds"]));
    expect(keys).not.toContain("missingTranslation");
  });

  it("routes a half-translated zone to the ADDRESS step, not description", () => {
    // The trap that stranded the first real walkthrough: the geocoder had
    // filled only the Spanish zone, and "1 field untranslated" pointed at a
    // description step where every box was full.
    const blockers = submitBlockers(complete({ area: { es: "Delicias", en: null } }), priced());
    expect(attentionSteps(blockers).has("address")).toBe(true);
    expect(attentionSteps(blockers).has("description")).toBe(false);
  });

  it("routes every blocker it can produce to a real step", () => {
    for (const step of Object.values(STEP_OF)) expect(STEPS).toContain(step);
  });
});

describe("attentionSteps", () => {
  it("collapses several blockers on one step to one disc", () => {
    const steps = attentionSteps(submitBlockers(complete({ name: "", bedrooms: 0 }), priced()));
    expect([...steps]).toEqual(["basics"]);
  });
});

describe("progressAt", () => {
  it("fills to the whole track on the last step", () => {
    expect(progressAt(STEPS.length - 1).percent).toBe(100);
    expect(progressAt(STEPS.length - 1).position).toBe(STEPS.length);
  });

  it("counts from one", () => {
    expect(progressAt(0).position).toBe(1);
    expect(progressAt(0).total).toBe(STEPS.length);
  });

  it("never promises zero minutes while a step is still on screen", () => {
    for (let i = 0; i < STEPS.length; i++) {
      expect(progressAt(i).minutesLeft).toBeGreaterThanOrEqual(1);
    }
  });

  it("counts the estimate down", () => {
    const all = STEPS.map((_, i) => progressAt(i).minutesLeft);
    expect(all[0]).toBeGreaterThan(all[all.length - 1]);
    expect([...all]).toEqual([...all].sort((a, b) => b - a));
  });
});

describe("suggestedName (OD-10)", () => {
  it("suggests the formula for an unnamed listing", () => {
    const l = { ...blankListing(), address: "Calle de Pedro II el Católico 3",
      area: { es: "Universidad", en: "University" } };
    expect(suggestedName(l)).toBe("Pedro II el Católico — Universidad");
  });
  it("never overrides a typed name", () => {
    const l = { ...blankListing(), name: "Mi piso", address: "Gran Vía 2" };
    expect(suggestedName(l)).toBeNull();
  });
  it("suggests nothing without an address", () => {
    expect(suggestedName(blankListing())).toBeNull();
  });
});

describe("clampStep", () => {
  it("holds an index on the rail", () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(99)).toBe(STEPS.length - 1);
    expect(clampStep(2)).toBe(2);
  });
});

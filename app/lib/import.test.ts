import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IMPORT_ERROR_CODES,
  IMPORT_KEYS,
  bannerVariant,
  clearMark,
  editedListingKeys,
  editedPricingKeys,
  importErrorKey,
  marksDiffer,
  isTerminalStage,
  matchSource,
  mergeImport,
  pollDelay,
  shouldRetryPoll,
  stageLine,
  POLL_CEILING_MS,
  POLL_MAX_FAILURES,
} from "./import";
import { blankListing, blankPricing } from "./wizard";
import { paragraphDoc } from "./rich-text";
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
      result({ listing: { descriptionEs: "Piso luminoso." }, imported: ["description"] }),
      new Set());
    expect(listing.description?.es?.type).toBe("doc");
    expect(listing.description?.en).toBeNull();
  });
});

// The banner's two lines answer different questions off different sources, and
// getting that wrong has produced a falsehood on screen twice. The table is
// small and the failures are all in its corners, so every corner is here.
describe("bannerVariant", () => {
  // `basics` owns `name`; `rules` owns `petsAllowed`; nothing owns `nearby`.
  const v = (
    step: Parameters<typeof bannerVariant>[0],
    imported: string[],
    arrived: string[] | null,
    justLanded = false,
  ) => bannerVariant(step, imported, arrived, justLanded);

  it("says the same thing on the two policy steps whatever arrived", () => {
    for (const step of ["photos", "paperwork"] as const) {
      expect(v(step, [], null)).toEqual({ eyebrow: "policy", body: "policy", caution: false });
      expect(v(step, ["name"], ["name"])).toEqual({
        eyebrow: "policy",
        body: "policy",
        caution: false,
      });
    }
  });

  describe("in session — the arrival set is known", () => {
    it("marks still unread: from + key", () => {
      expect(v("basics", ["name"], ["name"])).toMatchObject({ eyebrow: "from", body: "key" });
    });

    it("fully reviewed: the eyebrow goes quiet, the BODY does not change", () => {
      // The bug this exists to prevent. `arrived` still holds `name`, so the
      // body must not flip to "the portal had nothing for this step" about a
      // step the owner has just finished reading.
      expect(v("basics", [], ["name"])).toMatchObject({ eyebrow: "nothing", body: "key" });
    });

    it("the portal genuinely sent nothing: nothing + nothing", () => {
      expect(v("basics", [], [])).toMatchObject({ eyebrow: "nothing", body: "nothing" });
      // …and on a step no key can reach, whatever else arrived.
      expect(v("nearby", [], ["name", "price"])).toMatchObject({
        eyebrow: "nothing",
        body: "nothing",
      });
    });

    it("shouts only when the read landed under the owner's hands", () => {
      expect(v("basics", ["name"], ["name"], true).eyebrow).toBe("justLanded");
      expect(v("basics", ["name"], ["name"], false).eyebrow).toBe("from");
    });

    it("shouts only on a step the read actually filled", () => {
      // `justLanded` is a fact about the SESSION and it outranks everything
      // else in the eyebrow ladder, so ungated it announced an arrival on all
      // nine steps — including ones the import never touched. On `nearby`,
      // which no key can even reach, that put "JUST ARRIVED · Idealista" over
      // "Idealista had nothing for this step", in the same banner.
      expect(v("nearby", [], ["address", "name"], true)).toMatchObject({
        eyebrow: "nothing",
        body: "nothing",
      });
      // …and on a reachable step this particular read passed over.
      expect(v("rules", [], ["address", "name"], true)).toMatchObject({
        eyebrow: "nothing",
        body: "nothing",
      });
      // Where it DID land, it still shouts.
      expect(v("basics", ["name"], ["address", "name"], true).eyebrow).toBe("justLanded");
      // Including once that step has been fully reviewed: the arrival is
      // still a true thing to have said about this step, and `arrived` — the
      // set that never shrinks — is what says it.
      expect(v("basics", [], ["name"], true).eyebrow).toBe("justLanded");
    });

    it("never contradicts itself, whatever just landed", () => {
      // The same invariant the resumed-draft block asserts, extended over
      // `justLanded`: an eyebrow announcing an arrival may not sit above a
      // body saying nothing arrived, and a quiet eyebrow may not sit above a
      // key to marks that do not exist.
      for (const step of ["address", "basics", "description", "amenities", "pricing", "rules",
        "nearby"] as const) {
        for (const arrived of [[], ["name"], ["petsAllowed"], ["price"], ["name", "price"]]) {
          for (const imported of [[], ["name"], ["petsAllowed"], ["price"]]) {
            const { eyebrow, body } = v(step, imported, arrived, true);
            if (eyebrow === "justLanded") expect(body, `${step} just-landed`).toBe("key");
            if (eyebrow === "nothing") expect(body, `${step} quiet`).not.toBe("key");
          }
        }
      }
    });
  });

  describe("resumed draft — the arrival set is gone", () => {
    it("live marks stand in for it: they are proof something arrived", () => {
      expect(v("basics", ["name"], null)).toMatchObject({ eyebrow: "from", body: "key" });
    });

    it("no marks left: says LESS rather than guessing", () => {
      // We cannot tell "received nothing" from "already reviewed", so there is
      // no body at all. Both constant fallbacks are wrong here: "something
      // arrived" contradicts the eyebrow on a step the import never filled,
      // and "nothing arrived" denies the marks on a step that still has them.
      expect(v("basics", [], null)).toMatchObject({ eyebrow: "nothing", body: "silent" });
    });

    it("still says the true thing where there is no ignorance to admit", () => {
      // `nearby` is not a case of "we cannot tell": no key maps to it, so
      // nothing CAN have arrived and the sentence is certain. Dropping it
      // would be withholding a fact, not avoiding a guess.
      expect(v("nearby", [], null)).toMatchObject({ eyebrow: "nothing", body: "nothing" });
    });

    it("does not read reachability the other way round", () => {
      // The inference is one-directional. `rules` is reachable, which is why
      // it must NOT be treated as "something arrived" — that was the bug.
      // Every reachable step with no marks left is silent, none is `nothing`,
      // and none is `key`.
      for (const step of ["address", "basics", "description", "amenities", "pricing",
        "rules"] as const) {
        expect(v(step, [], null).body, `${step} with no marks, arrival unknown`).toBe("silent");
      }
    });

    it("an importable step the import never filled is silent, not self-contradictory", () => {
      // The case that produced this finding: an import fills address/basics
      // and never mentions house rules. Reloaded, the eyebrow says nothing is
      // here — so the body must not offer a key to marks that do not exist.
      expect(v("rules", [], null)).toMatchObject({ eyebrow: "nothing", body: "silent" });
      expect(v("rules", ["petsAllowed"], null)).toMatchObject({
        eyebrow: "from",
        body: "key",
      });
    });

    it("never contradicts itself: a quiet eyebrow never sits over a fill-key", () => {
      for (const step of ["address", "basics", "description", "amenities", "pricing", "rules",
        "nearby"] as const) {
        for (const imported of [[], ["name"], ["petsAllowed"], ["price"]]) {
          const { eyebrow, body } = v(step, imported, null);
          if (eyebrow === "nothing") expect(body).not.toBe("key");
        }
      }
    });
  });

  describe("the calendar-month caution", () => {
    it("rides on the price still being unread, on the pricing step only", () => {
      expect(v("pricing", ["price"], ["price"]).caution).toBe(true);
      expect(v("pricing", [], ["price"]).caution).toBe(false);
      expect(v("basics", ["name"], ["name"]).caution).toBe(false);
    });

    it("survives a just-landed read, which is about volume and not about price", () => {
      expect(v("pricing", ["price"], ["price"], true).caution).toBe(true);
    });

    it("still shows on a resumed draft whose price is unread", () => {
      expect(v("pricing", ["price"], null).caution).toBe(true);
    });
  });
});

// A portal's vocabulary is not ours, and the server checks an amenity's SHAPE
// and deliberately not its membership — so an unknown key that happens to be
// lowercase (`elevator`) sails through validation, is stored, and then renders
// as nothing anywhere. Dropped here instead.
describe("mergeImport — the amenity vocabulary", () => {
  const amenityResult = (amenities: string[]): ImportResult => ({
    listing: { amenities },
    pricing: {},
    imported: ["amenities"],
  });

  it("keeps what is ours and drops what is not", () => {
    const merged = mergeImport(
      blankListing(),
      blankPricing(),
      // `elevator` and `washingMachine` are a portal's words for `lift` and
      // `washer`. Only the second is caught by the server's shape check; the
      // first would be written to the document and shown to nobody.
      amenityResult(["wifi", "elevator", "heating", "washingMachine"]),
      new Set(),
    );
    expect(merged.listing.amenities).toEqual(["wifi", "heating"]);
    // Something survived, so the group was answered and the mark stands.
    expect(merged.imported).toEqual(["amenities"]);
  });

  it("withholds the mark entirely when nothing survives", () => {
    const merged = mergeImport(
      blankListing(),
      blankPricing(),
      amenityResult(["elevator", "airConditioning"]),
      new Set(),
    );
    // Untouched, and — the point — UNMARKED. A glyph on a grid we did not
    // fill claims an answer nobody gave.
    expect(merged.listing.amenities).toEqual([]);
    expect(merged.imported).toEqual([]);
  });

  it("withholds the mark for a claimed-but-empty list", () => {
    const merged = mergeImport(blankListing(), blankPricing(), amenityResult([]), new Set());
    expect(merged.imported).toEqual([]);
  });
});

// A cleared mark moves no field, so the wizard's save gate cannot see it with
// `changedSections` alone — and a clear that never reaches the server comes
// back as a re-marked field on the next reload.
describe("marksDiffer", () => {
  const withMarks = (imported: string[] | null, importSource: string | null = "idealista") => ({
    ...blankListing(),
    imported,
    importSource,
  });

  it("is false for two listings that agree", () => {
    expect(marksDiffer(withMarks(["name", "price"]), withMarks(["name", "price"]))).toBe(false);
    expect(marksDiffer(withMarks(null, null), withMarks(null, null))).toBe(false);
  });

  it("sees a mark that has been cleared", () => {
    expect(marksDiffer(withMarks(["name"]), withMarks(["name", "price"]))).toBe(true);
    expect(marksDiffer(withMarks([]), withMarks(["name"]))).toBe(true);
  });

  it("sees an import arriving on a listing that had none", () => {
    expect(marksDiffer(withMarks(["price"]), withMarks(null, null))).toBe(true);
    // …including the source alone, for a read that filled only pricing keys.
    expect(marksDiffer(withMarks([], "idealista"), withMarks([], null))).toBe(true);
  });

  it("treats null and empty as the same absence of marks", () => {
    expect(marksDiffer(withMarks(null), withMarks([]))).toBe(false);
  });

  it("does not fire on order alone", () => {
    // Otherwise a server that sorted the array would make every Continue
    // write the listing again, for ever.
    expect(marksDiffer(withMarks(["name", "price"]), withMarks(["price", "name"]))).toBe(false);
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

// What clears a mark. The wizard owns no fields — every step hands back a whole
// listing — so the key an owner just edited is read back from the change. A key
// this cannot see move is a glyph that stays on screen forever, claiming nobody
// has looked at a value the owner has since rewritten.
describe("editedListingKeys / editedPricingKeys", () => {
  it("sees nothing in an unchanged draft", () => {
    const l = blankListing();
    const p = blankPricing();
    expect(editedListingKeys(l, { ...l })).toEqual([]);
    expect(editedPricingKeys(p, { ...p })).toEqual([]);
  });

  it("names the one field that moved, and only it", () => {
    const l = blankListing();
    expect(editedListingKeys(l, { ...l, name: "P" })).toEqual(["name"]);
    expect(editedListingKeys(l, { ...l, sizeM2: 78 })).toEqual(["sizeM2"]);
    const p = blankPricing();
    expect(editedPricingKeys(p, { ...p, priceNumber: 950 })).toEqual(["price"]);
  });

  it("reads a pin as one answer, not two", () => {
    const l = blankListing();
    expect(editedListingKeys(l, { ...l, lat: 41.65, lng: -0.88 })).toEqual(["pin"]);
  });

  it("sees a grouped control move on any one option", () => {
    const l = blankListing();
    // The whole amenity grid is one key: a single chip toggled is the group
    // answered again.
    expect(editedListingKeys(l, { ...l, amenities: ["wifi"] })).toEqual(["amenities"]);
    expect(
      editedListingKeys({ ...l, amenities: ["wifi", "heating"] }, { ...l, amenities: ["wifi"] }),
    ).toEqual(["amenities"]);
  });

  it("sees a bilingual field move in either language", () => {
    const l = blankListing();
    expect(editedListingKeys(l, { ...l, area: { es: "Centro", en: null } })).toEqual(["area"]);
    expect(
      editedListingKeys(
        { ...l, area: { es: "Centro", en: null } },
        { ...l, area: { es: "Centro", en: "Centre" } },
      ),
    ).toEqual(["area"]);
  });

  it("does not read a re-serialised rich-text document as an edit", () => {
    // The mark on a description must survive the editor loading it: canonical
    // form, not raw JSON, or key order alone would clear a paragraph nobody
    // has read.
    const l = { ...blankListing(), description: { es: paragraphDoc("Hola"), en: null } };
    const same = { ...l, description: { es: JSON.parse(JSON.stringify(paragraphDoc("Hola"))), en: null } };
    expect(editedListingKeys(l, same)).toEqual([]);
    expect(editedListingKeys(l, { ...l, description: { es: paragraphDoc("Adiós"), en: null } })).toEqual([
      "description",
    ]);
  });

  it("sees every key the merge can fill", () => {
    // The drift guard. A key `mergeImport` writes that neither of these can
    // see move is a glyph with no way off the screen — and the two together
    // must therefore cover IMPORT_KEYS exactly. Checked through the merge
    // rather than against a hand-written list, so it cannot pass by agreeing
    // with a copy of the same mistake.
    const full: ImportResult = {
      listing: {
        address: "Calle de Bilbao, 12", postcode: "50004", cadastralRef: "4721903XM7147S0001BT",
        lat: 41.65, lng: -0.88, areaEs: "Centro",
        descriptionEs: "Piso luminoso.", detailsEs: "Ascensor.", bedsEs: "Una cama de 150.",
        name: "Piso en el Centro", type: "house",
        guests: 4, bedrooms: 2, bathrooms: 1, sizeM2: 78, floorNumber: 3, energyRating: "D",
        amenities: ["wifi"],
        petsAllowed: true, smokingAllowed: true, couplesAllowed: true, selfCheckin: true,
      },
      pricing: {
        priceNumber: 950, depositAmount: 950,
        billsPolicy: "capped", utilitiesCapEur: 90, minStayMonths: 3,
      },
      imported: [...IMPORT_KEYS],
    };
    const l = blankListing();
    const p = blankPricing();
    const merged = mergeImport(l, p, full, new Set());
    expect([...merged.imported].sort()).toEqual([...IMPORT_KEYS].sort());

    const back = [
      ...editedListingKeys(merged.listing, l),
      ...editedPricingKeys(merged.pricing, p),
    ];
    expect(back.sort()).toEqual([...IMPORT_KEYS].sort());
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

describe("shouldRetryPoll", () => {
  it("rides out a short run of dropped responses", () => {
    // One transient failure used to end the read for good — the poll
    // scheduled no further round and left `jobId` set, so the chain could not
    // restart, the owner was evicted to the start screen, and a job still
    // running on the server was abandoned with nothing left to poll or reap
    // it.
    expect(shouldRetryPoll(1, 5_000)).toBe(true);
    expect(shouldRetryPoll(POLL_MAX_FAILURES, 5_000)).toBe(true);
  });

  it("gives up once the run gets long enough to mean something", () => {
    expect(shouldRetryPoll(POLL_MAX_FAILURES + 1, 5_000)).toBe(false);
  });

  it("never outlives the ceiling, however few the failures", () => {
    // A read that has been going five minutes is over regardless of why the
    // last round failed.
    expect(shouldRetryPoll(1, POLL_CEILING_MS)).toBe(false);
    expect(shouldRetryPoll(1, POLL_CEILING_MS + 1)).toBe(false);
    expect(shouldRetryPoll(1, POLL_CEILING_MS - 1)).toBe(true);
  });
});

describe("IMPORT_KEYS", () => {
  it("holds 26 keys and no duplicates", () => {
    expect(new Set(IMPORT_KEYS).size).toBe(IMPORT_KEYS.length);
    expect(IMPORT_KEYS.length).toBe(26);
  });
});

describe("isTerminalStage", () => {
  it("is true for exactly the three stages a job stops at", () => {
    expect(isTerminalStage("done")).toBe(true);
    expect(isTerminalStage("failed")).toBe(true);
    expect(isTerminalStage("cancelled")).toBe(true);
  });

  it("is false while the job is still moving", () => {
    // `queued` is the one that matters: a poll that treated it as terminal
    // would abandon every read before the pipeline had picked it up.
    expect(isTerminalStage("queued")).toBe(false);
    expect(isTerminalStage("fetching")).toBe(false);
    expect(isTerminalStage("reading")).toBe(false);
    expect(isTerminalStage("matching")).toBe(false);
  });
});

// The error path, end to end as far as pure code can see it: a server code
// becomes a message key, and that key has copy in BOTH locales. The transform
// on its own is not the interesting half — a code with no copy is what
// actually bites, because it degrades silently into "something went wrong"
// and takes the one sentence that would have told the owner what to do next.
describe("importErrorKey", () => {
  const messages = (locale: string) =>
    JSON.parse(
      readFileSync(join(__dirname, "..", "messages", `${locale}.json`), "utf8"),
    ).host.import as Record<string, string>;

  it("camel-cases a snake_case code onto the errorX namespace", () => {
    expect(importErrorKey("unsupported_host")).toBe("errorUnsupportedHost");
    expect(importErrorKey("daily_import_limit")).toBe("errorDailyImportLimit");
    expect(importErrorKey("cancel_conflict")).toBe("errorCancelConflict");
    expect(importErrorKey("result_invalid")).toBe("errorResultInvalid");
    // A single word keeps its shape rather than gaining a stray separator.
    expect(importErrorKey("timeout")).toBe("errorTimeout");
    expect(importErrorKey("withdrawn")).toBe("errorWithdrawn");
  });

  it.each(["es", "en"])("has copy in %s for every code the API can send", (locale) => {
    const copy = messages(locale);
    const missing = IMPORT_ERROR_CODES.filter((code) => !copy[importErrorKey(code)]);
    expect(missing, `codes with no ${locale} copy`).toEqual([]);
  });

  it("says the same things in both languages", () => {
    // Not a translation check — a key-parity one. A key present in one file
    // and absent from the other is a screen that reads correctly for half the
    // owners and falls back to the generic message for the other half.
    expect(Object.keys(messages("es")).sort()).toEqual(Object.keys(messages("en")).sort());
  });

  it("lists each code once", () => {
    expect(new Set(IMPORT_ERROR_CODES).size).toBe(IMPORT_ERROR_CODES.length);
  });
});

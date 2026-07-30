import { describe, expect, it } from "vitest";
import { biDoc } from "./api";
import { EMPTY_DOC, paragraphDoc, type RichNode } from "./rich-text";

// Fix round 2 on Task 11 (2026-07-30): `biDoc` restores `biText`'s
// both-ways-locale fallback for a description DOCUMENT. `biText` gets away
// with a plain `??` because `setBi` (`DescriptionFields.tsx`) normalises an
// emptied string to `null` before a reader ever sees it — the document path
// has no equivalent, so `description.en` can be a real, non-null
// `{type:"doc",content:[]}` after an owner deletes everything they typed.
// `biDoc` must therefore fall back on EMPTY, not merely on `null` — these
// pin exactly that, at the same granularity `bothLanguagesDoc`
// (`lib/listing.ts`) already tests for the completeness gate.

const es = paragraphDoc("Piso luminoso en el Arrabal.");
const en = paragraphDoc("A bright flat in El Arrabal.");

describe("biDoc", () => {
  it("returns the guest's own locale when it has content", () => {
    expect(biDoc({ es, en }, "es")).toBe(es);
    expect(biDoc({ es, en }, "en")).toBe(en);
  });

  it("falls back to the other language when the own one is null", () => {
    expect(biDoc({ es, en: null }, "en")).toBe(es);
    expect(biDoc({ es: null, en }, "es")).toBe(en);
  });

  // The regression this round's finding was actually about: a non-null but
  // CONTENT-FREE document (what deleting all the text in the editor leaves
  // behind) must be treated the same as null, not as "present".
  it("falls back to the other language when the own one is a non-null empty document", () => {
    expect(biDoc({ es, en: EMPTY_DOC }, "en")).toBe(es);
    expect(biDoc({ es: EMPTY_DOC, en }, "es")).toBe(en);
  });

  // A document holding only a photo/place chip and no words is empty by
  // `isEmptyDoc`'s own definition (zero `textLength`) — same case, a
  // different shape of "empty" than `EMPTY_DOC`'s bare `content: []`.
  it("treats a chip-only document (no text) as empty too", () => {
    const chipOnly: RichNode = {
      type: "doc",
      content: [{ type: "photoFigure", attrs: { url: "/p/1.jpg" } }],
    };
    expect(biDoc({ es, en: chipOnly }, "en")).toBe(es);
  });

  it("returns null when both languages are absent or empty", () => {
    expect(biDoc({ es: null, en: null }, "es")).toBeNull();
    expect(biDoc({ es: EMPTY_DOC, en: EMPTY_DOC }, "en")).toBeNull();
    expect(biDoc(null, "es")).toBeNull();
    expect(biDoc(undefined, "en")).toBeNull();
  });
});

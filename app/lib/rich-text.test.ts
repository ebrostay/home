import { describe, expect, it } from "vitest";
import {
  RICH_LIMITS,
  RICH_MARKS,
  canonical,
  paragraphDoc,
  referencedEntryIds,
  referencedPhotoUrls,
  textLength,
  validateDoc,
  type RichNode,
} from "./rich-text";

const doc = (...content: RichNode[]): RichNode => ({ type: "doc", content });
const p = (...content: RichNode[]): RichNode => ({ type: "paragraph", content });
const t = (text: string, ...marks: string[]): RichNode =>
  marks.length ? { type: "text", text, marks: marks.map((m) => ({ type: m as "bold" })) } : { type: "text", text };

describe("limits", () => {
  it("keeps the text cap in step with LIMITS.maxCopy", async () => {
    const { LIMITS } = await import("./listing");
    expect(RICH_LIMITS.maxText).toBe(LIMITS.maxCopy);
  });

  it("allows exactly two marks", () => {
    expect([...RICH_MARKS]).toEqual(["bold", "italic"]);
  });
});

describe("textLength", () => {
  it("counts text nodes", () => {
    expect(textLength(doc(p(t("hello")), p(t(" world"))))).toBe(11);
  });

  // References are deliberately free: their label lives on another record, so
  // charging them would let a rename elsewhere break an untouched description.
  it("does not charge references or captions", () => {
    const d = doc(
      p(t("abc"), { type: "placeRef", attrs: { entryId: "e1" } }),
      { type: "photoFigure", attrs: { url: "/p/1.jpg", caption: "a long caption" } },
    );
    expect(textLength(d)).toBe(3);
  });
});

describe("canonical", () => {
  it("is stable across key order", () => {
    const a: RichNode = { type: "paragraph", content: [t("x")] };
    const b = { content: [{ text: "x", type: "text" }], type: "paragraph" } as RichNode;
    expect(canonical(a)).toBe(canonical(b));
  });

  // Tiptap emits marks in application order; the API returns stored order.
  // Bold-then-italic and italic-then-bold are the same document.
  it("is stable across mark order", () => {
    expect(canonical(p(t("x", "bold", "italic")))).toBe(canonical(p(t("x", "italic", "bold"))));
  });

  it("treats an absent field and an explicit undefined alike", () => {
    expect(canonical({ type: "paragraph" })).toBe(canonical({ type: "paragraph", content: undefined }));
  });

  it("distinguishes genuinely different documents", () => {
    expect(canonical(p(t("x")))).not.toBe(canonical(p(t("y"))));
  });

  it("renders a null document without throwing", () => {
    expect(canonical(null)).toBe("null");
  });
});

describe("paragraphDoc", () => {
  it("wraps plain text in a one-paragraph document", () => {
    expect(paragraphDoc("hi")).toEqual(doc(p(t("hi"))));
  });

  it("returns an empty doc for blank text", () => {
    expect(paragraphDoc("   ")).toEqual(doc());
  });
});

const refs = { photoUrls: new Set(["/p/1.jpg"]), entryIds: new Set(["e1"]) };
const ok = (n: RichNode) => validateDoc(n, refs);

describe("validateDoc", () => {
  it("accepts a document using every node type", () => {
    expect(
      ok(
        doc(
          { type: "heading", attrs: { level: 3 }, content: [t("Kitchen")] },
          p(t("Refitted in "), t("2024", "bold"), { type: "photoRef", attrs: { url: "/p/1.jpg" } }),
          { type: "bulletList", content: [{ type: "listItem", content: [p(t("Lift"))] }] },
          { type: "orderedList", content: [{ type: "listItem", content: [p(t("One"))] }] },
          { type: "callout", content: [p(t("Good to know"))] },
          { type: "photoFigure", attrs: { url: "/p/1.jpg", caption: "North" } },
          { type: "placeCard", attrs: { entryId: "e1" } },
          p({ type: "placeRef", attrs: { entryId: "e1" } }),
        ),
      ),
    ).toBeNull();
  });

  it("rejects a root that is not a doc", () => {
    expect(ok(p(t("x")))).toBe("copy_bad_root");
  });

  it("rejects an unknown node type", () => {
    expect(ok(doc({ type: "iframe" as "paragraph" }))).toBe("copy_bad_node");
  });

  it("rejects a legal node in an illegal place", () => {
    expect(ok(doc(p({ type: "paragraph", content: [t("nested")] })))).toBe("copy_bad_node");
  });

  it("rejects an unknown mark", () => {
    expect(ok(doc(p(t("x", "link"))))).toBe("copy_bad_mark");
  });

  it("rejects a heading that is not level 3", () => {
    expect(ok(doc({ type: "heading", attrs: { level: 1 as 3 }, content: [t("x")] }))).toBe("copy_bad_heading");
  });

  it("rejects text past the cap", () => {
    expect(ok(doc(p(t("x".repeat(RICH_LIMITS.maxText + 1)))))).toBe("copy_too_long");
  });

  it("rejects a caption past the cap", () => {
    expect(ok(doc({ type: "photoFigure", attrs: { url: "/p/1.jpg", caption: "c".repeat(201) } }))).toBe(
      "copy_bad_caption",
    );
  });

  it("rejects a photo reference to a url not on the listing", () => {
    expect(ok(doc({ type: "photoFigure", attrs: { url: "https://evil.example/x.jpg" } }))).toBe(
      "copy_photo_unknown",
    );
  });

  it("rejects a place reference to an unknown entry", () => {
    expect(ok(doc(p({ type: "placeRef", attrs: { entryId: "nope" } })))).toBe("copy_place_unknown");
  });

  it("rejects a text node carrying children", () => {
    expect(ok(doc(p({ type: "text", text: "x", content: [t("y")] })))).toBe("copy_bad_node");
  });

  // CONTENT_MODEL's deepest legal chain (doc→bulletList→listItem→paragraph→text)
  // is exactly RICH_LIMITS.maxDepth levels, and listItem allows only paragraph —
  // "lists cannot nest" — so alternating bulletList/listItem past one wrap is
  // ALSO a content-model violation, at a depth well under the cap. A first-
  // failure walk hits that shallow copy_bad_node long before depth or node
  // count would matter, which is exactly the "refused rather than fully
  // walked" property this is meant to demonstrate: none of the other 38 wraps
  // above it are ever visited.
  it("rejects a nesting bomb before it is fully walked", () => {
    let n: RichNode = p(t("deep"));
    for (let i = 0; i < 40; i++) n = { type: "bulletList", content: [{ type: "listItem", content: [n] }] };
    expect(ok(doc(n))).toBe("copy_bad_node");
  });

  it("rejects more nodes than the cap", () => {
    expect(ok(doc(...Array.from({ length: RICH_LIMITS.maxNodes + 1 }, () => p(t("x")))))).toBe(
      "copy_too_many_nodes",
    );
  });

  it("accepts an empty document", () => {
    expect(ok(doc())).toBeNull();
  });
});

describe("reference extraction", () => {
  const d = doc(
    p({ type: "photoRef", attrs: { url: "/p/1.jpg" } }, { type: "placeRef", attrs: { entryId: "e1" } }),
    { type: "photoFigure", attrs: { url: "/p/2.jpg" } },
    { type: "placeCard", attrs: { entryId: "e2" } },
  );

  it("finds photo urls in both node types", () => {
    expect([...referencedPhotoUrls(d)].sort()).toEqual(["/p/1.jpg", "/p/2.jpg"]);
  });

  it("finds entry ids in both node types", () => {
    expect([...referencedEntryIds(d)].sort()).toEqual(["e1", "e2"]);
  });
});

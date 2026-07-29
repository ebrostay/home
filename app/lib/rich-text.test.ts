import { describe, expect, it } from "vitest";
import {
  RICH_LIMITS,
  RICH_MARKS,
  canonical,
  paragraphDoc,
  textLength,
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

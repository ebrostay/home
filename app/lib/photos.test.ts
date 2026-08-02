import { describe, expect, it } from "vitest";
import { slideSrc, slidesFor } from "@/lib/photos";

const photo = (url: string, detailUrl: string | null = null) => ({
  url,
  cardUrl: null,
  detailUrl,
});

// The alt formatter stands in for next-intl's t("photoOf"), which cannot be
// imported here — lib/ is pure and vitest runs it under `environment: "node"`.
const alt = (n: number, total: number) => `Photo ${n} of ${total}`;

// The gallery prefetches this so the open transition has something to
// snapshot. If it ever stops agreeing with the slide's own src, the prefetch
// warms the wrong file and the transition silently stops happening.
describe("slideSrc", () => {
  it("is the src slidesFor gives the slide", () => {
    const photos = [photo("/full.webp", "/detail.webp"), photo("/legacy.jpg")];
    expect(photos.map(slideSrc)).toEqual(
      slidesFor(photos, alt).map((s) => s.src),
    );
  });
});

describe("slidesFor", () => {
  it("prefers the detail variant over the full-size original", () => {
    expect(slidesFor([photo("/full.webp", "/detail.webp")], alt)[0].src).toBe(
      "/detail.webp",
    );
  });

  it("falls back to url for photos that predate the pipeline", () => {
    expect(slidesFor([photo("/legacy.jpg")], alt)[0].src).toBe("/legacy.jpg");
  });

  it("numbers the alt text from one, against the total", () => {
    const slides = slidesFor([photo("/a.jpg"), photo("/b.jpg")], alt);
    expect(slides.map((s) => s.alt)).toEqual([
      "Photo 1 of 2",
      "Photo 2 of 2",
    ]);
  });

  it("preserves the order it is given", () => {
    const slides = slidesFor(
      [photo("/a.jpg"), photo("/b.jpg"), photo("/c.jpg")],
      alt,
    );
    expect(slides.map((s) => s.src)).toEqual(["/a.jpg", "/b.jpg", "/c.jpg"]);
  });

  it("handles the single-photo case the description reference uses", () => {
    expect(slidesFor([photo("/one.jpg")], alt)).toEqual([
      { src: "/one.jpg", alt: "Photo 1 of 1" },
    ]);
  });

  it("returns nothing for no photos rather than throwing", () => {
    expect(slidesFor([], alt)).toEqual([]);
  });
});

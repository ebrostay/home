import { describe, expect, it } from "vitest";
import { slideSrc } from "@/lib/photos";

const photo = (url: string, detailUrl: string | null = null) => ({
  url,
  cardUrl: null,
  detailUrl,
});

// The mosaic prefetches this on hover and Fancybox loads it as the slide's
// src — one value serving both, which is the point: if they ever disagreed,
// the warm would heat the wrong file and the open would fetch cold.
describe("slideSrc", () => {
  it("prefers the detail variant over the full-size original", () => {
    expect(slideSrc(photo("/full.webp", "/detail.webp"))).toBe("/detail.webp");
  });

  it("falls back to url for photos that predate the pipeline", () => {
    expect(slideSrc(photo("/legacy.jpg"))).toBe("/legacy.jpg");
  });
});

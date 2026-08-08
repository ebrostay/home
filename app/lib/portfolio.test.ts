import { describe, expect, it } from "vitest";
import type { HostProperty, PropertyStatus } from "@/lib/api";
import { bucketOf, formatDay, portfolioStats, tabCounts } from "./portfolio";

const home = (status: PropertyStatus, id = status): HostProperty => ({
  id,
  status,
  reviewNote: null,
  reference: null,
  name: `Home ${id}`,
  address: null,
  area: null,
  bedrooms: 2,
  bathrooms: 1,
  sizeM2: 80,
  priceNumber: 1200,
  coverUrl: null,
  photoCount: 4,
  sectionsDone: 11,
  sectionsTotal: 11,
  requestCount: 0,
  oldestRequestAt: null,
  availableFrom: null,
  updatedAt: "2026-08-01T10:00:00Z",
  availability: [],
});

// The ledger strip and the tab strip sit side by side on the portfolio page,
// and they were answering the same question differently: `BUCKET` put a
// `closed` listing (design 2026-08-08) in the Live tab while `portfolioStats`
// counted only `published`, so an owner mid-closure read "0 live" next to a
// tab reading "Live 1" about the very same home.
describe("what the portfolio calls live", () => {
  it("counts a closed listing, which is still public", () => {
    expect(portfolioStats([home("closed")], "en", new Date("2026-08-08")).live).toBe(1);
  });

  it("agrees with the Live tab, listing for listing", () => {
    const homes = [
      home("published"),
      home("closed"),
      home("paused"),
      home("draft"),
      home("pending_review"),
      home("rejected"),
    ];

    const stats = portfolioStats(homes, "en", new Date("2026-08-08"));

    expect(stats.live).toBe(tabCounts(homes).live);
    expect(stats.live).toBe(2);
  });

  // The bucket is the single definition; the strip reads it rather than
  // repeating it, which is what stops the two drifting apart again.
  it("is the `live` bucket and nothing else", () => {
    const homes = [home("published"), home("closed"), home("paused")];
    const stats = portfolioStats(homes, "en", new Date("2026-08-08"));

    expect(stats.live).toBe(homes.filter((p) => bucketOf(p) === "live").length);
  });
});

// `formatDay` exists because `Intl.DateTimeFormat.format` throws a RangeError
// on an invalid Date instead of degrading, and the portfolio page formats a
// timestamp it merely received from the API. On 2026-07-30 the API returned
// `07/22/2026 12:00:00` for a listing in review — `slice(0, 10)` of that is
// "07/22/2026", which is not a date — and the RangeError propagated out of
// `PropertyRow` to the root error boundary: the owner saw "This page couldn't
// load" instead of their eight listings.
//
// Verified against the unfixed code (the inline formatter this replaced,
// `new Intl.DateTimeFormat(...).format(new Date(iso.slice(0,10) + "T12:00:00"))`):
// every case in "survives a value it cannot read" throws RangeError rather
// than returning null, so those tests fail against that version.
describe("formatDay", () => {
  it("renders a stored ISO timestamp as a long date", () => {
    expect(formatDay("2026-07-22T12:00:00Z", "es")).toBe("22 de julio de 2026");
    expect(formatDay("2026-07-22T12:00:00Z", "en")).toBe("22 July 2026");
  });

  it("accepts a date-only value, which is what availability stores", () => {
    expect(formatDay("2026-08-09", "en")).toBe("9 August 2026");
  });

  // The whole reason the function returns a nullable rather than a string.
  it.each([
    ["the format that actually broke it", "07/22/2026 12:00:00"],
    ["empty", ""],
    ["prose", "not a date at all"],
  ])("returns null for a value it cannot read: %s", (_label, value) => {
    expect(formatDay(value, "es")).toBeNull();
  });

  // What matters at the call site is that nothing escapes, whether the value
  // is rejected or read leniently. `new Date` rolls some malformed values over
  // rather than failing — "2026-07" is read as 1 July, "2026-02-31" as 3
  // March — which is a wrong date but not a broken page, so this asserts only
  // the property the page depends on.
  it.each([
    "2026-07",
    "2026-02-31T00:00:00Z",
    "0000-00-00",
    "2026-13-45T99:99:99Z",
    "—",
  ])("never throws on: %s", (value) => {
    expect(() => formatDay(value, "es")).not.toThrow();
    expect(() => formatDay(value, "en")).not.toThrow();
  });

  // Reading the timestamp at noon keeps the calendar day stable across the
  // DST boundary; midnight would land the 29th on the 28th in some zones.
  it("reports the stored calendar day, not the day before", () => {
    expect(formatDay("2026-03-29T00:30:00Z", "en")).toBe("29 March 2026");
    expect(formatDay("2026-10-25T23:30:00Z", "en")).toBe("25 October 2026");
  });
});

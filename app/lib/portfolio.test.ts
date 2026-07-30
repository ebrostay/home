import { describe, expect, it } from "vitest";
import { formatDay } from "./portfolio";

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

import { describe, expect, it } from "vitest";
import type { HostRange } from "@/lib/api";
import { turnaroundRanges, turnoverOf, withTurnover } from "./availability";

// The kind decides the buffer (ADR-031): a stay closes `turnoverDays` after
// itself, the owner's own use closes nothing. These tests are the contract
// with `PublicProjection.Turnover` on the C# side — the same rule spelled
// once per side, so a drift shows up here before it shows up as a calendar
// that disagrees with search.

const range = (over: Partial<HostRange> = {}): HostRange => ({
  start: "2026-08-07",
  end: "2026-08-10", // exclusive
  status: "confirmed",
  note: null,
  turnoverDaysOverride: null,
  kind: null,
  ...over,
});

describe("turnoverOf", () => {
  it("gives a stay the listing's full buffer", () => {
    expect(turnoverOf(range(), 3)).toBe(3);
  });

  it("gives the owner's own use no buffer at all", () => {
    expect(turnoverOf(range({ kind: "own_use" }), 3)).toBe(0);
  });

  it("treats a block from before the field existed as a stay", () => {
    // Null is the SAFE default: an unlabelled block over-blocks rather than
    // letting a tenant into an unprepared home.
    expect(turnoverOf(range({ kind: null }), 5)).toBe(5);
  });

  it("lets an admin override outrank both kinds", () => {
    expect(turnoverOf(range({ turnoverDaysOverride: 7 }), 3)).toBe(7);
    expect(turnoverOf(range({ kind: "own_use", turnoverDaysOverride: 2 }), 3)).toBe(2);
  });
});

describe("withTurnover", () => {
  it("extends a stay and leaves own use alone, in one list", () => {
    const out = withTurnover(
      [range(), range({ start: "2026-09-01", end: "2026-09-03", kind: "own_use" })],
      3,
    );
    expect(out).toEqual([
      { start: "2026-08-07", end: "2026-08-13" },
      { start: "2026-09-01", end: "2026-09-03" },
    ]);
  });
});

describe("turnaroundRanges", () => {
  it("draws no hatch after own use", () => {
    const out = turnaroundRanges(
      [range(), range({ start: "2026-09-01", end: "2026-09-03", kind: "own_use" })],
      3,
    );
    expect(out).toEqual([{ start: "2026-08-10", end: "2026-08-13" }]);
  });
});

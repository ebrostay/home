import { beforeEach, describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";
import {
  NEARBY_GROUPS,
  NEARBY_PROFILES,
  candidateKey,
  decodePolyline,
  memoizedCandidates,
  reachFor,
  resetCandidateMemo,
} from "./nearby";

// The TYPE list lives on the server and arrives over the wire, so it cannot be
// asserted here. What CAN be asserted is that the two catalogues agree with
// each other — if they drift, one locale renders a type the other cannot, and
// that is the failure this split introduced.
describe("type labels", () => {
  const keys = (m: { nearby: { type: Record<string, string> } }) =>
    Object.keys(m.nearby.type).sort();

  it("defines the same type keys in both locales", () => {
    expect(keys(es as never)).toEqual(keys(en as never));
  });

  it("leaves no label empty", () => {
    for (const m of [es, en] as never[])
      for (const [k, v] of Object.entries(
        (m as { nearby: { type: Record<string, string> } }).nearby.type,
      ))
        expect(v.trim(), `empty label for ${k}`).not.toBe("");
  });
});

describe("groups", () => {
  it("stays at the five the icon map is built for", () => {
    expect([...NEARBY_GROUPS]).toEqual([
      "transport", "groceries", "food", "outdoors", "health",
    ]);
  });
});

describe("decodePolyline", () => {
  // The canonical Google encoded-polyline example.
  it("decodes the reference vector", () => {
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points).toHaveLength(3);
    expect(points[0][0]).toBeCloseTo(38.5, 5);
    expect(points[0][1]).toBeCloseTo(-120.2, 5);
    expect(points[2][0]).toBeCloseTo(43.252, 5);
    expect(points[2][1]).toBeCloseTo(-126.453, 5);
  });

  it("returns nothing for an empty string rather than throwing", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("reachFor", () => {
  const entry = { reach: { foot: { metres: 340, minutes: 4 } } };

  it("returns the requested profile", () => {
    expect(reachFor(entry, "foot")).toEqual({ metres: 340, minutes: 4 });
  });

  // A listing saved before a profile existed simply has no figures for it. The
  // caller must be able to hide the entry rather than render "undefined min".
  it("returns null for a profile the entry has no figures for", () => {
    expect(reachFor(entry, "car")).toBeNull();
  });

  it("resolves every declared profile independently", () => {
    const both = { reach: { foot: { metres: 340, minutes: 4 }, car: { metres: 900, minutes: 3 } } };
    for (const p of NEARBY_PROFILES) expect(reachFor(both, p)).not.toBeNull();
  });
});

// Each hit here is two OpenRouteService matrix requests not spent, against a
// 1,500/day ceiling — so what is asserted is the request COUNT, not just the
// returned value.
describe("memoizedCandidates", () => {
  beforeEach(resetCandidateMemo);

  const at = (lat: number, lng: number, group: string, calls: { n: number }) =>
    memoizedCandidates(lat, lng, group, async () => {
      calls.n += 1;
      return [`${lat}|${lng}|${group}`];
    });

  it("asks once for a repeated question", async () => {
    const calls = { n: 0 };
    await at(41.65393, -0.90783, "transport", calls);
    await at(41.65393, -0.90783, "transport", calls);
    await at(41.65393, -0.90783, "transport", calls);
    expect(calls.n).toBe(1);
  });

  it("asks again for another group at the same pin", async () => {
    const calls = { n: 0 };
    await at(41.65393, -0.90783, "transport", calls);
    await at(41.65393, -0.90783, "groceries", calls);
    expect(calls.n).toBe(2);
  });

  // The whole reason the pin is not rounded the way the server rounds its
  // Overpass cell: two pins 30 m apart are two different questions, and
  // answering the second with the first would put error into a figure the
  // page presents as exact (ADR-028).
  it("asks again for a pin that moved at all", async () => {
    const calls = { n: 0 };
    await at(41.65393, -0.90783, "transport", calls);
    await at(41.65394, -0.90783, "transport", calls);
    expect(calls.n).toBe(2);
    expect(candidateKey(41.65393, -0.90783, "transport")).not.toBe(
      candidateKey(41.65394, -0.90783, "transport"),
    );
  });

  it("returns the memoized value, not a fresh one", async () => {
    const calls = { n: 0 };
    const first = await at(41.6, -0.9, "food", calls);
    const second = await at(41.6, -0.9, "food", calls);
    expect(second).toBe(first);
  });

  // A failed lookup must stay retryable — the finder has a retry button, and
  // memoizing the failure would make it a button that does nothing.
  it("does not memoize a failure", async () => {
    let calls = 0;
    const boom = () =>
      memoizedCandidates(41.6, -0.9, "health", async () => {
        calls += 1;
        throw new Error("overpass_504");
      });
    await expect(boom()).rejects.toThrow("overpass_504");
    await expect(boom()).rejects.toThrow("overpass_504");
    expect(calls).toBe(2);
  });

  // An empty result is a real answer ("nothing of this type nearby"), and
  // `undefined` is the only miss — a memo keyed on truthiness would re-ask
  // every time for a genuinely empty neighbourhood.
  it("memoizes an empty result", async () => {
    let calls = 0;
    const ask = () =>
      memoizedCandidates(41.6, -0.9, "outdoors", async () => {
        calls += 1;
        return [];
      });
    expect(await ask()).toEqual([]);
    await ask();
    expect(calls).toBe(1);
  });
});

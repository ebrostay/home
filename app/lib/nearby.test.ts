import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { NEARBY_GROUPS, NEARBY_PROFILES, decodePolyline, reachFor } from "./nearby";

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

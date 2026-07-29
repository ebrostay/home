import { describe, expect, it } from "vitest";
import { clusterPins, pillWidth, type ClusterInput } from "./mapCluster";

// x = lng, y = lat, straight through: a test can then say "these two are 20px
// apart" without a map. Leaflet's own projection doubles distance per zoom
// level, which is the only property the separability maths relies on.
const project = (lat: number, lng: number) => ({ x: lng, y: lat });

const pin = (id: string, x: number, y: number, price = 950): ClusterInput => ({
  id,
  lat: y,
  lng: x,
  label: `${price} €`,
  price,
});

describe("pillWidth", () => {
  it("reproduces the measured pill widths", () => {
    // Measured in the browser at 11px Spline Sans Mono.
    expect(pillWidth("950 €")).toBeCloseTo(53, 1);
    expect(pillWidth("1.350 €")).toBeCloseTo(66.2, 1);
  });
});

describe("clusterPins", () => {
  it("leaves pins that cannot collide alone", () => {
    const out = clusterPins([pin("a", 0, 0), pin("b", 400, 0)], project, 6);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.ids.length === 1)).toBe(true);
  });

  it("groups pills that overlap horizontally on the same line", () => {
    // Two "950 €" pills need 57px between anchors; 20 is well inside that.
    const out = clusterPins([pin("a", 0, 0), pin("b", 20, 0)], project, 6);
    expect(out).toHaveLength(1);
    expect(out[0].ids).toEqual(["a", "b"]);
  });

  it("does not group pills that clear on the vertical axis alone", () => {
    // Same x, but 40px apart vertically — beyond the 27px a pill needs.
    const out = clusterPins([pin("a", 0, 0), pin("b", 0, 40)], project, 6);
    expect(out).toHaveLength(2);
  });

  it("anchors a group on its cheapest member, whatever order it arrives in", () => {
    const out = clusterPins(
      [pin("dear", 10, 0, 1350), pin("cheap", 0, 0, 950)],
      project,
      6,
    );
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("950 €");
    expect(out[0].price).toBe(950);
    expect(out[0].ids[0]).toBe("cheap");
  });

  it("is stable regardless of input order", () => {
    const a = clusterPins([pin("a", 0, 0), pin("b", 20, 0)], project, 6);
    const b = clusterPins([pin("b", 20, 0), pin("a", 0, 0)], project, 6);
    expect(a[0].key).toBe(b[0].key);
  });

  it("calls a group separable when the zooms left can pull it apart", () => {
    // 20px apart, needs 57 => 2.85x => two zoom levels (4x) is enough.
    expect(clusterPins([pin("a", 0, 0), pin("b", 20, 0)], project, 2)[0].separable)
      .toBe(true);
    // One level only doubles it to 40px, still short of 57.
    expect(clusterPins([pin("a", 0, 0), pin("b", 20, 0)], project, 1)[0].separable)
      .toBe(false);
  });

  it("never calls identical coordinates separable", () => {
    const out = clusterPins([pin("a", 0, 0), pin("b", 0, 0)], project, 20);
    expect(out[0].ids).toHaveLength(2);
    expect(out[0].separable).toBe(false);
  });

  it("does not chain a line of near-misses into one pin", () => {
    // Each is 40px from the last: a joins nothing, b is 40 from a (inside 57,
    // so it joins), c is 80 from a — outside — so it starts its own group
    // rather than riding along on b.
    const out = clusterPins(
      [pin("a", 0, 0), pin("b", 40, 0), pin("c", 80, 0)],
      project,
      6,
    );
    expect(out).toHaveLength(2);
    expect(out[0].ids).toEqual(["a", "b"]);
    expect(out[1].ids).toEqual(["c"]);
  });

  it("carries every member's coordinates for a zoom-to-fit", () => {
    const out = clusterPins([pin("a", 0, 0), pin("b", 20, 20)], project, 6);
    expect(out[0].bounds).toEqual([
      [0, 0],
      [20, 20],
    ]);
  });

  it("keeps a single pin's label untouched", () => {
    const out = clusterPins([pin("solo", 0, 0, 1350)], project, 6);
    expect(out[0].label).toBe("1350 €");
    expect(out[0].separable).toBe(true);
  });

  it("widens the collision test for wider pills", () => {
    // Two "1.350 €" pills need 70px; two "950 €" need 57. At 60px apart the
    // wide pair still collides and the narrow pair does not.
    const wide = [
      { ...pin("a", 0, 0), label: "1.350 €" },
      { ...pin("b", 60, 0), label: "1.350 €" },
    ];
    expect(clusterPins(wide, project, 6)).toHaveLength(1);
    expect(clusterPins([pin("a", 0, 0), pin("b", 60, 0)], project, 6)).toHaveLength(2);
  });
});

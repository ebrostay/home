import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navMatch } from "./nav";

describe("navMatch", () => {
  it("highlights find on the search page", () => {
    expect(navMatch("/")).toBe("find");
  });

  // The bug this file exists for: signed out, "Manage Property" used to point
  // at /about#hosts, which no matcher recognised, so the pill went blank.
  // There is now one destination in both auth states.
  it("highlights list on the owner route in both auth states", () => {
    expect(navMatch("/host")).toBe("list");
  });

  it("highlights list on every owner sub-route", () => {
    expect(navMatch("/host/new")).toBe("list");
    expect(navMatch("/host/edit")).toBe("list");
    expect(navMatch("/host/manage")).toBe("list");
  });

  it("highlights nothing on pages no segment owns", () => {
    expect(navMatch("/about")).toBeNull();
    expect(navMatch("/privacy")).toBeNull();
    expect(navMatch("/sign-in")).toBeNull();
    expect(navMatch("/property")).toBeNull();
  });

  // "How it works" is an anchor on /about, which "About" does not own either.
  // It is deliberately never highlighted — asserted so a later change to make
  // it highlight is a decision someone makes, not one they trip over.
  it("never highlights how it works", () => {
    expect(navMatch("/about")).not.toBe("how");
  });

  it("sends the owner segment to one place", () => {
    const list = NAV_ITEMS.find((i) => i.key === "list");
    expect(list?.href).toBe("/host");
  });
});

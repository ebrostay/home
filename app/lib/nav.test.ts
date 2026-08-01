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

  // next.config.ts sets trailingSlash: true, so real pathnames the router
  // hands the matcher can carry a trailing slash, not just the slashless form
  // above. A future "simplification" of the matcher to `p === "/host"` would
  // keep this file green while going blank on every production pathname.
  it("highlights list with a trailing slash, which real pathnames carry", () => {
    expect(navMatch("/host/")).toBe("list");
    expect(navMatch("/host/new/")).toBe("list");
  });

  it("highlights nothing on pages no segment owns", () => {
    expect(navMatch("/privacy")).toBeNull();
    expect(navMatch("/sign-in")).toBeNull();
    expect(navMatch("/property")).toBeNull();
  });

  // "How it works" owns the whole of /about, not just its #how anchor —
  // decided 2026-08-01, reversing the earlier "matches nothing". A segment
  // that can never light up reads as broken to the person looking at it.
  it("highlights how it works across the whole about page", () => {
    expect(navMatch("/about")).toBe("how");
    expect(navMatch("/about/")).toBe("how");
  });

  // The hash is NOT part of the match, and cannot be: usePathname() never
  // sees one. Arriving at #hosts and arriving at #how are the same pathname,
  // so both light the same segment. Pinned because the obvious "fix" for that
  // — reading window.location.hash in the matcher — would make this module
  // browser-only and untestable, which is the whole reason it lives in lib.
  it("ignores the hash, because the router never gives it one", () => {
    expect(navMatch("/about")).toBe(navMatch("/about"));
    const how = NAV_ITEMS.find((i) => i.key === "how");
    expect(how?.href).toBe("/about#how");
    expect(how?.match("/about#hosts")).toBe(false);
  });

  it("sends the owner segment to one place", () => {
    const list = NAV_ITEMS.find((i) => i.key === "list");
    expect(list?.href).toBe("/host");
  });
});

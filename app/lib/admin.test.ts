import { describe, expect, it } from "vitest";
import type { AdminPropertyRow, AdminUser } from "@/lib/api";
import {
  STATUS_TABS,
  filterProperties,
  matchesQuery,
  matchesUserQuery,
  providerLabel,
  statusCounts,
  tableDate,
} from "@/lib/admin";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

const row = (over: Partial<AdminPropertyRow> = {}): AdminPropertyRow => ({
  id: "p1",
  reference: "EBR-P-0141",
  status: "published",
  name: "Ático Pedro II",
  address: "Calle Movera 7",
  area: { es: "Casco Viejo", en: "Old Town" },
  hostId: "host-1",
  hostName: "Marta",
  priceNumber: 1200,
  bedrooms: 2,
  sizeM2: 80,
  coverUrl: null,
  photoCount: 6,
  reviewNote: null,
  availableFrom: null,
  createdAt: "2026-07-01T10:00:00Z",
  updatedAt: "2026-08-01T10:00:00Z",
  ...over,
});

const user = (over: Partial<AdminUser> = {}): AdminUser => ({
  id: "d75b260a-6450-4067-bfc5-b2905e3b8182",
  provider: "ebrostay",
  name: "Marta",
  createdAt: "2026-07-01T10:00:00Z",
  lastSeenAt: "2026-08-01T10:00:00Z",
  isDeactivated: false,
  listingCount: 3,
  publishedCount: 2,
  deletionRequestedAt: null,
  ...over,
});

describe("searching the homes", () => {
  it("matches everything on an empty query", () => {
    expect(matchesQuery(row(), "   ")).toBe(true);
  });

  it("matches the name, whatever the case", () => {
    expect(matchesQuery(row(), "pedro")).toBe(true);
  });

  it("matches the street", () => {
    expect(matchesQuery(row(), "movera")).toBe(true);
  });

  // What somebody quotes at us out of a support thread.
  it("matches the reference", () => {
    expect(matchesQuery(row(), "0141")).toBe(true);
  });

  // What somebody pastes out of a URL or a log line.
  it("matches the id", () => {
    expect(matchesQuery(row(), "p1")).toBe(true);
  });

  it("matches the owner", () => {
    expect(matchesQuery(row(), "marta")).toBe(true);
  });

  it("matches the area in either language", () => {
    expect(matchesQuery(row(), "old town")).toBe(true);
    expect(matchesQuery(row(), "casco")).toBe(true);
  });

  it("survives a row with nothing filled in", () => {
    const empty = row({
      name: "",
      address: null,
      reference: null,
      hostName: null,
      area: null,
    });

    expect(matchesQuery(empty, "pedro")).toBe(false);
  });
});

describe("filtering by status", () => {
  const rows = [
    row({ id: "a", status: "published" }),
    row({ id: "b", status: "pending_review" }),
    row({ id: "c", status: "draft", name: "Movera loft" }),
  ];

  it("keeps everything under `all`", () => {
    expect(filterProperties(rows, "all", "")).toHaveLength(3);
  });

  it("keeps one status at a time", () => {
    expect(filterProperties(rows, "pending_review", "").map((r) => r.id)).toEqual(["b"]);
  });

  it("applies the status and the search together", () => {
    expect(filterProperties(rows, "draft", "loft").map((r) => r.id)).toEqual(["c"]);
    expect(filterProperties(rows, "published", "loft")).toEqual([]);
  });
});

// `closed` (design 2026-08-08) is a PUBLIC status, and since the takedown
// path was opened an admin is the only party who can move a listing out of
// it — so a reviewer answering a takedown request has to be able to find one.
// Both message files already carried the label while the strip had no tab to
// hang it on.
describe("the closed tab", () => {
  it("is offered next to published", () => {
    expect(STATUS_TABS).toContain("closed");
  });

  it("filters to the closed listings alone", () => {
    const rows = [
      row({ id: "a", status: "published" }),
      row({ id: "b", status: "closed" }),
    ];

    expect(filterProperties(rows, "closed", "").map((r) => r.id)).toEqual(["b"]);
  });

  it("counts them", () => {
    expect(statusCounts([row({ status: "closed" })]).closed).toBe(1);
  });

  // Every tab needs a word in both languages, and no tab may be a key that
  // nothing renders. This is what makes the label live copy rather than a
  // dead entry nobody notices is wrong.
  it.each(STATUS_TABS)("has a label in both languages: %s", (key) => {
    expect(en.admin.properties.tabs).toHaveProperty(key);
    expect(es.admin.properties.tabs).toHaveProperty(key);
  });
});

describe("the tab counts", () => {
  it("counts every status plus the whole set", () => {
    const counts = statusCounts([
      row({ status: "published" }),
      row({ status: "published" }),
      row({ status: "rejected" }),
    ]);

    expect(counts.all).toBe(3);
    expect(counts.published).toBe(2);
    expect(counts.rejected).toBe(1);
    expect(counts.draft).toBe(0);
  });

  // A document carrying a status this build has never heard of is counted in
  // `all` and nowhere else, rather than crashing the page it appears on.
  it("does not choke on a status it does not know", () => {
    const counts = statusCounts([
      { ...row(), status: "archived" as AdminPropertyRow["status"] },
    ]);

    expect(counts.all).toBe(1);
  });
});

describe("searching the people", () => {
  it("matches the name", () => {
    expect(matchesUserQuery(user(), "mar")).toBe(true);
  });

  // The id is the only stable handle we hold: there is no stored email.
  it("matches the id", () => {
    expect(matchesUserQuery(user(), "d75b260a")).toBe(true);
  });

  it("matches nobody it should not", () => {
    expect(matchesUserQuery(user(), "pedro")).toBe(false);
  });
});

describe("which door someone came through", () => {
  it("names both", () => {
    expect(providerLabel("ebrostay")).toBe("Ebrostay");
    expect(providerLabel("ebrostay-msa")).toBe("Microsoft");
  });

  it("shows an unknown provider as itself rather than as nothing", () => {
    expect(providerLabel("github")).toBe("github");
  });
});

describe("dates in a table cell", () => {
  it("writes a short date", () => {
    expect(tableDate("2026-08-01T10:00:00Z", "en")).toMatch(/2026/);
  });

  it("has nothing to write without a timestamp", () => {
    expect(tableDate(null, "en")).toBeNull();
  });

  // `Intl.DateTimeFormat.format` THROWS on an invalid Date. On 2026-07-30 one
  // unreadable timestamp took down the portfolio page and every listing on
  // it; a column this table merely displays must not be able to do that to
  // the twenty rows around it. (The 2026-07-30 string itself parses fine in
  // V8 — what matters is that a value no parser accepts returns null.)
  it("returns null rather than throwing on a timestamp it cannot read", () => {
    expect(tableDate("not a date", "en")).toBeNull();
    expect(tableDate("", "es")).toBeNull();
  });
});

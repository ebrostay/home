// The all-properties and users tables, as logic (spec §4.5).
//
// Filtering and searching happen HERE, in the browser, over one fetch of the
// whole set — the same choice the public search page makes, and for the same
// reason: the set is small, and a reviewer flipping between "rejected" and
// "everything" should not wait on the network to do it.

import type { AdminPropertyRow, AdminUser, PropertyStatus } from "@/lib/api";

/** The status filter, in the order the strip renders. `all` first because it
 *  is where the tab opens; the rest follow a listing's own life. */
export const STATUS_TABS = [
  "all",
  "pending_review",
  "published",
  "paused",
  "draft",
  "rejected",
] as const;

export type StatusTab = (typeof STATUS_TABS)[number];

/** Status colour, in the system's own vocabulary (`ui/Badge`): green is live,
 *  amber is waiting on us, danger is refused, neutral is not yet real. */
export const STATUS_TONE: Record<PropertyStatus, "brand" | "warn" | "danger" | "neutral" | "river"> =
  {
    published: "brand",
    pending_review: "warn",
    rejected: "danger",
    draft: "neutral",
    paused: "river",
    // Publicly visible exactly like `published` (ListingVisibility, design
    // 2026-08-08) — the owner is leaving, but the listing is still live, so
    // it gets the same "live" tone rather than a distinct one.
    closed: "brand",
  };

/** Match on everything a person might have in front of them: the name, the
 *  street, the reference from a support thread, the owner's name, and the id
 *  itself — which is what someone pastes out of a URL or a log line. */
export function matchesQuery(row: AdminPropertyRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.address, row.reference, row.hostName, row.id, row.area?.es, row.area?.en]
    .some((field) => field?.toLowerCase().includes(q));
}

export function filterProperties(
  rows: AdminPropertyRow[],
  tab: StatusTab,
  query: string,
): AdminPropertyRow[] {
  return rows.filter(
    (row) => (tab === "all" || row.status === tab) && matchesQuery(row, query),
  );
}

/** How many listings sit in each status — the numbers on the tabs. Counted
 *  over the whole set and NOT over the search results: a tab whose count
 *  changed as you typed would be answering a different question than the one
 *  it asks. */
export function statusCounts(rows: AdminPropertyRow[]): Record<StatusTab, number> {
  const counts = Object.fromEntries(STATUS_TABS.map((t) => [t, 0])) as Record<
    StatusTab,
    number
  >;
  counts.all = rows.length;
  for (const row of rows) {
    // A document carrying a status this build has never heard of is counted
    // in `all` and nowhere else, rather than crashing the page.
    if (row.status in counts) counts[row.status as StatusTab] += 1;
  }
  return counts;
}

/** A stored timestamp as a table cell: short, and NEVER able to throw.
 *
 *  `Intl.DateTimeFormat.format` throws a `RangeError` on an invalid `Date`
 *  rather than returning something useless, and on 2026-07-30 one unreadable
 *  timestamp from the API took down the whole portfolio page — every listing
 *  on it. A column this table merely displays must not be able to cost a
 *  reviewer the twenty rows around it, so an unreadable value returns null
 *  and the caller renders a dash. */
export function tableDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(at);
}

export function matchesUserQuery(user: AdminUser, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [user.name, user.id, user.provider].some((field) =>
    field?.toLowerCase().includes(q),
  );
}

/** Which door this person came through (§3.1). The same human using both
 *  doors is two accounts with two ids, which is exactly what this column is
 *  for — the support answer is "which button did you use?". */
export function providerLabel(provider: string): string {
  if (provider === "ebrostay") return "Ebrostay";
  if (provider === "ebrostay-msa") return "Microsoft";
  return provider;
}

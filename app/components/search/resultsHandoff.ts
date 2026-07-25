// ============================================================
// Session continuity between the results list and one home.
//
// The list keeps its own state in the URL (see searchUrl.ts), but two things
// don't belong there: which card the visitor was last looking at, and how a
// home's page finds its way back to the list that produced it. Neither is a
// property of the list — they are properties of this visit — and putting them
// in the URL would make every shared link carry someone else's journey.
//
// So they ride in sessionStorage, tied to the home that was opened: a "back"
// link only restores the list if this is the home the visitor actually left
// it for. Storage can throw (private mode, quota, a hand-edited value), and
// every failure here degrades to plain navigation rather than breaking it.
// ============================================================

const KEY = "ebrostay:from-results";

type Handoff = {
  id: string; // the home that was opened
  query: string; // the list's query string, "?" included, "" when unfiltered
  focus: boolean; // still owed a scroll-back — cleared once paid
};

function read(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { id, query, focus } = v as Record<string, unknown>;
    return typeof id === "string" && typeof query === "string"
      ? { id, query, focus: focus === true }
      : null;
  } catch {
    return null;
  }
}

function write(h: Handoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // No storage: the list simply won't scroll back. Nothing else depends on it.
  }
}

/** Leaving the list for a home. `query` is window.location.search. */
export function rememberResults(id: string, query: string): void {
  write({ id, query, focus: true });
}

/**
 * Back at the list: the card to put under the visitor's eye, once. Returns
 * null on a fresh visit, so an old journey can't hijack a later page load.
 */
export function takeFocus(): string | null {
  const h = read();
  if (!h?.focus) return null;
  // Keep the record, spend only the focus — the home page is still reachable
  // by Back, and its "all homes" link should keep working.
  write({ ...h, focus: false });
  return h.id;
}

/**
 * The list this home was opened from, as a query string to hang off "/".
 * Empty string when the list was unfiltered; null when this visit didn't come
 * from a list (a shared link, a new tab), so the caller links to plain "/".
 */
export function resultsQueryFor(id: string): string | null {
  const h = read();
  return h && h.id === id ? h.query : null;
}

/**
 * The last successful result of an async fetcher, remembered for the life of
 * the module — which in the exported app is a client-side session: it survives
 * route changes, dies with a real page load.
 *
 * Exists for the results list. The router remounts the list page on every
 * return from a home, and a component that remembers nothing has no choice
 * but to paint its skeleton and refetch — on a phone that is a white flash
 * and a scroll jump on every back-swipe. A page that instead seeds its state
 * from `current()` paints real cards on the first frame and lets `refresh()`
 * bring them up to date behind the visitor's back.
 *
 * A failed refresh rejects but keeps the last good value: stale homes beat a
 * skeleton that may never fill. When refreshes overlap, the later CALL wins
 * regardless of which response lands last — a slow stale response must not
 * overwrite a fresh one.
 */
export function lastKnown<T>(fetch: () => Promise<T>) {
  let value: T | null = null;
  let calls = 0;
  return {
    /** What the previous successful refresh produced, or null before one. */
    current: () => value,
    /** Fetch, remember on success, and hand the result back. */
    refresh: async (): Promise<T> => {
      const call = ++calls;
      const next = await fetch();
      if (call === calls) value = next;
      return next;
    },
  };
}

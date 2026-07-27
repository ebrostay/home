// A minimum gap between our calls to one external host.
//
// Both public services this app talks to are somebody else's free
// infrastructure: Nominatim publishes a limit of one request a second, and the
// Catastro publishes no number at all but is a government service we would
// rather not have blocked. So the app spaces its own calls.
//
// The slot is claimed SYNCHRONOUSLY, before any await. That is the whole
// design, and the obvious version gets it wrong:
//
//   const wait = last + GAP - Date.now();
//   if (wait > 0) await sleep(wait);
//   last = Date.now();               // ← too late
//
// Two callers arriving in the same tick both read the same `last`, both
// compute the same wait, both sleep, and both fire at the same instant. It
// spaces sequential calls and does nothing at all for concurrent ones — which
// are exactly the ones a rate limit exists to catch. Reserving up front gives
// the first caller 0 ms, the second GAP, the third 2×GAP, whatever the order
// they arrive in.
//
// One deliberate imprecision: a caller that aborts while waiting still holds
// its slot, so an abandoned lookup leaves a gap. Being slower than necessary
// is the safe direction for a limit that is not ours to raise.

export function createThrottle(minGapMs: number) {
  let nextFreeAt = 0;
  /** Milliseconds to wait before making the call. Reserves the slot. */
  return function claimSlot(): number {
    const now = Date.now();
    const at = Math.max(now, nextFreeAt);
    nextFreeAt = at + minGapMs;
    return at - now;
  };
}

/** Abortable sleep. A debounced field fires often, and a queued request whose
 *  query is already stale must not go on holding the line. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

"use client";

import { useEffect, useState } from "react";

// Shared by the two lists in the neighbourhood section: both measure routes,
// and both report the wait the same way — on the map's pin, never by growing a
// row (ADR-040's "one map, two lists" is also one vocabulary for waiting).

/** Nothing at all for the first `ms` of a wait.
 *
 *  A route already in Cosmos' cache comes back in a few tens of milliseconds,
 *  one this browser has cached comes back in a microtask, and one the list has
 *  already fetched comes back synchronously — showing, then hiding, an
 *  indicator for any of those is a flicker, not a report.
 *
 *  `active && elapsed` rather than a state reset: the flag is only ever turned
 *  ON by the timer, and turning it off is the caller's own `active` going
 *  away. A `setState(false)` in the effect body would be a cascading render,
 *  and the lint rule that forbids it is right — this needs no second render. */
export function useDelayed(active: boolean, ms = 300) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setElapsed(true), ms);
    return () => {
      clearTimeout(t);
      setElapsed(false);
    };
  }, [active, ms]);
  return active && elapsed;
}

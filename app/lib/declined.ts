import type { Declined } from "@/lib/api";
import { SAME_PLACE_M, metresBetween } from "@/lib/geocode";

// How an offer ends (§2.2.4, ADR-027 amendment 2026-07-28).
//
// The editor re-asks OpenStreetMap and the Catastro on every visit, so without
// this a settled disagreement is put to the owner again every time they open
// the page — and the way people end a question that will not stop being asked
// is to answer yes. That is worse than never asking: it is a pin moved, and a
// published listing pulled back into review, by someone who never evaluated
// the change.
//
// What is remembered is the ANSWER, not the fact of dismissing. A boolean
// would silence the case actually worth interrupting for: the register saying
// something new. So a decline is stored fingerprinted by the value it was
// about, and every visit compares the live answer against it.

export type Field = Declined["field"];
export type Source = Declined["source"];

/** What the owner has been told about a suggestion this visit. */
export type Verdict =
  /** Never ruled on, or ruled on under a different address or reference. */
  | "fresh"
  /** The same answer they already declined. Say nothing. */
  | "settled"
  /** They declined something, and this is not it — the source has moved. */
  | "changed";

/** The canonical string form of an offered pin. Six decimals is ~11 cm, far
 *  finer than anything either source resolves to, so nothing is lost rounding
 *  here — and a bounded string is what the API stores. */
export const pinValue = (lat: number, lng: number) =>
  `${lat.toFixed(6)},${lng.toFixed(6)}`;

const parsePin = (value: string): { lat: number; lng: number } | null => {
  const [lat, lng] = value.split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

/**
 * Is this the answer that was declined?
 *
 * The pin is stored as a string and **never compared as one**. Two geocodes of
 * the same doorway differ in their last digits, so string equality would call
 * every visit a change and re-offer forever — the same defect this exists to
 * fix, wearing a different hat. It is compared by distance, using the same
 * 25 m that decides whether a suggestion is worth showing at all.
 *
 * Everything else is a short exact value where a difference IS a difference.
 */
function sameAnswer(field: Field, declined: string, offered: string): boolean {
  if (field !== "pin") return declined === offered;
  const a = parsePin(declined);
  const b = parsePin(offered);
  // An unparseable stored value is not the offer. Re-offering is the safe
  // failure here: the owner sees a question they have answered, rather than
  // silence about one they have not.
  return a !== null && b !== null && metresBetween(a, b) <= SAME_PLACE_M;
}

/**
 * What to do about one suggestion.
 *
 * `question` is the input that produced it — the typed address for OSM, the
 * cadastral reference for the Catastro. An entry recorded against a different
 * one is ignored rather than trusted: a decision about the old address says
 * nothing about the new one, and reading it as though it did would silence a
 * suggestion the owner has never seen.
 */
export function verdictFor(
  list: Declined[],
  field: Field,
  source: Source,
  question: string,
  offered: string,
): { verdict: Verdict; at: string | null } {
  const entry = list.find(
    (d) => d.field === field && d.source === source && d.for === question,
  );
  if (!entry) return { verdict: "fresh", at: null };
  return sameAnswer(field, entry.value, offered)
    ? { verdict: "settled", at: entry.at }
    : { verdict: "changed", at: entry.at };
}

/** The list with one decision recorded. Identity is `(field, source)`, so a
 *  new ruling replaces the old one rather than stacking beside it — which is
 *  what keeps the list bounded without anything having to prune it. */
export function withDecline(
  list: Declined[],
  entry: Omit<Declined, "at">,
): Omit<Declined, "at">[] {
  return [
    ...list.filter((d) => !(d.field === entry.field && d.source === entry.source)),
    entry,
  ];
}

/**
 * Dates for what is on screen between the click and the API's reply.
 *
 * The server owns these — a client-authored "I decided this in 2019" is worth
 * nothing to the reviewer who reads it. This only keeps the display honest for
 * the round trip, and follows the same rule the server does: an unchanged
 * entry keeps the date it was first declined on, because the owner has not
 * decided anything new about it.
 */
export function stamped(
  known: Declined[],
  list: Omit<Declined, "at">[],
  today: string,
): Declined[] {
  return list.map((d) => ({
    ...d,
    at:
      known.find(
        (e) =>
          e.field === d.field &&
          e.source === d.source &&
          e.value === d.value &&
          e.for === d.for,
      )?.at ?? today,
  }));
}

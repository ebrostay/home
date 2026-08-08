// ============================================================
// What a reviewer is shown beside a listing (spec §4.5).
//
// Two independent readings, both of them SIGNALS and neither a verification:
//
//   • where the camera said each photo was taken (ADR-019 amendment)
//   • what the Catastro says about the reference the owner typed (ADR-027)
//
// Every rule here is a pure function over data the caller already holds, so
// the thresholds are testable without a network and the panels stay dumb.
// Nothing in this file decides anything: it computes readings, and a person
// reads them. There is no score, no verdict and no "suspicious" flag, on
// purpose — a surface that ranked listings by suspicion would be trusted, and
// nothing here is trustworthy enough for that. `exiftool` rewrites GPS in
// seconds and the register goes stale.
// ============================================================

import { metresBetween } from "@/lib/geocode";

export type Point = { lat: number; lng: number };

// ------------------------------------------------------------
// Photo location
// ------------------------------------------------------------

/** A photo as the admin projection sends it (`AdminPhoto`). */
export type ReviewPhoto = {
  url: string;
  capturedLat: number | null;
  capturedLng: number | null;
  capturedAt: string | null;
};

export type PhotoReading = {
  url: string;
  /** Metres from the listing pin, or null when the photo carries no fix.
   *  Null is the COMMON case and must render as "—", never as a warning:
   *  WhatsApp and most social platforms strip EXIF, screenshots never had it,
   *  and location services are off on plenty of phones. Flagging absence
   *  would flag nearly every listing and teach reviewers to skip the column. */
  metres: number | null;
  capturedAt: string | null;
};

/** Loose on purpose. These are INDOOR photos, where a phone falls back to
 *  wifi and cell positioning and can be wrong by hundreds of metres. A tight
 *  radius would flag honest listings all day, which is the failure mode that
 *  costs a signal its readers. */
export const NEAR_PIN_M = 1_000;

export type PhotoLocationSummary = {
  readings: PhotoReading[];
  /** How many photos carried a fix. Zero means there is nothing to read —
   *  not that anything is wrong. */
  located: number;
  /** The farthest single photo from the pin, in metres. */
  farthestM: number | null;
  /** The largest distance between any two located photos — the strongest of
   *  the three readings, and the reason the set is summarised rather than
   *  listed one photo at a time: a set shot in three districts is not one
   *  home, however close to the pin each individual photo happens to be. */
  spreadM: number | null;
  /** True when at least one photo sits beyond `NEAR_PIN_M`. Not a verdict —
   *  the panel says how far, and a reviewer decides what that means. */
  anyFar: boolean;
};

export function readPhotoLocations(
  photos: ReviewPhoto[],
  pin: Point,
): PhotoLocationSummary {
  const readings: PhotoReading[] = photos.map((p) => ({
    url: p.url,
    metres:
      p.capturedLat !== null && p.capturedLng !== null
        ? metresBetween(pin, { lat: p.capturedLat, lng: p.capturedLng })
        : null,
    capturedAt: p.capturedAt,
  }));

  // Both halves of a fix or neither: a photo with a latitude and no longitude
  // cannot be placed on a map, and counting it as "located" would put a number
  // in the summary that no reading stands behind.
  const located = photos.filter(
    (p) => p.capturedLat !== null && p.capturedLng !== null,
  );

  const distances = readings
    .map((r) => r.metres)
    .filter((m): m is number => m !== null);

  let spreadM: number | null = null;
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      const d = metresBetween(
        { lat: located[i].capturedLat!, lng: located[i].capturedLng! },
        { lat: located[j].capturedLat!, lng: located[j].capturedLng! },
      );
      if (spreadM === null || d > spreadM) spreadM = d;
    }
  }

  return {
    readings,
    located: located.length,
    farthestM: distances.length > 0 ? Math.max(...distances) : null,
    spreadM,
    anyFar: distances.some((m) => m > NEAR_PIN_M),
  };
}

// ------------------------------------------------------------
// Catastro (ADR-027)
// ------------------------------------------------------------

/** What the listing claims, in the four places the register can answer. */
export type ListingClaim = {
  postcode: string | null;
  sizeM2: number;
  pin: Point;
};

/** The register's answer, from `lib/catastro.ts`'s `CadastreRecord`. */
export type RegisterAnswer = {
  use: string | null;
  sizeM2: number | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
};

/** Every comparison reads the same way: what the register says, what the
 *  listing claims, and whether the two agree. `agrees: null` means the
 *  comparison could not be made — the register did not answer that field —
 *  which is a third state and never rendered as agreement. */
export type Comparison = {
  register: string | null;
  claim: string | null;
  agrees: boolean | null;
};

export type RegisterReading = {
  /** `luso`. Read on its own — there is nothing on the listing to compare it
   *  with, and it is the strongest of the four: a reference resolving to
   *  `Comercial` or `Almacén-Estacionamiento` is probably not a home. */
  use: string | null;
  isResidential: boolean | null;
  /** `sfc` against the listing's `sizeM2`. */
  size: Comparison & { differenceM2: number | null };
  /** `dp` against the listing's postcode — the cheap contradiction check. */
  postcode: Comparison;
  /** The parcel centroid against the pin. The parcel is the BUILDING, so
   *  metres here place the block, never the flat. */
  position: { metres: number | null; agrees: boolean | null };
};

/** A home. Compared on the register's own vocabulary, and lower-cased rather
 *  than matched exactly because the service is inconsistent about case. */
const RESIDENTIAL = "residencial";

/** The register's `sfc` includes a share of the common areas, so it runs
 *  ABOVE what an owner measures inside their own walls. A small excess is
 *  normal and must not read as a contradiction; this is where "small" stops.
 *  Applied in both directions — a listing claiming far MORE than the register
 *  records is the more interesting half. */
export const SIZE_TOLERANCE = 0.25;

/** The parcel centroid is the building's, and a building is tens of metres
 *  across. Beyond this the reference and the map disagree about which
 *  building this is. */
export const PARCEL_NEAR_M = 150;

export function readRegister(
  answer: RegisterAnswer,
  claim: ListingClaim,
): RegisterReading {
  const sizeAgrees =
    answer.sizeM2 === null || claim.sizeM2 <= 0
      ? null
      : Math.abs(answer.sizeM2 - claim.sizeM2) <=
        Math.max(answer.sizeM2, claim.sizeM2) * SIZE_TOLERANCE;

  const postcodeAgrees =
    answer.postcode === null || claim.postcode === null
      ? null
      : answer.postcode.trim() === claim.postcode.trim();

  const metres =
    answer.lat !== null && answer.lng !== null
      ? metresBetween(claim.pin, { lat: answer.lat, lng: answer.lng })
      : null;

  return {
    use: answer.use,
    isResidential:
      answer.use === null
        ? null
        : answer.use.toLowerCase().includes(RESIDENTIAL),
    size: {
      register: answer.sizeM2 === null ? null : `${answer.sizeM2} m²`,
      claim: claim.sizeM2 > 0 ? `${claim.sizeM2} m²` : null,
      agrees: sizeAgrees,
      differenceM2:
        answer.sizeM2 === null || claim.sizeM2 <= 0
          ? null
          : Math.round(answer.sizeM2 - claim.sizeM2),
    },
    postcode: {
      register: answer.postcode,
      claim: claim.postcode,
      agrees: postcodeAgrees,
    },
    position: {
      metres,
      agrees: metres === null ? null : metres <= PARCEL_NEAR_M,
    },
  };
}

// ------------------------------------------------------------
// Rejecting
// ------------------------------------------------------------

/** The reviewer's note, capped where the API caps it
 *  (`AdminValidation.MaxNoteLength`). The two numbers are the same number:
 *  a textarea that let someone write past the limit would lose the note at
 *  the moment they pressed the button. */
export const MAX_NOTE_LENGTH = 2000;

// ------------------------------------------------------------
// How long the queue has been waiting
// ------------------------------------------------------------

/** Whole hours a listing has been in the queue, floored. The queue's job is
 *  to make the longest wait visible, so this is the number the row is sorted
 *  and shaped by — an owner watching nothing happen is the cost of a slow
 *  queue, and the surface should say it out loud. */
export function waitingHours(submittedAt: string | null, now: Date): number | null {
  if (!submittedAt) return null;
  const then = new Date(submittedAt);
  if (Number.isNaN(then.getTime())) return null;
  const hours = Math.floor((now.getTime() - then.getTime()) / 3_600_000);
  // A clock skew between the browser and the function host can put a
  // submission a few seconds in the future. Zero, not a negative wait.
  return Math.max(0, hours);
}

/** The wait, as the ledger writes it: "6 h", "2 d 04 h". Days appear only
 *  once there is a day to show — a queue that reads "0 d 06 h" on everything
 *  buries the row that says "5 d". */
export function formatWait(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d ${String(hours % 24).padStart(2, "0")} h`;
}

/** Where a wait sits against the promise the queue makes to owners. Three
 *  steps, not a gradient: the bar is a glance, and a continuous scale would
 *  make every row look slightly different and none of them urgent. */
export type WaitBand = "fresh" | "due" | "late";

/** A submission answered inside a day is fast; past two days the owner has
 *  been waiting over a weekend. */
export const DUE_HOURS = 24;
export const LATE_HOURS = 48;

export function waitBand(hours: number | null): WaitBand {
  if (hours === null || hours < DUE_HOURS) return "fresh";
  return hours < LATE_HOURS ? "due" : "late";
}

import { describe, expect, it } from "vitest";
import {
  DUE_HOURS,
  LATE_HOURS,
  NEAR_PIN_M,
  PARCEL_NEAR_M,
  SIZE_TOLERANCE,
  formatWait,
  readPhotoLocations,
  readRegister,
  waitBand,
  waitingHours,
  type ReviewPhoto,
} from "@/lib/review";

// The two review signals, as numbers (spec §4.5). Pinned here rather than
// through the panels because the thresholds are the part that decides what a
// reviewer is told, and they must be checkable without a browser or the
// Catastro's live service.

// Plaza del Pilar. Everything below is measured from here.
const PIN = { lat: 41.6563, lng: -0.8779 };

const photo = (
  url: string,
  lat: number | null = null,
  lng: number | null = null,
): ReviewPhoto => ({ url, capturedLat: lat, capturedLng: lng, capturedAt: null });

/** Roughly `metres` north of the pin — one degree of latitude is ~111 km. */
const north = (metres: number) => ({
  lat: PIN.lat + metres / 111_320,
  lng: PIN.lng,
});

describe("photo locations (ADR-019 amendment)", () => {
  it("reads nothing at all from a set with no coordinates", () => {
    const summary = readPhotoLocations([photo("a"), photo("b")], PIN);

    expect(summary.located).toBe(0);
    expect(summary.farthestM).toBeNull();
    expect(summary.spreadM).toBeNull();
    // The common case is never a warning: most photos have no fix, and a
    // panel that flagged their absence would flag nearly every listing.
    expect(summary.anyFar).toBe(false);
  });

  it("renders an unlocated photo as no distance, not as zero", () => {
    const [reading] = readPhotoLocations([photo("a")], PIN).readings;

    expect(reading.metres).toBeNull();
  });

  it("needs both halves of a fix", () => {
    const half: ReviewPhoto = {
      url: "a",
      capturedLat: PIN.lat,
      capturedLng: null,
      capturedAt: null,
    };

    expect(readPhotoLocations([half], PIN).located).toBe(0);
  });

  it("measures each photo from the pin", () => {
    const p = north(500);
    const summary = readPhotoLocations([photo("a", p.lat, p.lng)], PIN);

    expect(summary.readings[0].metres).toBeGreaterThan(450);
    expect(summary.readings[0].metres).toBeLessThan(550);
  });

  it("keeps a photo inside the loose radius unflagged", () => {
    const p = north(NEAR_PIN_M - 200);

    expect(readPhotoLocations([photo("a", p.lat, p.lng)], PIN).anyFar).toBe(false);
  });

  it("flags a photo beyond it", () => {
    const p = north(NEAR_PIN_M + 500);

    expect(readPhotoLocations([photo("a", p.lat, p.lng)], PIN).anyFar).toBe(true);
  });

  // The strongest of the three readings, and the reason the set is summarised
  // rather than listed one photo at a time: three photos taken 4 km apart are
  // not one home, however close to the pin each of them is.
  it("measures the spread between the located photos", () => {
    const a = north(-2_000);
    const b = north(2_000);
    const summary = readPhotoLocations(
      [photo("a", a.lat, a.lng), photo("b", b.lat, b.lng), photo("c")],
      PIN,
    );

    expect(summary.located).toBe(2);
    expect(summary.spreadM).toBeGreaterThan(3_800);
  });

  it("has no spread to report from a single located photo", () => {
    const p = north(100);

    expect(readPhotoLocations([photo("a", p.lat, p.lng), photo("b")], PIN).spreadM)
      .toBeNull();
  });
});

describe("the register (ADR-027)", () => {
  const claim = { postcode: "50003", sizeM2: 80, pin: PIN };
  const answer = {
    use: "Residencial",
    sizeM2: 88,
    postcode: "50003",
    lat: PIN.lat,
    lng: PIN.lng,
  };

  it("reads a residential use as a home", () => {
    expect(readRegister(answer, claim).isResidential).toBe(true);
  });

  it("reads a commercial one as not", () => {
    expect(readRegister({ ...answer, use: "Comercial" }, claim).isResidential)
      .toBe(false);
  });

  it("does not decide from a use the register did not give", () => {
    expect(readRegister({ ...answer, use: null }, claim).isResidential).toBeNull();
  });

  // `sfc` includes a share of the common areas, so it runs ABOVE what an
  // owner measures inside their own walls. A small excess is normal.
  it("accepts a built surface a little above the claim", () => {
    expect(readRegister(answer, claim).size.agrees).toBe(true);
  });

  it("does not accept one far above it", () => {
    const far = { ...answer, sizeM2: Math.ceil(80 * (1 + SIZE_TOLERANCE) * 1.5) };

    expect(readRegister(far, claim).size.agrees).toBe(false);
  });

  it("reads the difference in both directions", () => {
    expect(readRegister(answer, claim).size.differenceM2).toBe(8);
    expect(readRegister({ ...answer, sizeM2: 60 }, claim).size.differenceM2).toBe(-20);
  });

  it("cannot compare a size the register did not give", () => {
    const reading = readRegister({ ...answer, sizeM2: null }, claim);

    expect(reading.size.agrees).toBeNull();
    expect(reading.size.differenceM2).toBeNull();
  });

  it("catches a contradicting postcode", () => {
    expect(readRegister({ ...answer, postcode: "50018" }, claim).postcode.agrees)
      .toBe(false);
  });

  it("cannot compare a postcode the listing has not given", () => {
    expect(readRegister(answer, { ...claim, postcode: null }).postcode.agrees)
      .toBeNull();
  });

  it("accepts a parcel centroid within the building", () => {
    const near = north(PARCEL_NEAR_M - 50);
    const reading = readRegister({ ...answer, ...near }, claim);

    expect(reading.position.agrees).toBe(true);
  });

  it("flags a centroid that places a different building", () => {
    const far = north(PARCEL_NEAR_M + 400);
    const reading = readRegister({ ...answer, ...far }, claim);

    expect(reading.position.agrees).toBe(false);
    expect(reading.position.metres).toBeGreaterThan(PARCEL_NEAR_M);
  });

  it("cannot place a parcel the coordinate service did not answer for", () => {
    const reading = readRegister({ ...answer, lat: null, lng: null }, claim);

    expect(reading.position.metres).toBeNull();
    expect(reading.position.agrees).toBeNull();
  });
});

describe("how long the queue has waited", () => {
  const now = new Date("2026-08-08T12:00:00Z");
  const hoursAgo = (h: number) =>
    new Date(now.getTime() - h * 3_600_000).toISOString();

  it("counts whole hours", () => {
    expect(waitingHours(hoursAgo(5.5), now)).toBe(5);
  });

  it("has nothing to count without a timestamp", () => {
    expect(waitingHours(null, now)).toBeNull();
  });

  // One unreadable timestamp took down the whole portfolio page on
  // 2026-07-30. A queue must not be losable the same way — an arithmetic on
  // `NaN` would put "NaN h" in every row rather than throw, which is worse:
  // it looks like data.
  //
  // Note the 2026-07-30 string itself (`07/22/2026 12:00:00`) is NOT the
  // case to test here: V8 parses that non-standard US format quite happily.
  // What has to be survived is a value no parser accepts.
  it("survives a timestamp it cannot read", () => {
    expect(waitingHours("not a date", now)).toBeNull();
    expect(waitingHours("", now)).toBeNull();
  });

  // A clock skew between the browser and the function host can date a
  // submission a few seconds into the future.
  it("never reports a negative wait", () => {
    expect(waitingHours(hoursAgo(-2), now)).toBe(0);
  });

  it("writes hours alone under a day", () => {
    expect(formatWait(6)).toBe("6 h");
  });

  it("writes days and hours past one", () => {
    expect(formatWait(52)).toBe("2 d 04 h");
  });

  it("writes a dash when there is nothing to say", () => {
    expect(formatWait(null)).toBe("—");
  });

  it("bands the wait in three steps", () => {
    expect(waitBand(1)).toBe("fresh");
    expect(waitBand(DUE_HOURS)).toBe("due");
    expect(waitBand(LATE_HOURS)).toBe("late");
    expect(waitBand(null)).toBe("fresh");
  });
});

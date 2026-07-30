import { describe, expect, it } from "vitest";
import { shortDate, type ShortMonths } from "@/lib/dates";

// The abbreviations as they stand in messages/{es,en}.json. Copied rather than
// imported so a change to the message files has to be made deliberately here
// too — these strings are the whole point of the module.
const ES: ShortMonths = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const EN: ShortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

const sept = new Date(2026, 8, 3);
const march = new Date(2026, 2, 1);

describe("shortDate", () => {
  it("lays the parts out in the order each language reads them", () => {
    expect(shortDate(sept, EN, { locale: "en", day: true, year: true })).toBe("3 Sept 2026");
    expect(shortDate(sept, ES, { locale: "es", day: true, year: true })).toBe("3 sept 2026");
    expect(shortDate(sept, EN, { locale: "en", year: true })).toBe("Sept 2026");
    expect(shortDate(sept, EN, { locale: "en", day: true })).toBe("3 Sept");
    expect(shortDate(sept, EN, { locale: "en" })).toBe("Sept");
  });

  it("takes the month word from the caller, never from the runtime", () => {
    // The failure this module exists for is a runtime whose ICU spells the
    // month differently from the one that built the HTML. If Intl could still
    // reach the output, that difference would still get through — so assert on
    // words no ICU would ever produce.
    const shouting: ShortMonths = Array.from({ length: 12 }, (_, i) => `M${i + 1}`);
    expect(shortDate(sept, shouting, { locale: "en", day: true, year: true })).toBe("3 M9 2026");
    expect(shortDate(march, shouting, { locale: "es", year: true })).toBe("M3 2026");
  });

  it("accepts a bare locale or a full one — call sites carry both", () => {
    expect(shortDate(march, ES, { locale: "es-ES", day: true })).toBe(
      shortDate(march, ES, { locale: "es", day: true }),
    );
    expect(shortDate(march, EN, { locale: "en-GB", day: true })).toBe(
      shortDate(march, EN, { locale: "en", day: true }),
    );
  });

  it("keeps Intl's own layout for every month it does not have to touch", () => {
    for (let m = 0; m < 12; m++) {
      const d = new Date(2026, m, 7);
      const intl = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(d);
      // Same string as Intl's, with only the month word substituted — which
      // for this table is a no-op on the runtime that built it.
      expect(shortDate(d, EN, { locale: "en", day: true, year: true })).toBe(intl);
    }
  });
});

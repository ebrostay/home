import { describe, expect, it } from "vitest";
import { resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("honours a stored choice over anything the browser says", () => {
    expect(resolveLocale("en", ["es-ES"])).toBe("en");
    expect(resolveLocale("es", ["en-US"])).toBe("es");
  });

  it("ignores a stored value that is not a locale we serve", () => {
    expect(resolveLocale("de", ["en-US"])).toBe("en");
    expect(resolveLocale("", ["es-ES"])).toBe("es");
    expect(resolveLocale(null, ["es-ES"])).toBe("es");
  });

  it("reads the primary subtag, not the full tag", () => {
    expect(resolveLocale(null, ["es-AR"])).toBe("es");
    expect(resolveLocale(null, ["es-419"])).toBe("es");
    expect(resolveLocale(null, ["en-GB"])).toBe("en");
    expect(resolveLocale(null, ["ES"])).toBe("es");
  });

  it("takes the first language the visitor actually reads, in their order", () => {
    expect(resolveLocale(null, ["fr-FR", "en-GB", "es-ES"])).toBe("en");
    expect(resolveLocale(null, ["de-DE", "es-ES", "en-US"])).toBe("es");
  });

  it("sends a browser that reads neither to English", () => {
    expect(resolveLocale(null, ["de-DE", "fr-FR"])).toBe("en");
  });

  it("falls back to Spanish when the browser says nothing at all", () => {
    expect(resolveLocale(null, [])).toBe("es");
    expect(resolveLocale(null, undefined)).toBe("es");
    expect(resolveLocale(undefined, null)).toBe("es");
  });
});

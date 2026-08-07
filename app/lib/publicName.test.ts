import { describe, expect, it } from "vitest";
import { formulaName } from "@/lib/publicName";

describe("formulaName (OD-10)", () => {
  it("strips the calle prefix and the house number, appends the area", () => {
    expect(formulaName("Calle de Pedro II el Católico 3", "Universidad"))
      .toBe("Pedro II el Católico — Universidad");
    expect(formulaName("Pedro II el Católico 3", "Universidad"))
      .toBe("Pedro II el Católico — Universidad");
  });
  it("keeps meaningful road types", () => {
    expect(formulaName("Avenida de Madrid 120", "Delicias"))
      .toBe("Avenida de Madrid — Delicias");
  });
  it("handles unit suffixes and nº forms", () => {
    expect(formulaName("Calle Cortes de Aragón 5-7, 2º Izq", "Centro"))
      .toBe("Cortes de Aragón — Centro");
    expect(formulaName("C/ Delicias nº 12", "Delicias"))
      .toBe("Delicias — Delicias");
  });
  it("degrades gracefully", () => {
    expect(formulaName("Gran Vía", null)).toBe("Gran Vía");
    expect(formulaName(null, "Centro")).toBe("");
    expect(formulaName("  ", "Centro")).toBe("");
  });
});

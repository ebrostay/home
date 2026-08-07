// OD-10 (decision log): the public name is a formula — street without number
// + neighbourhood — prefilled in the editor; the owner may override.
export function formulaName(street: string | null, areaEs: string | null): string {
  if (!street) return "";
  let s = street.trim();
  s = s.replace(/^(calle|c\.|c\/)\s+(de\s+la\s+|de\s+los\s+|del\s+|de\s+)?/i, "");
  // Drop everything from the first house-number-ish token on: "3", "5-7",
  // "nº 12", and any unit tail after it ("2º Izq").
  s = s.replace(/[,\s]+(n[ºo°]?\s*)?\d.*$/i, "");
  s = s.trim().replace(/[,\s]+$/, "");
  if (!s) return "";
  const area = areaEs?.trim();
  return area ? `${s} — ${area}` : s;
}

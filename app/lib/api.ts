// Typed client for the C# API (api/Models/PublicModels.cs projections).
// Same-origin "/api" in production (SWA); NEXT_PUBLIC_API_BASE points dev
// at the local func host (func start --cors http://localhost:3000).

export type Bilingual = { es: string | null; en: string | null };
export type PublicRange = { start: string; end: string }; // end exclusive
export type PropertyPhoto = { url: string; isFloorplan: boolean; sortOrder: number };

export type PropertySummary = {
  id: string;
  city: string;
  type: string;
  name: string;
  area: Bilingual | null;
  lat: number;
  lng: number;
  guests: number;
  bedrooms: number;
  bathrooms: number;
  sizeM2: number;
  priceNumber: number;
  billsPolicy: "included" | "capped" | "excluded";
  amenities: string[];
  isNew: boolean;
  checked: boolean;
  depositProtected: boolean;
  availableFrom: string | null;
  coverUrl: string | null;
  availability: PublicRange[];
};

export type PropertyDetail = Omit<PropertySummary, "coverUrl"> & {
  address: string | null;
  copy: Bilingual | null;
  details: Bilingual | null;
  beds: Bilingual | null;
  priceNote: Bilingual | null;
  floorNumber: number | null;
  energyRating: string | null;
  petsAllowed: boolean;
  smokingAllowed: boolean;
  couplesAllowed: boolean;
  selfCheckin: boolean;
  videoUrl: string | null;
  depositAmount: number | null;
  upfrontRentEur: number | null;
  utilitiesCapEur: number | null;
  minStayMonths: number;
  maxStayMonths: number;
  photos: PropertyPhoto[];
};

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number) {
    super(`API ${status}`);
  }
}

export const fetchProperties = () => get<PropertySummary[]>("/properties");
export const fetchProperty = (id: string) =>
  get<PropertyDetail>(`/properties/${encodeURIComponent(id)}`);

export const biText = (b: Bilingual | null | undefined, locale: string) =>
  (locale === "en" ? b?.en ?? b?.es : b?.es ?? b?.en) ?? "";

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
  /** Optional terms the owner confirmed apply. Terms the listing already
   *  implies (bills, deposit) are derived instead — see StayTerms.tsx. */
  stayTerms: string[];
  photos: PropertyPhoto[];
};

// The five states a listing moves through (spec-v2 §2.2.1). Stored values, not
// labels: the portfolio page maps them to owner-facing words in both locales.
export type PropertyStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "rejected"
  | "paused";

export type HostRange = PublicRange & { status: string | null; note: string | null };

/** An owner's own listing (api/Models/HostModels.cs) — carries the things the
 *  public projection strips: lifecycle status, the reviewer's note, and how
 *  much of the listing is still empty. */
export type HostProperty = {
  id: string;
  status: PropertyStatus;
  reviewNote: string | null;
  /** Human-quotable listing reference (EBR-P-0141); null on older listings. */
  reference: string | null;
  name: string;
  address: string | null;
  area: Bilingual | null;
  bedrooms: number;
  bathrooms: number;
  sizeM2: number;
  priceNumber: number;
  coverUrl: string | null;
  photoCount: number;
  sectionsDone: number;
  sectionsTotal: number;
  requestCount: number;
  oldestRequestAt: string | null;
  availableFrom: string | null;
  updatedAt: string | null;
  availability: HostRange[];
};

export type BillsPolicy = "included" | "capped" | "excluded";

/** The six fields Manage may edit. They apply live and never change `status`
 *  (ADR-025) — which is why they travel as their own object, not as a partial
 *  listing. `maxStayMonths` is read-only here: the platform sets the ceiling. */
export type HostPricing = {
  priceNumber: number;
  depositAmount: number | null;
  billsPolicy: BillsPolicy;
  utilitiesCapEur: number | null;
  minStayMonths: number;
  maxStayMonths: number;
};

/** A logged booking request, as the owner is allowed to see it. No tenant
 *  identity: Ebrostay owns every tenant conversation (spec-v2 §4.3). */
export type HostRequestRow = {
  id: string;
  startDate: string | null;
  endDate: string | null;
  months: number;
  status: "new" | "contacted" | "confirmed" | "declined";
  channel: string | null;
  createdAt: string | null;
};

export type HostPropertyDetail = {
  property: HostProperty;
  pricing: HostPricing;
  requests: HostRequestRow[];
};

/** What the owner may write to the calendar. Everything here is stored
 *  `confirmed`; holds belong to the booking flow and survive a save. */
export type AvailabilityWrite = { start: string; end: string; note: string | null };

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as T;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return (await res.json()) as T;
}

// The API answers a rejected write with a stable `error` code, never prose —
// the copy for it lives in the message files, in both locales.
async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error;
  } catch {
    return undefined;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code?: string,
  ) {
    super(`API ${status}${code ? ` ${code}` : ""}`);
  }
}

export const fetchProperties = () => get<PropertySummary[]>("/properties");
export const fetchHostProperties = () => get<HostProperty[]>("/host/properties");
export const fetchProperty = (id: string) =>
  get<PropertyDetail>(`/properties/${encodeURIComponent(id)}`);

export const fetchHostProperty = (id: string) =>
  get<HostPropertyDetail>(`/host/properties/${encodeURIComponent(id)}`);

export const saveHostPricing = (
  id: string,
  pricing: Omit<HostPricing, "maxStayMonths">,
) => put<HostPricing>(`/host/properties/${encodeURIComponent(id)}/pricing`, pricing);

export const saveHostAvailability = (id: string, blocks: AvailabilityWrite[]) =>
  put<HostRange[]>(`/host/properties/${encodeURIComponent(id)}/availability`, {
    blocks,
  });

export const biText = (b: Bilingual | null | undefined, locale: string) =>
  (locale === "en" ? b?.en ?? b?.es : b?.es ?? b?.en) ?? "";

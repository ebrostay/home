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
  /** One-off turnover charge at move-in, already resolved from the listing's
   *  cleaning arrangement and the platform rate (ADR-026). */
  cleaningFeeEur: number;
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

export type HostRange = PublicRange & {
  status: string | null;
  note: string | null;
  /** Admin-set, for a stay whose turnaround cannot be staffed in the listing's
   *  usual window. Null means "use the listing's turnoverDays". */
  turnoverDaysOverride: number | null;
};

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

export type CleaningBy = "host" | "platform";

/** The fields Manage may edit. They apply live and never change `status`
 *  (ADR-025) — which is why they travel as their own object, not as a partial
 *  listing. `maxStayMonths` and `platformCleaningFeeEur` are read-only here:
 *  both are platform policy, not this listing's to set. */
export type HostPricing = {
  priceNumber: number;
  depositAmount: number | null;
  billsPolicy: BillsPolicy;
  utilitiesCapEur: number | null;
  minStayMonths: number;
  maxStayMonths: number;
  /** Days shut after every stay for inspection, meters and the deep clean. */
  turnoverDays: number;
  cleaningBy: CleaningBy;
  /** Set only when the owner does the turnaround themselves. */
  cleaningFeeEur: number | null;
  /** What Ebrostay charges instead. Read-only — policy, not a listing field. */
  platformCleaningFeeEur: number;
};

export type HostPhoto = {
  url: string;
  isFloorplan: boolean;
  /** Server-assigned. The editor sends position as array order instead, so a
   *  gap or a repeat in this number can never reorder the gallery. */
  sortOrder: number;
};

/** The content half of a listing — what the editor edits, and what re-enters
 *  review when saved (ADR-025/ADR-027). Kept apart from `HostPricing` for
 *  exactly that reason: saving one of these changes `status`, saving one of
 *  those does not. */
export type HostListing = {
  name: string;
  type: string;
  address: string | null;
  postcode: string | null;
  /** As typed. Nothing verifies it against the Catastro, so nothing may
   *  render a "matched" badge beside it. */
  cadastralRef: string | null;
  lat: number;
  lng: number;
  area: Bilingual | null;
  copy: Bilingual | null;
  /** The owner stands behind the English description. Only `copy` is gated. */
  copyEnApproved: boolean;
  details: Bilingual | null;
  beds: Bilingual | null;
  guests: number;
  bedrooms: number;
  bathrooms: number;
  sizeM2: number;
  floorNumber: number | null;
  energyRating: string | null;
  amenities: string[];
  petsAllowed: boolean;
  smokingAllowed: boolean;
  couplesAllowed: boolean;
  selfCheckin: boolean;
  photos: HostPhoto[];
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

/** An outside answer the owner has already ruled on (§2.2.4, ADR-027). Kept
 *  apart from `HostListing` on purpose: inside it, dismissing a suggestion
 *  would count as an unsaved content change and take the listing back to
 *  review. */
export type Declined = {
  field: "pin" | "postcode" | "area" | "size";
  source: "osm" | "catastro";
  /** What was offered, canonically. The pin is `"lat,lng"` — stored as a
   *  string, never compared as one (`lib/declined.ts`). */
  value: string;
  /** The question it answers: the typed address for OSM, the cadastral
   *  reference for the Catastro. When that moves, the entry stops applying. */
  for: string;
  /** Server-stamped `YYYY-MM-DD`. */
  at: string;
};

export type HostPropertyDetail = {
  property: HostProperty;
  pricing: HostPricing;
  listing: HostListing;
  declined: Declined[];
  requests: HostRequestRow[];
};

/** What a content save answers with. The property row travels back because the
 *  save may have moved `status` to `pending_review` — and the page has a status
 *  pill on screen still claiming it did not. */
export type HostListingSaved = {
  property: HostProperty;
  listing: HostListing;
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
  pricing: Omit<HostPricing, "maxStayMonths" | "platformCleaningFeeEur">,
) => put<HostPricing>(`/host/properties/${encodeURIComponent(id)}/pricing`, pricing);

export const saveHostListing = (id: string, listing: HostListing) =>
  put<HostListingSaved>(`/host/properties/${encodeURIComponent(id)}`, listing);

/** Applies live and never touches `status` — dismissing a suggestion is not a
 *  content edit (ADR-027 decision 5). The list is replaced wholesale; the API
 *  answers with the stored version, whose `at` dates are its own. */
export const saveHostDeclined = (id: string, declined: Omit<Declined, "at">[]) =>
  put<Declined[]>(`/host/properties/${encodeURIComponent(id)}/declined`, { declined });

/** Pause or reopen. The API accepts nothing else here — publishing is an admin
 *  act, and `paused → published` is the only reopen (ADR-024). */
export const saveHostStatus = (id: string, status: "paused" | "published") =>
  put<HostProperty>(`/host/properties/${encodeURIComponent(id)}/status`, { status });

export const saveHostAvailability = (id: string, blocks: AvailabilityWrite[]) =>
  put<HostRange[]>(`/host/properties/${encodeURIComponent(id)}/availability`, {
    blocks,
  });

export const biText = (b: Bilingual | null | undefined, locale: string) =>
  (locale === "en" ? b?.en ?? b?.es : b?.es ?? b?.en) ?? "";

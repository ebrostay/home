// Typed client for the C# API (api/Models/PublicModels.cs projections).
// Same-origin "/api" in production (SWA); NEXT_PUBLIC_API_BASE points dev
// at the local func host (func start --cors http://localhost:3000).

import type { NearbyGroup, NearbyProfile, Reach } from "@/lib/nearby";
import type { BilingualDoc } from "@/lib/rich-text";

export type Bilingual = { es: string | null; en: string | null };
export type PublicRange = { start: string; end: string }; // end exclusive
/** `cardUrl`/`detailUrl` are the sizes the upload pipeline derives (§2.2.2);
 *  null on photos that predate it, so every surface falls back to `url`. The
 *  capture coordinates are deliberately absent — admin-only, and this is the
 *  shape a visitor receives. */
export type PropertyPhoto = {
  url: string;
  cardUrl: string | null;
  detailUrl: string | null;
  isFloorplan: boolean;
  sortOrder: number;
  /** A photo kept out of the gallery — it exists only to be referenced from
   *  the description. The public detail projection already sends this;
   *  `Gallery.tsx`/`property/page.tsx` filtering on it is Task 11. */
  hiddenFromGallery: boolean;
};

/** How far a place is, by one means of travel — `api/Models/NearbyModels.cs`
 *  `NearbyReach`, keyed by `NearbyProfile`. A profile the router could not
 *  reach on (e.g. no route on foot) is simply absent, never a zeroed entry —
 *  use `reachFor` from `@/lib/nearby` rather than indexing this map, so an
 *  absent profile cannot be read as a distance of zero. */
export type NearbyReachMap = Partial<Record<NearbyProfile, Reach>>;

/** A nearby entry as a visitor may see it (`api/Models/PublicModels.cs`
 *  `PublicNearby`). Narrower than the owner's shape on purpose: `osmId`,
 *  `measuredAt` and `needsCheck` are provenance and internal state — see
 *  `HostNearbyEntry`, which is this shape plus those three fields. */
export type PublicNearbyEntry = {
  id: string;
  group: NearbyGroup;
  type: string | null;
  customType: Bilingual | null;
  name: string;
  lat: number;
  lng: number;
  reach: NearbyReachMap;
};

/** A nearby entry as the OWNER sees it (`api/Models/HostModels.cs`
 *  `HostListing.Nearby`, the raw `NearbyEntry`) — wider than the public
 *  projection: `osmId`/`measuredAt` are provenance, and `needsCheck` flags an
 *  entry farther than its group's radius allows and wanting a second look. */
export type HostNearbyEntry = PublicNearbyEntry & {
  osmId: string | null;
  measuredAt: string | null;
  needsCheck: boolean;
};

/** One Overpass POI near a point, with its measured reach — what the owner's
 *  candidate search (`GET /api/host/nearby/candidates`) answers with, before
 *  the owner has chosen to save it as a `HostNearbyEntry` (`api/Services/
 *  NearbyLookup.cs` `NearbyCandidate`). */
export type NearbyCandidate = {
  osmId: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  reach: NearbyReachMap;
};

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
  coverCardUrl: string | null;
  coverDetailUrl: string | null;
  availability: PublicRange[];
};

export type PropertyDetail = Omit<
  PropertySummary,
  "coverUrl" | "coverCardUrl" | "coverDetailUrl"
> & {
  address: string | null;
  copy: BilingualDoc | null;
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
  nearby: PublicNearbyEntry[];
  /** Set only when the API handed this page back to its own owner while the
   *  listing is not published (ADR-029) — it carries the lifecycle state that
   *  is keeping it out of search. Null on every page a guest can reach, so
   *  truthiness is the whole test for "this is a preview". */
  previewStatus: Exclude<PropertyStatus, "published"> | null;
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
  /** `"own_use"` carries no turnaround (ADR-031) — the owner closed these
   *  dates themselves and nobody schedules a clean after them. Null is a stay
   *  and keeps the full ADR-026 buffer. Server-decided on save; the client
   *  sets it only on blocks it has just created and not yet saved. */
  kind: string | null;
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
  /** The full-size master. Always present, and the fallback every surface
   *  uses for photos uploaded before the pipeline existed. */
  url: string;
  /** Derived sizes (§2.2.2). Null on older photos. */
  cardUrl: string | null;
  detailUrl: string | null;
  isFloorplan: boolean;
  /** Server-assigned. The editor sends position as array order instead, so a
   *  gap or a repeat in this number can never reorder the gallery. */
  sortOrder: number;
  /** A photo kept out of the gallery — it exists only to be referenced from
   *  the description. Not yet carried by `HostListing`'s C# shape or
   *  `ToListing`'s mapping (`api/Models/HostModels.cs`) — that plumbing is
   *  Task 10 Step 0; this type is declared ahead of it. */
  hiddenFromGallery: boolean;
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
  copy: BilingualDoc | null;
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
  nearby: HostNearbyEntry[];
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
  return write<T>("PUT", path, body);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return write<T>("POST", path, body);
}

async function write<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
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

/** Bring a listing into existence (ADR-030). No body: the wizard's first step
 *  is the address, and it saves that through the same content endpoint the
 *  editor uses — a create that also took content would be a second way to
 *  write the same fields, validated in a second place. Answers with the same
 *  detail a GET returns, so the wizard holds exactly what the editor holds. */
export const createHostProperty = () =>
  post<HostPropertyDetail>("/host/properties", {});

/** Send a finished draft to the review queue. The API accepts this from
 *  `draft` and `rejected` alone, and only when the listing meets all eleven
 *  completeness checks — `submitBlockers` in lib/wizard.ts is the client's
 *  copy of that list, so this should never be reached while it is non-empty. */
export const submitHostProperty = (id: string) =>
  put<HostProperty>(`/host/properties/${encodeURIComponent(id)}/status`, {
    status: "pending_review",
  });

export const saveHostPricing = (
  id: string,
  pricing: Omit<HostPricing, "maxStayMonths" | "platformCleaningFeeEur">,
) => put<HostPricing>(`/host/properties/${encodeURIComponent(id)}/pricing`, pricing);

export const saveHostListing = (id: string, listing: HostListing) =>
  put<HostListingSaved>(`/host/properties/${encodeURIComponent(id)}`, listing);

/** Upload one photo (ADR-019). Multipart rather than JSON because the payload
 *  is bytes; the API answers with the listing's whole photo list, so the
 *  caller never has to guess where the new one landed or what the server named
 *  it. Applies live and does not move `status` — the content save that follows
 *  is what carries a listing back into review. */
export async function uploadHostPhoto(
  id: string,
  file: Blob,
  isFloorplan: boolean,
): Promise<HostPhoto[]> {
  const body = new FormData();
  // The name is the server's to choose; this one only rides along so the
  // request is a well-formed file part.
  body.append("photo", file, "photo");
  body.append("isFloorplan", String(isFloorplan));

  const res = await fetch(`${BASE}/api/host/properties/${encodeURIComponent(id)}/photos`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return (await res.json()) as HostPhoto[];
}

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

// ---------------------------------------------------------------------------
// "What's nearby" (ADR-028): the shared vocabulary, the owner's candidate
// search and route preview, and the public, anonymous per-entry route lookup.
// These four hit `api/Functions/NearbyFunctions.cs` directly with `fetch`
// rather than the `get`/`put` helpers, because the vocabulary and route calls
// are cancellable mid-flight (the map redraws on every candidate hover) and
// `get`/`put` do not thread an `AbortSignal`.
// ---------------------------------------------------------------------------

export type RouteLine = { polyline: string; metres: number; seconds: number };

/** The type vocabulary, served from the API so `NearbyGroups.cs` stays its
 *  one definition (`app/lib/nearby.ts` keeps only the compile-time groups and
 *  profiles). Anonymous and cacheable — see the route comment above it. */
export async function fetchNearbyVocabulary(
  signal?: AbortSignal,
): Promise<{ groups: { key: string; types: string[] }[]; profiles: string[] }> {
  const res = await fetch(`${BASE}/api/nearby/vocabulary`, { signal });
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return (await res.json()) as { groups: { key: string; types: string[] }[]; profiles: string[] };
}

/** Owner-authenticated Overpass search around a point, bounded to Zaragoza and
 *  a known group server-side. Answers with candidates that already carry a
 *  measured `reach` — the editor never measures anything itself. */
export async function fetchNearbyCandidates(
  lat: number,
  lng: number,
  group: NearbyGroup,
  signal?: AbortSignal,
): Promise<NearbyCandidate[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    group,
  });
  const res = await fetch(`${BASE}/api/host/nearby/candidates?${params}`, { signal });
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return (await res.json()) as NearbyCandidate[];
}

/** Owner-authenticated route preview for a candidate not yet saved — stores
 *  nothing, unlike `fetchNearbyRoute` below. */
export async function fetchPreviewRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  profile: NearbyProfile,
  signal?: AbortSignal,
): Promise<RouteLine> {
  const params = new URLSearchParams({
    lat: String(from.lat),
    lng: String(from.lng),
    toLat: String(to.lat),
    toLng: String(to.lng),
    profile,
  });
  const res = await fetch(`${BASE}/api/host/nearby/preview-route?${params}`, { signal });
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return (await res.json()) as RouteLine;
}

/** Loading the route for one SAVED entry. Anonymous, and takes ids rather than
 *  coordinates — `RouteCache` on the server is the only place that turns them
 *  into a `from`/`to` pair, which is what stops an anonymous caller from
 *  routing arbitrary points at our expense.
 *
 *  The 503 case is distinguished from a 404 because they mean different
 *  things to the reader: "we could not reach the routing service" is
 *  temporary, "no such entry" is not. Both surface as `ApiError.status`, so a
 *  caller checks that rather than the (absent, on a 404) body. */
export async function fetchNearbyRoute(
  propertyId: string,
  entryId: string,
  profile: NearbyProfile,
  signal?: AbortSignal,
): Promise<RouteLine> {
  const res = await fetch(
    `${BASE}/api/properties/${encodeURIComponent(propertyId)}/nearby/${encodeURIComponent(entryId)}/route?profile=${profile}`,
    { signal },
  );
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return (await res.json()) as RouteLine;
}

export const biText = (b: Bilingual | null | undefined, locale: string) =>
  (locale === "en" ? b?.en ?? b?.es : b?.es ?? b?.en) ?? "";

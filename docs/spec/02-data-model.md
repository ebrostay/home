# Ebrostay v2 Target Spec — §2 Data Model

> Target: branch `redesign/v2`, locked 2026-07-19. Status tags: ✅ decided/locked · 🔜 planned · 🗑️ not carried from v1.
> v1 data model: conceptual fields carry over; storage moves Postgres → Cosmos (v1 spec on `main`). Decisions: [ADR-011, ADR-014, ADR-016, ADR-019, ADR-028](05-decision-log.md).

Storage moves from Supabase Postgres to **Azure Cosmos DB (free tier,
provisioned 1000 RU/s shared, NoSQL API)**. This is a **fresh start** (ADR-016): no v1 production data is
imported; the schemas below are designed for Cosmos, not translated
row-for-row. The *conceptual* fields of v1 §4 carry over; the relational
apparatus (RLS, FKs, GiST constraints, triggers) is replaced by **API-enforced
invariants** — the C# functions are the only writers (§3.5).

Conventions: all dates are ISO `YYYY-MM-DD` strings; all `*At` timestamps are
ISO 8601 UTC; money fields are numbers in euros (integers for authored prices,
2-decimal numbers for computed amounts, v1 practice carried); bilingual
text uses `{ es, en }` objects instead of v1's `*_es`/`*_en` column pairs.

---

## 2.1 Account, database, containers ✅

Cosmos account **`ebrostay-cosmos`** (free tier, NoSQL, spaincentral, §1.2)
→ database **`ebrostay`** (shared **1000 RU/s** — the free-tier allowance —
across all containers) → eight containers:

| Container | Partition key | One document per | Writers (via API only) |
| --- | --- | --- | --- |
| `properties` | `/id` | listing (photos + availability + nearby **embedded**) | host (own, pre-publish states), admin |
| `profiles` | `/id` | signed-in user (bootstrapped, §3.6) | the system (bootstrap), admin (deactivation), the owner (their own closure flag — §3.7, ADR-042) |
| `bookingRequests` | `/propertyId` | logged booking request | booking function (insert), admin (status) |
| `inquiries` | `/id` | contact-form inquiry | anyone incl. anonymous (insert), admin (read) |
| `nearbyCandidates` | `/cell` | cached Overpass answer for one rounded cell + group | the candidate lookup (§2.2.5, ADR-028) |
| `nearbyRoutes` | `/propertyId` | one routed geometry, `(entryId, profile)` | the anonymous public route lookup, write-through (§2.2.5, ADR-028) |
| `serviceBudget` | `/id` | one calendar day's outbound service-call count (ORS; also the import rate limits) | `OrsBudget` (§2.2.5, ADR-028), `ImportFunctions` (ADR-033) |
| `importJobs` | `/id` | one AI-assisted import job (7-day TTL) — stage, per-job callback token, and the proposal, which **never** lands on a listing (ADR-033 Decision 4) | `ImportFunctions` (start/poll/reap/cancel), the pipeline via the token-checked callback |

Partition-key rationale:

- `properties` and `profiles` partition on `/id`: small, point-read-dominated
  containers; every access is by id (property page, profile check).
- `bookingRequests` partitions on `/propertyId`: the hot queries are "requests
  for property X" (host dashboard) and admin listing (cross-partition, cheap at
  this volume); grouping by property keeps the host query single-partition.
- `nearbyCandidates` partitions on `/cell` — a rounded `"lat|lng|group"` key
  (§2.2.5) — because POIs do not move and every read and write is by that
  exact cell.
- `nearbyRoutes` partitions on `/propertyId`, the shape `bookingRequests`
  already uses, because every route is always fetched or invalidated within
  one property's set (§2.2.5, ADR-028 Decision 5).
- `serviceBudget` partitions on `/id`, one document per calendar day, because
  every read-then-write is a point operation against that single counter
  (§2.2.5, ADR-028 "Consequences to watch").
- `importJobs` partitions on `/id`: every access — the owner's 2-second poll,
  the pipeline callback, the reaper — is a 1-RU point read/replace of one job,
  under ETag concurrency (ADR-033 Decisions 7, 11). The 7-day TTL is the
  retention rule.
- No container for **favorites** (🚫 out of MVP scope, carried from v1),
  **bookings** (🗑️ Stripe path not carried, ADR-016), **owner_leads** (🗑️
  superseded by the self-serve host flow, ADR-014), **owner_payout_details**
  and **property_guest_info** (🔜 not in initial v2 scope; re-add as
  containers or embedded sub-documents when host payouts / guest info ship).

**Integrity without FKs/constraints:** Cosmos has no cross-document
constraints. The API enforces: property `id` uniqueness (Cosmos id+PK gives
this for free), availability-block overlap rules (§2.2.3) via **ETag
optimistic concurrency** on the property document (read → validate → replace
with `If-Match`), and snapshot fields on `bookingRequests` (denormalized on
insert, never updated — same intent as v1 §4.16).

---

## 2.2 Container: `properties` ✅

One document per listing. `id` remains a human-readable slug (v1 practice,
used in URLs). Photos and availability are **embedded** (§2.2.2, §2.2.3).

```jsonc
{
  "id": "pedro1",                     // PK + partition key; slug, used in URLs
  "status": "published",              // lifecycle §2.2.1
  "reviewNote": null,                 // set on rejection; cleared on resubmit
  "hostId": "<profile id>",           // owner of the listing (SWA principal id)

  // — location & identity (v1 §4.2 conceptual fields) —
  "city": "zaragoza",
  "type": "apartment",                // apartment | room | home
  "name": "Pedro II el Católico 3 - 1 IZQ",
  "addressKey": "pedro",              // map-pin grouping key
  "address": "Pedro II el Católico 3, Zaragoza",
  "postcode": "50009",                // ✅ 5 digits, validated (ADR-027)
  "cadastralRef": null,               // ✅ as typed; nothing verifies it against
                                      //   the Catastro, so no surface claims a
                                      //   match (ADR-027)
  "lat": 41.65393, "lng": -0.90783,
  "declinedSuggestions": [],          // ✅ outside answers the owner has already
                                      //   ruled on, so they are not re-offered
                                      //   until they change (§2.2.4, ADR-027)

  // — street band, derived from the pin, never typed (ADR-041) —
  "band": {
    "line": [ { "lat": 41.65476, "lng": -0.9077912 },
              { "lat": 41.65393, "lng": -0.9078300 },
              { "lat": 41.65310, "lng": -0.9078604 } ],  // ✅ the disclosure
                                      //   segment: the whole street or a
                                      //   ≤~250 m stretch cut at junction
                                      //   nodes, the home off-center by a
                                      //   fixed, stable per-listing offset
    "midLat": 41.65393, "midLng": -0.90783,   // the search/list projection's
                                      //   public point (see below)
    "sampleA": { "lat": 41.65467, "lng": -0.907807 },   // SERVER-ONLY — the
    "sampleB": { "lat": 41.65319, "lng": -0.907857 },   //   two routing
                                      //   origins, ~10 m inside the segment
                                      //   ends, never the junction node
                                      //   (ADR-041 point 3). MUST NEVER
                                      //   reach a public projection
    "streetName": "Calle de Pedro II El Católico",
    "derivedAt": "2026-08-05T11:02:00Z"
  },

  // — bilingual description —
  "area":    { "es": "…", "en": "…" },
  "description":    { "es": { "type": "doc", "content": [ … ] },   // ✅ a rich-text
               "en": { "type": "doc", "content": [ … ] } }, //   DOCUMENT, not
                                      //   a string — a closed node schema,
                                      //   §2.2.6 (ADR-032)
  "details": { "es": "…", "en": "…" },
  "beds":    { "es": "…", "en": "…" },
  "priceNote": { "es": "…", "en": "…" },   // optional
  "descriptionEnApproved": true,             // ✅ the owner stands behind the English
                                      //   description. Only `description` is gated —
                                      //   the rest are short labels (ADR-027)

  // — capacity & attributes —
  "guests": 4, "bedrooms": 3, "bathrooms": 1, "sizeM2": 75,
  "floorNumber": 1,
  "amenities": ["wifi", "desk", "lift", "heating", "kitchen"],
  "amenitiesAbsent": ["parking", "ac"],   // ✅ baseline amenities answered NO.
                                      //   A baseline key in NEITHER array has
                                      //   never been asked — a third state the
                                      //   owner's editor reports and the public
                                      //   page deliberately does not: it states
                                      //   every baseline the listing does not
                                      //   CLAIM as missing, so a document
                                      //   written before this field reads the
                                      //   same as one written after.
                                      //   Vocabulary: app/lib/amenities.ts.
                                      //   The API checks key SHAPE only
                                      //   ([a-z0-9-]{1,32}), plus one pair
                                      //   rule — a key cannot be in both.
  "energyRating": "C",
  "petsAllowed": false, "smokingAllowed": false, "couplesAllowed": true,
  "selfCheckin": true,
  "videoUrl": null,

  // — pricing (ADR-023: the headline price is a price for THIRTY DAYS;
  //   rent = stayDays × price÷30, collected per calendar month. v1 §5.1's
  //   whole-month math is superseded) —
  "priceNumber": 950,                 // price per 30 days, whole EUR — all math
  "priceLabel": "950 EUR",
  "depositAmount": 950,               // nullable → treated as 0
  "upfrontRentEur": 950,
  "billsPolicy": "included",          // included | capped | excluded (v1 ADR-008;
                                      //   the legacy billsIncluded boolean is 🗑️
                                      //   dropped — fresh start, no legacy rows)
  "utilitiesCapEur": null,
  "minStayMonths": 1, "maxStayMonths": 11,   // 11, not 12: 12 calendar months is
                                      //   365 days on the nose, which the
                                      //   <365-day ceiling disallows (ADR-022/023)

  // — turnover (ADR-026) —
  "turnoverDays": 3,                  // ✅ days shut after a stay for
                                      //   inspection, meter readings, deep
                                      //   clean, repairs. Applied by the
                                      //   overlap predicate, never written as
                                      //   a block (§2.2.3)
  "cleaningBy": "platform",           // ✅ host | platform — who arranges it
  "cleaningFeeEur": null,             // ✅ set only when cleaningBy == "host";
                                      //   the platform rate is the
                                      //   PLATFORM_CLEANING_FEE_EUR app
                                      //   setting, not a listing field

  // — badges / flags (no `rating`: ratings were dropped with the `best`
  //   sort — with no review system a stored rating is an unverifiable
  //   claim, §4.1) —
  "isNew": false, "checked": true, "depositProtected": true,
  "availableFrom": "2026-07-01",

  // — embedded photos (§2.2.2) —
  "photos": [
    { // the full-size master, and the fallback every surface can always use
      "url": "https://ebrostayphotos.blob.core.windows.net/property-photos/pedro1/9f3a…-full.webp",
      // ✅ the derived sizes the public pages actually serve. Null on photos
      //    uploaded before the pipeline existed
      "cardUrl": "…/9f3a…-card.webp",       // 800 px long edge
      "detailUrl": "…/9f3a…-detail.webp",   // 1600 px long edge
      "isFloorplan": false, "sortOrder": 10,
      // ✅ kept out of the gallery — exists only to be referenced from the
      //    description (§2.2.6, ADR-032 D10). NEGATIVE and defaults to
      //    `false`: no document written before this field existed carries
      //    it, and a positive `inGallery` flag would deserialize
      //    missing-as-false and empty every gallery on the site.
      "hiddenFromGallery": false,
      // where the camera said it was — admin-only, see §2.2.2
      "capturedLat": 41.65393, "capturedLng": -0.90783, "capturedAt": "2026-05-14T10:22:07Z" }
  ],

  // — embedded availability (§2.2.3) —
  "availability": [
    { "start": "2026-07-04", "end": "2026-07-11", "status": "confirmed",
      "kind": "own_use",              // ✅ own_use = owner-closed dates, no
                                      //   turnaround after them; null/absent =
                                      //   a stay, full buffer (ADR-031). The
                                      //   owner's endpoint STAMPS it, never
                                      //   accepts it
      "note": "Reforma cocina" },
    { "start": "2026-09-01", "end": "2026-10-01", "status": "hold",
      "holdExpiresAt": "2026-07-20T11:30:00Z" }
  ],

  // — AI-assisted import provenance (ADR-033 Decision 8) —
  "imported": ["price", "sizeM2"],    // ✅ fields whose current value arrived
                                      //   from an import and has not been
                                      //   reviewed — the marks ARE the review
                                      //   surface, so they survive reload
  "importSource": "https://…",        // the portal URL the proposal came from

  // — embedded "what's nearby" entries (§2.2.5, ADR-028) —
  "nearby": [
    { "id": "8f2c1e4a9b7d4c3e", "group": "transport", "type": "tram",
      "customType": null, "name": "Gran Vía", "lat": 41.6512, "lng": -0.9021,
      // ✅ measured, never client-supplied (Decision 8 below)
      "reach": { "foot": { "metres": 420, "minutes": 6 },
                 "car": { "metres": 900, "minutes": 3 } },
      "osmId": "node/612233981", "measuredAt": "2026-07-28T09:15:00Z",
      "needsCheck": false }
  ],

  "createdAt": "2026-07-19T10:00:00Z",
  "updatedAt": "2026-07-19T10:00:00Z"
}
```

**Public projection:** anonymous/`GET /api/properties*` responses include only
documents `PublicStatus.IsPublic` accepts — `published` **and** `closed`
(§2.2.1 "the three gates"; `closed` per ADR-042), never `status: "published"`
alone — and **strip** `reviewNote`, `hostId`, and
`availability[].note` / `availability[].holdExpiresAt` — the public
availability shape is date ranges only (`{start, end}` pairs), never user
identifiers or notes. This resolves v1's `availability_blocks.user_id`/`note`
world-readability leak **by design** (v1 spec §11, open decision #1).
`nearby[].osmId` / `.measuredAt` / `.needsCheck` are stripped the same way —
they are provenance for the owner and the (planned) admin review, not a guest
fact (§2.2.5).

**`address`, `lat` and `lng` never reach an anonymous response (ADR-041).**
The list projection (`PropertySummary`) reuses its existing `lat`/`lng`
fields for a different meaning — the band's `midLat`/`midLng` when one
exists, else the door rounded to 3 decimal places (~110 m) for a listing
still `band: null` — never the exact pin. The detail projection
(`PropertyDetail`) drops `address`/`lat`/`lng` entirely and gains `band`:
`double[][]` `[lat, lng]` pairs mirroring `band.line`, or `null` when
degraded. `band.sampleA`/`sampleB` never leave the server in either
projection — they exist only to be handed to ORS.

**One exception, `GET /api/properties/{id}` only (ADR-029):** the owner of a
listing receives that same projection for their own listing in **any** status,
carrying one added field — `previewStatus`, the stored lifecycle value, `null`
on every read a guest can perform. Ownership is `hostId == principal.userId`,
resolved in the Function; anonymous callers and signed-in non-owners still get
a flat **404**, never a 401 or 403, so the id space stays opaque. The response
carries `Cache-Control: no-store`. **`GET /api/properties` (the list) has no
such exception** — an unpublished listing never appears in search.

**The street band is derived, never typed (ADR-041).** `band` holds a
`StreetBand` (`api/Models/PropertyDoc.cs`): `line` (the disclosure segment,
as points along it), `midLat`/`midLng` (the segment's midpoint), `sampleA`/
`sampleB` (the two routing origins, server-only), `streetName`, and
`derivedAt`. `StreetBandService` (`api/Services/StreetBandService.cs`)
derives it from OSM with three Overpass queries — the nearest named way
within 40 m of the pin, that street's same-named ways within 600 m merged
into one chain, and other-named ways within 600 m for their node ids, which
mark the junctions the chain is cut at — then slices a segment around the
pin, off-center by a fixed per-listing offset, and picks `sampleA`/`sampleB`
10 m inside each cut end (never on the junction node itself — ADR-041 point
3). It runs on a host save when the pin moves or the property has no band
yet, and lazily on `GET /api/properties/{id}` for an already-published
listing saved before the band existed. The host enters nothing to produce
it — the editor's `LocationPicker` still shows only the exact pin (owner
views stay exact, per §5's ADR-041 "Settled with the lock" section); no
editor or admin band preview is built yet (ADR-041's 2026-08-07 amendment,
`docs/spec/05-decision-log.md`; tracked in KAN-49). **Derivation
failure (or a listing not yet re-saved/re-read) leaves `band: null` —
degraded:** the
summary point falls back to the door rounded to 3 decimal places, and the
detail page's whole "Where you'll be" section (map, ranges, your-places)
disappears rather than showing something less precise than a real band.

### 2.2.1 Property status lifecycle ✅ (ADR-014, `paused` per ADR-024, edit split per ADR-025, `closed` per ADR-042)

**Six statuses:** `draft`, `pending_review`, `rejected`, `published`, `paused`,
`closed`.

```
draft ──submit──▶ pending_review ──approve──▶ published ──pause──▶ paused
  ▲                    │                          ▲                  │
  │                 reject(note)                  └───── reopen ─────┘
  └──edit/resubmit── rejected

account closure (ADR-042) — written ONLY by /api/account/closure:

  pending_review ──request──▶ draft
  published ─────request──▶ closed ──cancel, or admin pause──▶ paused
```

| Transition | Who | Notes |
| --- | --- | --- |
| (create) → `draft` | any authenticated user (becomes `hostId`) | New listings always start as drafts, invisible publicly. |
| `draft` → `pending_review` | host (own) | "Submit for review". Validation: required fields present in **both** locales, ≥1 photo. |
| `pending_review` → `published` | **admin only** | Approve. Clears `reviewNote`. |
| `pending_review` → `rejected` | **admin only** | Reject **with a `reviewNote`** (shown to the host). |
| `rejected` → `pending_review` | host (own) | Edit + resubmit. |
| `published` → `pending_review` | host (own), on any **content** edit | Edited listings re-enter the review queue and are **not public** until re-approved (locked decision: "new/edited listings … only go public after approval"). **Operational** edits — price, deposit, bills policy + cap, `minStayMonths`, and the availability calendar — do **not** trigger this and leave `status` untouched (ADR-025). Keeping the prior version live during a content review is an open refinement (OD-5, §5). |
| `published` → `paused` | host (own) or admin | Closed to new requests and invisible in search; the listing and its history are kept. Admin may also pause as a takedown. **Narrowed from "any → `paused`" (ADR-027):** paired with the reopen row below, pausing a `draft` and then reopening it would publish a listing no reviewer ever saw. Admins keep the any → any row. |
| `paused` → `published` | host (own) or admin | "Reopen". No re-review: the listing was already approved and paused changes nothing about it. An **edit** while paused follows the normal rule and goes back to `pending_review`. |
| `published` → `closed` | **`POST /api/account/closure` only** — never a host and never an admin, directly | The owner asked to close their account (ADR-042). `published` is the only status the public list can see, so it is the only one that has to move. `closed` stays **public**: a guest mid-stay must not watch the page disappear. `AccountClosure.OnRequest` (`api/Models/AccountModels.cs`). |
| `pending_review` → `draft` | **`POST /api/account/closure` only** | Withdrawn from the queue by the same request, so no reviewer can approve a home for a departing owner. The owner resubmits (and re-passes the completeness checks) if they cancel. `paused`, `draft` and `rejected` are left alone — they are already invisible, and moving `paused` to `closed` would make it *more* visible. |
| `closed` → `paused` | the owner's `DELETE /api/account/closure`, or **admin** via `PUT /api/staff/properties/{id}/status` | Cancelling restores **only what moved**, and lands it in `paused`, not `published` — nothing returns to search without a deliberate reopen (ADR-042). `AccountClosure.OnCancel`; the admin half is `AdminValidation.Pausable = ["published", "closed"]` (`api/Models/AdminModels.cs`), which exists because deactivating a closing owner would otherwise leave a public home no endpoint in the product could move. |
| `closed` → `rejected` | **admin only** | Takedown (fraud, a legal request) is not less urgent because the owner is leaving. `AdminValidation.Rejectable` carries `closed` alongside `pending_review`/`published`/`paused`. |
| `closed` → `pending_review` | host (own), on a **content** edit | The `published` rule above, applied to the other public status: `ListingVisibility.ReEntersReview` carries `closed`. Normally unreachable — a closing owner is write-blocked (§3.7) — but the closure fan-out writes listings first and the profile flag last, so *(listings `closed`, flag unset)* is what any failure in between leaves behind, and in that window the owner is fully writable and holds a live listing. |
| any → any | **admin** | Admins may edit any listing directly without re-review (the reviewer needs no reviewer). |

**An owner can never set `closed`, and can never leave it.** The two halves are
enforced by two different things, and it matters which:

- **Into `closed`** — `HostValidation.OwnerStatuses` (`api/Models/HostWrites.cs`)
  is `["paused", "published", "pending_review"]`, and it governs the **target**
  status only. `closed` is not in it, so an owner cannot close a listing without
  closing their account.
- **Out of `closed`** — nothing to do with that array. It is the
  **current-status** clauses in `HostValidation.CheckStatus`: `published`
  requires `paused`, `paused` requires `published` or `paused`, and
  `pending_review` requires `draft` or `rejected`. A listing sitting in `closed`
  matches no "from" side, so every owner transition out of it is refused
  `status_not_allowed`.

Do not merge the two in your head. Adding `"closed"` to `OwnerStatuses` while
trusting it to cover the "from" side would be a hole, not a widening:
`next == "closed"` matches none of the current-status clauses, so it would be
accepted **from any status**. `closed` is the first status in v2 an owner
cannot set. That exclusion is precisely *why* the admin
`closed → paused` row above had to exist: without it, an owner deactivated
mid-closure had a public listing and no way out of it, since their own
`DELETE /api/account/closure` is refused once `isDeactivated` is set.

`draft`, `pending_review` and `rejected` documents are visible only to their
host and to admins. **The old enumeration stopped there and it was wrong by
omission**: `paused` is only *nearly* private — its listing page is not public,
but its **route** endpoints still answer anyone — and `closed` is public
outright. See the three gates below before writing a fourth. There is no
`is_published` boolean (v1 §4.2) — `status` is the single source of
visibility.

#### Who may see a listing: the three gates ⚠️

**Adding a status? Consider it against all three of these, not one.** They are
not the same set, the differences are deliberate, and the drift between them
has been a bug three times (2026-08-01, and twice on 2026-08-08 during the
ADR-042 build). Each lives in code, is named, and is cited by the guards that
use it.

| Gate | Statuses | Who asks | Where |
| --- | --- | --- | --- |
| `PublicStatus.IsPublic` | `published`, `closed` | the public list (`GET /api/properties`) and the public detail (`GET /api/properties/{id}`) | `api/Models/AccountModels.cs`, called at `api/Functions/PropertiesFunctions.cs:29` and `:89` |
| `ListingVisibility.ForRoutes` | `published`, `paused`, `closed` | the anonymous route endpoints (`PropertyNearbyRoute`, `PropertyPlaceRoute`) | `api/Models/ListingVisibility.cs` |
| `ListingVisibility.ReEntersReview` | `published`, `paused`, `closed` | a **write** rule, not a visibility one: does saving content send this listing back to the queue? | `api/Models/ListingVisibility.cs` |

- **`ForRoutes` is deliberately broader than `IsPublic`.** `paused` belongs
  there and not here: a guest who already holds the link — or a map tile
  fetched moments before the owner paused it — should not watch the routes
  break. The two must never collapse into one call.
- **`ReEntersReview` is not a visibility gate at all**, but it enumerates the
  same three statuses and was missed once. Anything publicly visible that an
  owner can still edit has to be in it, or the ADR-025/ADR-030 back door
  reopens: a live listing edited without re-review.
- Everything not in a gate 404s for a stranger — never 401 or 403 — except to
  the owner previewing their own listing (ADR-029, `ListingView.OwnerPreview`).

### 2.2.2 Embedded photos ✅

Carried conceptually from v1 `property_photos` (§4.11): `url` (full public
Blob URL, container `property-photos`, path `{propertyId}/{timestamp}-{name}`),
`isFloorplan` (floor plans render in their own section, excluded from the
gallery), `sortOrder` (ascending; lowest = cover; reorder renumbers 10, 20,
30…). Embedded rather than a separate container because photos are only ever
read *with* their property and only written through the property-editor API.
Upload pipeline (validation, compression, 1-year cache headers): §4.4 of
[04-functional-flows.md](04-functional-flows.md).

**Three sizes per photo** ✅, all WebP, written by one upload
(`POST /api/host/properties/{id}/photos`):

| Field | Long edge | Serves |
| --- | --- | --- |
| `url` | 2560 px | The master. Every other size is derived from it, which is why the browser is never allowed to produce a final size — a browser-made thumbnail would be a lossy master. |
| `detailUrl` | 1600 px | The property page's gallery hero (~630 px CSS, so 1600 covers it at 2×). |
| `cardUrl` | 800 px | Search results (407 px CSS — almost exactly a retina card) and the editor's own grid. |

The widths come from what actually renders, not from a round-number ladder.
Clients emit all three as a `srcset` with a per-position `sizes` and let the
browser choose; **null on photos that predate the pipeline**, and every surface
falls back to `url`, so an old listing keeps working and simply ships more
bytes than it needs to.

`capturedLat` / `capturedLng` / `capturedAt` ✅ hold what the camera's EXIF
said, extracted during the upload re-encode that **strips EXIF from the
published file** (ADR-019 amendment). All nullable and usually null — WhatsApp
and most social platforms strip EXIF, screenshots never had it, and plenty of
people keep location off.

**Admin-only.** They never appear in the public property projection or the
host's own — which is why `PublicPhoto` and `HostPhoto` exist as narrower
records rather than the stored one being handed out. They are for the review
queue's photo check (§4.5), and they are location data about a real person's
whereabouts: an owner who uploads a shot taken at their private home has told
us where they live. Deleted with the photo, along with all three blobs.

### 2.2.3 Embedded availability ✅ — and why embedded

Each entry: `{ start, end, status, holdExpiresAt?, note?, kind?,
turnoverDaysOverride? }`.

- **`end` is EXCLUSIVE** (checkout day). ⚠️ This is a deliberate change from
  v1, where `availability_blocks.end_date` was *inclusive* and three different
  overlap-bound conventions coexisted (v1 §5.4.2, flagged 🐞 in
  §5.2.1). v2 normalizes every range in the system — blocks, searches, stays —
  to half-open `[start, end)` and uses **one** overlap predicate everywhere
  (client grid filter, client estimate conflict check, server booking
  validation, server block-write validation):

  ```
  overlaps(a, b) = a.start < b.end AND b.start < a.end
  ```

- `status`: `confirmed` (permanent block / accepted stay) or `hold`
  (temporary; `holdExpiresAt` required). **Expired holds are treated as
  available by client and server identically** — this encodes the v2
  resolution of v1 open decision #2 / 🐞 §5.4.4:

  ```
  blocking(entry, now) = entry.status == "confirmed"
                         OR (entry.status == "hold" AND entry.holdExpiresAt > now)
  ```

- **Turnover buffer** ✅ (ADR-026, own-use exemption ADR-031). A home is not
  relettable the day the keys come back: the inventory has to be checked, the
  meters read (ADR-023 settles utilities after move-out), and a stay measured
  in months needs a deep clean, not a turnover clean. Every blocking entry
  that is a **stay** therefore shuts the `turnoverDays` that follow it —
  dates the owner closed for themselves (`kind: "own_use"`) get **no**
  buffer, because no clean is scheduled and none is charged (ADR-031):

  ```
  turnover(entry, property) =
      entry.kind == "own_use" ? 0
                              : entry.turnoverDaysOverride ?? property.turnoverDays
  effectiveEnd(entry, property) = entry.end + turnover(entry, property) days
  ```

  The buffer is **derived inside the predicate**, never written to
  `availability` — a stored buffer would be a second copy of a rule and would
  go stale the moment either the rule or the stay moved. `turnoverDaysOverride`
  is admin-set, for when operations cannot get a cleaning team into the slot
  (it outranks both kinds — the escape hatch for own use that *does* need
  staffed work). `kind` is **stamped by the owner's availability endpoint,
  never accepted from the payload**: a span the owner writes for the first
  time is their own use — the only thing that endpoint can express — and a
  span already on the document keeps what it was. Absent means "a stay", the
  safe default: an unlabelled block over-blocks a few days rather than
  letting a tenant into a home nobody prepared. Owners see the buffer as a
  distinct **turnaround** state; guests just see dates that are unavailable.

- `note` is host/admin-internal and is stripped from all public responses
  (§2.2 public projection).
- **Write invariant** (replaces the v1 GiST constraint): the API rejects a new
  or edited `confirmed` entry that `overlaps()` an existing *blocking* entry.
  Enforced in the function under ETag optimistic concurrency (read document →
  validate → conditional replace), which makes check-then-write race-safe.

**Why embedded, not a separate container:** a listing has a small, bounded
number of blocks (tens, not thousands — v1 sample data has ≤2 per home), and
every consumer (search overlap filter, calendar, estimate widget, booking
validation) needs the property *and* its calendar together. Embedding makes
that a single point read, keeps calendar+property updates atomic (one document,
one ETag — the overlap invariant needs no cross-document transaction), and
avoids cross-partition fan-out in search. The known trade-off — document
growth — is bounded: blocks for stays long past may be pruned by an admin.
Revisit only if a listing's calendar approaches document-size limits, which at
1–11-month stays it cannot realistically do.

v1's `availability_blocks.user_id` (tenant assigned to a stay, powering "My
stays") is **not carried** — tenant-assigned stays are out of initial v2 scope
(the v2 host dashboard covers own listings + requests instead, §4.4).

### 2.2.4 Declined suggestions ✅ (ADR-027 amendment 2026-07-28)

The editor asks OpenStreetMap and the Catastro about a listing on every visit,
and offers what they say where it differs from what the owner wrote (§4.4).
This is how an offer *ends*.

```jsonc
"declinedSuggestions": [
  {
    "field": "pin",              // pin | postcode | area | size
    "source": "osm",             // osm | catastro
    "value": "41.628945,-0.881226",
    "for": "Calle Movera 7, Zaragoza",
    "at": "2026-07-28"
  }
]
```

- **Identity is `(field, source)`.** A new decline for the same pair replaces
  the old one, so the list is self-limiting at one entry per combination. The
  write path validates both against the closed vocabularies above and caps the
  length regardless — it is a client-supplied list.
- **`for` is the input that produced the suggestion** — the typed `address` for
  OSM, the `cadastralRef` for the Catastro. When that input changes the entry
  is dropped: a decision about the old address says nothing about the new one.
- **`value` is what was offered, canonically.** The `pin` is stored as
  `"lat,lng"` at six decimals but **compared by distance**, not as a string —
  two geocodes of the same doorway differ in the last digits, and string
  equality would re-offer forever. `postcode`, `area` and `size` are exact.
- **Nullable in effect:** absent or `[]` on every listing until an owner
  declines something.

**It is not a copy of the register.** Nothing reads it as a fact about the
property: it never fills a field, is never displayed as what the Catastro said,
and is compared against only by the fresh live answer. Going stale is not a
failure here — a fingerprint that no longer matches *is* the signal that the
outside source changed, which is the one case worth interrupting an owner for.
ADR-027 Decision 6 has the full reasoning against 4b's "nothing from the
Catastro is stored".

**Host-writable, and therefore not evidence.** It arrives from the client, so
a forged entry is possible; what it buys is silence in the owner's own editor
and nothing more. The review queue never reads it as a resolution — it asks the
register live and sees the disagreement regardless (§4.5).

**Not part of the content payload.** Declining applies live on the click via
its own endpoint and leaves `status` untouched. Riding the content `PUT` would
pull a published listing back into review for dismissing a banner (ADR-027
Decision 5), and it is absent from the editor's diff for the same reason.

### 2.2.5 Embedded nearby entries, and the three containers behind them ✅ (ADR-028, built 2026-07-29)

`properties.nearby[]` (shape above) is a `NearbyEntry`: a place the owner
picked, with a group, a type, a name, a point, and **measured** figures. It
replaces `PLACEHOLDER_NEARBY` (`app/lib/detail-placeholders.ts`, now deleted)
and the old "central Zaragoza" figures. Capped by validation at **6 per group,
24 per listing** — tens, not thousands, like the calendar (§2.2.3).

```jsonc
{
  "id": "8f2c1e4a9b7d4c3e",   // server-generated (a client id only ever
                              // MATCHES an existing entry, never creates one
                              // under an id of the caller's choosing)
  "group": "transport",       // closed vocabulary, §2.2.5 below
  "type": "tram",             // vocabulary key, or null if customType is set
  "customType": null,         // { es, en? } — the Spanish-first escape hatch
  "name": "Gran Vía",         // a proper noun: one string, not bilingual
  "lat": 41.6512, "lng": -0.9021,
  "reach": {                  // ✅ NEVER accepted from a client (Decision 8)
    "foot": { "metres": 420, "minutes": 6 },
    "car":  { "metres": 900, "minutes": 3 }
  },
  "osmId": "node/612233981",  // provenance; null for a manually-added place
  "measuredAt": "2026-07-28T09:15:00Z",
  "needsCheck": false,        // true when a re-measurement (pin moved) landed
                              // outside the group's radius — the SELECTION is
                              // now suspect, not just the number
  "reachBands": {             // ✅ ADR-041 point 3 — null until a band exists.
                              //   Min/max over the door + both inset segment
                              //   samples, ONLY for a profile that already has
                              //   a `reach` entry (an unroutable profile has
                              //   nothing to range over either)
    "foot": { "minMinutes": 5, "maxMinutes": 7 },
    "car":  { "minMinutes": 3, "maxMinutes": 4 }
  }
}
```

**§2.2 Public projection strips `osmId`, `measuredAt` and `needsCheck`** — see
above. Everything else is what the guest-facing "What's nearby" section reads
(§4.2, merged with §7 "Where you'll be" per ADR-028 Decision 9). **`reach`
itself is transformed, not passed through (ADR-041 point 3):** the public
`PublicNearby.reach` carries a `PublicReach` per profile —
`{ minMinutes, maxMinutes, metres }`, metres always coarsened to the nearest
50 m — built from `reachBands` when present, or degrading to a flat
min = max range from the plain `reach.minutes` for an entry saved before
bands existed. The owner's own view keeps the exact `reach`/`reachBands`
figures untouched; only the anonymous/guest projection ranges them.

**Reach figures are never accepted from a client, under any endpoint.** The
owner's `PUT /api/host/properties/{id}` payload (`NearbyWrite`,
`api/Models/HostWrites.cs`) carries no `reach`, `osmId` or `measuredAt` field
at all — the type itself cannot express a fabricated figure. On save, an
incoming entry is matched by id against the document already stored and its
measured figures are carried over; a new entry, a moved entry, or **every**
entry when the pin itself moves is re-measured server-side against the ORS
matrix before the document is written (Decision 8). An entry no profile can
route to is refused (`nearby_unroutable`) rather than stored with an empty
`reach`; an entry that re-measures beyond 1.5× its group's radius is kept but
flagged `needsCheck` — moving the pin invalidates a distance, not a choice the
owner made, so the entry is not silently dropped either.

**Groups are a closed, fixed vocabulary** — `transport`, `groceries`, `food`,
`outdoors`, `health` — each with its own search radius (800 m–10 km,
`NearbyGroups.RadiusMetres`), because "nearby" is not one distance. **Types**
are a fixed, translated vocabulary **served by the API**
(`GET /api/nearby/vocabulary`, `NearbyGroups.Vocabulary` in
`api/Services/NearbyGroups.cs`) rather than duplicated in the client — the
server has to validate against its own copy regardless, so a second
hand-maintained list would only drift. `app/lib/nearby.ts` keeps only the
**group** and **profile** names at compile time (they key the icon map and the
segmented toggle, which cannot be built from a runtime fetch); it holds no
type list. A type the client has never seen a translation for (served before
its string shipped) falls back to `nearby.unknownType` in both editor and
public page, rather than throwing or leaking a raw machine key.

Three supporting containers, none embedded on `properties`:

**`nearbyCandidates`** (partition key `/cell`, 30-day TTL) — the Overpass POI
search cached per rounded cell: `Cell(lat, lng, group)` rounds to 3 decimal
places (~110 m) and the group, e.g. `"41.648|-0.889|transport"`. POIs do not
move, so this is safely cacheable; **the ORS matrix that ranks them is never
cached** and always runs against the listing's true pin — rounding the origin
to the cell would put up to ~78 m of error into a distance presented as
precise. A genuinely empty cell is deliberately **not** cached (it is
indistinguishable from a degraded Overpass response with no POIs and no
`remark`), so an empty area is re-queried on every visit rather than risking a
false "nothing here" cached for a month.

**`nearbyRoutes`** (partition key `/propertyId`, id `"{entryId}-{profile}"`,
180-day TTL) — the routed line geometry, kept out of `properties` entirely
(ADR-028 Decision 5): it is written by an anonymous, unauthenticated lazy
fetch, while the property document is written by the owner's authenticated
save, and embedding would make the public path read-modify-write the hot
document a save can be racing. Always a point read/write by that exact id. The
indexing policy (`infra/main.bicep`) indexes only `/propertyId` and excludes
everything else — nothing ever queries the polyline, metres or seconds
fields. The 180-day TTL is the design, not housekeeping: it is a cache, so
road-network changes propagate with no admin work.

**Same container, a second shape: `BandRouteDoc`** (id `"band-{entryId}-
{profile}"`, ADR-041 point 5) — the merged fan-and-trunk route the public
route endpoint now serves, instead of `NearbyRouteDoc`'s single line.
`{ trunkPolyline, stubAPolyline, stubBPolyline, minMinutes, maxMinutes,
minMetres, maxMetres }`: the two boundary-sample routes (`band.sampleA`/
`sampleB` to the entry) split at their fork into one shared trunk plus two
short stubs, and minutes/metres are merged (outward-rounded) over both
boundary samples **and** the true door. `minMetres`/`maxMetres` are
coarsened to the nearest 50 m (floor/ceil), the same granularity
`PublicReach` uses and for the same reason: `PropertyPlaceRoute` accepts
any destination in the Zaragoza box, so a finer band would let a caller
sweep probe destinations along the street and read the door's network
distance off the range at that finer precision — a house-number oracle.
It lives beside `NearbyRouteDoc` in
the same container/partition — so `RouteCache.DropAsync`'s pin-move sweep
(a query by `propertyId` alone) keeps deleting both shapes without knowing
either exists — under a distinct id prefix, so an old-shape document can
never be misread as one of these.

**`serviceBudget`** (partition key `/id`, one document per calendar day, id
`"ors-yyyy-MM-dd"` — formatted with `CultureInfo.InvariantCulture`, the same
fix `NearbyGroups.Cell` needed, since `DateTimeOffset`'s `yyyy` component is
calendar-dependent under some cultures — 2-day TTL) — the cross-instance daily
ceiling on outbound ORS calls (1500, comfortably under ORS's own ~2500/day),
held in Cosmos with **ETag optimistic concurrency** because SWA managed
functions on Consumption scale out and share no memory: an in-process counter
would be one counter per instance and therefore no limit at all. **Fails
closed** — if the count cannot be confirmed, the call does not happen.

**First explicit `indexingPolicy` on `properties`.** Task 2 gave the live,
populated `properties` container its first ever explicit policy, excluding
`/nearby/*` (24 embedded entries would otherwise be indexed on every owner
save for a field nothing queries) and `/"_etag"/?` (matching Cosmos's implicit
default). Deploying it triggers a Cosmos background index transformation —
non-disruptive, but not instant (ADR-028 "Consequences to watch").

### 2.2.6 The description document (`description`) ✅ (ADR-032, built 2026-07-30)

`description` is no longer a `{ es, en }` string pair. Each side is a **ProseMirror-style
JSON document** drawn from a closed node schema — the same shape `app/lib/rich-text.ts`
defines and `api/Models/RichText.cs`/`HostWrites.cs` re-validate server-side,
never trusting the client's own walk:

```jsonc
{
  "type": "doc",
  "content": [
    { "type": "paragraph", "content": [
        { "type": "text", "text": "A quiet third-floor flat, five minutes from the river and " },
        { "type": "text", "text": "the tram", "marks": [{ "type": "bold" }] },
        { "type": "text", "text": "." } ] },
    { "type": "heading", "attrs": { "level": 3 }, "content": [{ "type": "text", "text": "The neighbourhood" }] },
    { "type": "bulletList", "content": [
        { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Quiet, well connected." }] }] } ] },
    { "type": "callout", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Good to know: no pets." }] }] },
    { "type": "photoFigure", "attrs": { "url": "https://…/kitchen.webp", "caption": "The kitchen" } },
    { "type": "paragraph", "content": [
        { "type": "text", "text": "Two minutes from " },
        { "type": "placeRef", "attrs": { "entryId": "9d4b2a71f0c8e3a5" } } ] }
  ]
}
```

**Six block types** — `doc`, `paragraph`, `heading` (level always `3`; the page
owns h1/h2), `bulletList`/`orderedList` + `listItem` (a list item holds
paragraphs only, so lists cannot nest), `callout` ("Good to know," styled as a
quiet aside, not a warning). **Four reference/atom types** — `photoFigure` and
`placeCard` (block-level), `photoRef` and `placeRef` (inline); each stores an
identifier already on this listing (a photo `url`, a `nearby[].id`), never a
name or a distance — those resolve at render, so a place chip is bilingual for
free and a rendered figure cannot claim a distance the listing did not measure.
**Two marks** — `bold`, `italic`. No links, no colour, no font, no size, no
alignment, no table, no embed. Closed by decision (ADR-032 D7), not by
oversight.

**Limits** (`RICH_LIMITS`): 4,000 characters of `text` content (references and
captions are not charged — charging a name that lives on another record would
let renaming a nearby place silently change an unrelated description's
length), 400 nodes, depth 5, a caption ≤ 200 characters.

**Validation — reject, never repair (ADR-032 D8/D9).** `HostValidation.RichText`
walks the incoming document on every save and refuses the whole write on the
first failure, against the **incoming** photo and nearby arrays, not the
stored ones (a single save can delete a photo and reference it at once):

| Failure | Code |
| --- | --- |
| root is not `doc` | `description_bad_root` |
| unknown node type, or illegal for its parent | `description_bad_node` |
| mark outside `{bold, italic}` | `description_bad_mark` |
| `heading.level != 3` | `description_bad_heading` |
| caption > 200 chars | `description_bad_caption` |
| text length > 4,000 | `description_too_long` |
| depth > 5 | `description_too_deep` |
| nodes > 400 | `description_too_many_nodes` |
| `photoRef`/`photoFigure.url` not in the incoming photo set | `description_photo_unknown` |
| `placeRef`/`placeCard.entryId` not in the incoming nearby set | `description_place_unknown` |

**On save, the server remaps client-minted nearby ids inside the description**
(ADR-032 D15): a `placeRef` may name a nearby entry added in the very same
edit, which the client can only identify by a temporary id — the server
discards that id and mints its own when it rebuilds `nearby[]`, so the
description's reference is rewritten through the same `old id → new id` map,
after validation, so an id absent from the payload is still rejected.

**`hiddenFromGallery` on `photos[]`** (§2.2.2, ADR-032 D10) exists so a photo
can be referenced from the description without cluttering the ordinary
gallery — "used in the description" is itself never stored (D11), only
derived by walking the document. Four combinations of the one stored flag and
the one derived fact:

| In gallery | In description | Meaning |
| --- | --- | --- |
| yes | no | ordinary listing photo |
| yes | yes | fine, shown in both |
| no | yes | a description-only photo — the case the flag exists for |
| no | no | **orphan** — stored, counted against the photo cap, shown nowhere; `PhotoManager` badges it |

**A reference whose target is missing renders nothing** — no broken image, no
placeholder, no error text. Validation makes this unreachable through the
save path; an admin photo deletion or a projection change could still produce
it, and a guest has no use for the fact that a listing is internally
inconsistent.

**A stored plain-string document throws, not degrades.** `{ "es": "…", "en": "…" }`
stored under `description` cannot deserialize into `BilingualDoc` — Newtonsoft
(the Cosmos SDK's serializer, not `System.Text.Json`) throws reading the
property, taking the whole property document down with it (a 500, not a
missing paragraph). See ADR-032 for the full decision record.

**The ADR-034 rename softened this for pre-rename documents only.** A document
still carrying the field under its old name, `copy`, no longer throws: `copy`
is an unmapped member and Newtonsoft's default `MissingMemberHandling` ignores
it, so `description` reads as `null` and the listing renders with no
description at all. That is a quieter failure than the 500 ADR-032 describes,
and a worse one to notice — nothing logs it. Re-seeding every environment
remains required (`infra/seed-source.json` locally, staging as an explicit
pre-deploy step); what changed is that forgetting now shows up as listings
with blank descriptions rather than as an outage.

---

## 2.3 Container: `profiles` ✅

Bootstrapped on first sign-in (§3.6). `id` = the stable SWA principal
`userId`.

```jsonc
{
  "id": "<swa userId>",          // PK + partition key — Entra objectid on the
                                 //   `ebrostay` door, MSA oid on `ebrostay-msa`;
                                 //   the same human using both doors is TWO
                                 //   documents (ADR-036, §3.1)
  "provider": "ebrostay",        // identityProvider: ebrostay | ebrostay-msa
  "name": "Jane Doe",            // userDetails at first sign-in (display only)
  "isDeactivated": false,        // admin-set; §3.7 — functions reject when true
  "deletionRequestedAt": null,   // ISO 8601, or null. Owner-set through
                                 //   /api/account/closure (§3.7, ADR-042);
                                 //   null = no request. Blocks writes.
  "createdAt": "2026-07-19T10:00:00Z",
  "lastSeenAt": "2026-07-19T10:00:00Z"
}
```

**`deletionRequestedAt` is a timestamp, not a boolean, because it is both the
gate and the audit record.** `AccountClosure.BlocksWrites` only asks whether it
is null, so a boolean would serve the guard — but the same field is the only
record that the request was ever made, and *when*. The admin users tab shows
the date (§4.5), because how long a request has waited is the whole of what an
admin needs in order to act on it; a `true` would say a thing was asked and
never say when. Same shape as the review queue's `submittedAt`.

**It is not `isDeactivated`, and must not be folded into it.** The two mean
opposite things about who is in control: deactivation is done *to* you by an
admin and locks you out; a closure request is made *by* you and has to leave
you able to reach the page that cancels it (§3.7).

No `isAdmin`/`isOwner` flags: **roles live in SWA role management** (§3.2),
never in the database — a profile document cannot grant privileges. "Host" is
not a stored role either; it is the implicit state of having listings
(`properties.hostId = profiles.id`).

## 2.4 Container: `bookingRequests` ✅ decided · 🔜 endpoint not yet built

Written **only** by `POST /api/booking-requests` (§4.3 — the endpoint does not
exist yet; the container is provisioned); partition key `/propertyId`. Carries
the full logged payload plus the server's recomputed estimate and the mismatch
flag. The estimate shape follows **ADR-023** (days × daily rate, not billed
months) and must carry the **ADR-026 cleaning fee** so the parity tripwire
covers it:

```jsonc
{
  "id": "<uuid>",
  "propertyId": "pedro1",             // partition key
  "propertyName": "Pedro II el Católico 3 - 1 IZQ",   // snapshot
  "userId": "<profile id>",           // from x-ms-client-principal — never client-supplied
  "userName": "Jane Doe",             // snapshot
  "provider": "ebrostay",
  "locale": "es",                     // UI language at submit
  "channel": "whatsapp",              // email | whatsapp — chosen draft channel

  "startDate": "2026-08-01",
  "endDate": "2026-10-01",            // exclusive checkout (= return of the keys)
  "days": 61,                         // stay days, end-exclusive (ADR-023 —
                                      //   replaces v1's billed whole months)
  "tenantNames": "Jane Doe\nJohn Roe",  // free text, one per line, ≤800 chars

  "clientEstimate": {                  // as computed & displayed by the widget
    "rate": 31.67,                     //   dailyRate = price ÷ 30 (ADR-023)
    "rent": 1931.67, "commissionRaw": 289.75, "commission": 289.75,
    "discount": 0, "deposit": 950.00, "cleaningFee": 120.00,
    "total": 3291.42
  },
  "serverEstimate": {                  // recomputed by the function from the
    "rate": 31.67,                     //   property document, same algorithm
    "rent": 1931.67, "commissionRaw": 289.75,   //   (lib/pricing.ts contract,
    "commission": 289.75, "discount": 0,        //   ADR-023/026)
    "deposit": 950.00, "cleaningFee": 120.00,
    "total": 3291.42
  },
  "estimateMismatch": false,           // any field differing > €0.01 → true

  "status": "new",                     // new → contacted → confirmed | declined
  "createdAt": "2026-08-01T09:12:00Z"  //   (carried from v1 §4.6; admin-set)
}
```

Reads: admin (all, cross-partition), host (single-partition, only for
properties where `properties.hostId == caller` — the function checks ownership
before querying), requester (own requests). Snapshot fields
(`propertyName`, `userName`) are written once and never updated (v1 §4.16
intent).

## 2.5 Container: `inquiries` ✅

Contact-form leads, carried conceptually from v1 §4.8: anyone — including
anonymous — may submit; only admins read.

```jsonc
{
  "id": "<uuid>",                 // PK + partition key
  "name": "Jane Doe",
  "email": "jane@example.com",
  "property": "Movera 7",         // free text, optional
  "message": "¿Disponible en septiembre?",
  "language": "es",
  "userId": null,                 // set from the principal if signed in
  "createdAt": "2026-07-19T10:00:00Z"
}
```

v1's separate `owner_leads` ("become a partner") is 🗑️ not carried: in the
marketplace model an owner simply signs in and creates a listing (ADR-014).

## 2.6 Blob storage: container `property-photos` ✅

Storage account `ebrostayphotos` (spaincentral), container `property-photos`,
**public read** at the blob level. **All writes go through the API** ✅
(ADR-019): the upload function validates, re-encodes into the three sizes of
§2.2.2, writes each blob with **`Cache-Control: public, max-age=31536000,
immutable`** (1 year, v1 storage practice carried) and a
`Content-Type` we set from what we encoded — never echoed from the request,
since Blob serves whatever it is given and a client-supplied `text/html` would
be stored XSS on our own account. Blob names are server-generated
(`{propertyId}/{guid}-{size}.webp`); a client filename would be path traversal
and cross-listing overwrite in one. Deleting a photo removes all three blobs
and the embedded entry. No SAS tokens and no storage keys ever reach the
client. `immutable` is safe because a name is never reused — replacing a photo
writes a new one.

**Local development** uses Azurite; `PHOTOS_CONNECTION` falls back to
`AzureWebJobsStorage`, so a local run needs one setting and one container:
`docker run -d --name ebrostay-blob -p 10000:10000 -p 10001:10001
mcr.microsoft.com/azure-storage/azurite azurite --blobHost 0.0.0.0 --queueHost 0.0.0.0`.
(The same Azurite container also serves the import queue, ADR-033 —
`azurite` starts blob, queue and table together.)

What "validates" and "compresses" mean concretely — magic-byte sniffing, the
`Content-Type` allowlist, no SVG, server-generated blob names, caps applied
before decode, and the re-encode that both resizes and sanitises — is the
**ADR-019 amendment of 2026-07-28**. The short version: the container is
public-read, so an upload is a URL we host, and the re-encode is what
guarantees the bytes behind it are pixels.

## 2.7 Seed data ✅

Dev and test environments are seeded with the **4 v1 sample homes**
(`pedro0`, `pedro2`, `movera0`, `movera1` — canonical values in
`infra/seed-source.json`, descended from v1's `data.js`; ratings were dropped
with the `best` sort, §4.1), translated into the §2.2 document shape
with `status: "published"` and a seed `hostId`. The seed exists **only** for
development and automated tests — it is not deployed to production and there
is no runtime fallback to it (ADR-017). Production starts empty and fills
through the host flow (ADR-016).

## 2.8 Delta summary vs v1 §4

| v1 (Postgres) | v2 (Cosmos) |
| --- | --- |
| `properties` table + `property_photos` + `availability_blocks` | single `properties` document with embedded `photos[]` + `availability[]` |
| `is_published` boolean | `status` lifecycle (§2.2.1) |
| `bills_included` legacy boolean + `bills_policy` | `billsPolicy` only (legacy flag dropped — fresh start) |
| block `end_date` inclusive; 3 overlap conventions | `end` **exclusive** everywhere; single strict-`<` predicate (§2.2.3) |
| `hold_expires_at` on blocks; server counts expired holds 🐞 | `status: hold` + `holdExpiresAt`; expired holds excluded identically client+server ✅ |
| `availability_blocks.user_id` + `note` world-readable 🐞 | public availability = date ranges only; `note` internal; no user linkage ✅ |
| `profiles.is_admin` / `is_owner` columns | roles in SWA role management only; no privilege flags in data (§3.2) |
| `favorites`, `bookings` 🗑️, `owner_leads`, `owner_payout_details`, `property_guest_info` | not carried (🚫 / 🗑️ / 🔜 per §2.1) |
| RLS + triggers + GiST constraint | API-enforced authorization and invariants; ETag concurrency (§2.2.3) |
| `booking_requests` written by unwired Edge Fn 🔜 | `bookingRequests` written by the **live** booking flow (ADR-015 — decided; endpoint 🔜, see §2.4) |

# Ebrostay v2 Target Spec — §2 Data Model

> Target: branch `redesign/v2`, locked 2026-07-19. Status tags: ✅ decided/locked · 🔜 planned · 🗑️ not carried from v1.
> v1 reference: [docs/spec/04-data-model.md](../spec/04-data-model.md) (conceptual fields carry over; storage moves Postgres → Cosmos). Decisions: [ADR-011, ADR-014, ADR-016, ADR-019, ADR-028](05-decision-log.md).

Storage moves from Supabase Postgres to **Azure Cosmos DB (free tier,
provisioned 1000 RU/s shared, NoSQL API)**. This is a **fresh start** (ADR-016): no v1 production data is
imported; the schemas below are designed for Cosmos, not translated
row-for-row. The *conceptual* fields of v1 §4 carry over; the relational
apparatus (RLS, FKs, GiST constraints, triggers) is replaced by **API-enforced
invariants** — the C# functions are the only writers (§3.5).

Conventions: all dates are ISO `YYYY-MM-DD` strings; all `*At` timestamps are
ISO 8601 UTC; money fields are numbers in euros (integers for authored prices,
2-decimal numbers for computed amounts, matching docs/spec/05 §5.1); bilingual
text uses `{ es, en }` objects instead of v1's `*_es`/`*_en` column pairs.

---

## 2.1 Account, database, containers ✅

Cosmos account **`ebrostay-cosmos`** (free tier, NoSQL, spaincentral, §1.2)
→ database **`ebrostay`** (shared **1000 RU/s** — the free-tier allowance —
across all containers) → seven containers:

| Container | Partition key | One document per | Writers (via API only) |
| --- | --- | --- | --- |
| `properties` | `/id` | listing (photos + availability + nearby **embedded**) | host (own, pre-publish states), admin |
| `profiles` | `/id` | signed-in user (bootstrapped, §3.6) | the system (bootstrap), admin (deactivation) |
| `bookingRequests` | `/propertyId` | logged booking request | booking function (insert), admin (status) |
| `inquiries` | `/id` | contact-form inquiry | anyone incl. anonymous (insert), admin (read) |
| `nearbyCandidates` | `/cell` | cached Overpass answer for one rounded cell + group | the candidate lookup (§2.2.5, ADR-028) |
| `nearbyRoutes` | `/propertyId` | one routed geometry, `(entryId, profile)` | the anonymous public route lookup, write-through (§2.2.5, ADR-028) |
| `serviceBudget` | `/id` | one calendar day's outbound ORS call count | `OrsBudget` (§2.2.5, ADR-028) |

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

  // — bilingual copy —
  "area":    { "es": "…", "en": "…" },
  "copy":    { "es": "…", "en": "…" },
  "details": { "es": "…", "en": "…" },
  "beds":    { "es": "…", "en": "…" },
  "priceNote": { "es": "…", "en": "…" },   // optional
  "copyEnApproved": true,             // ✅ the owner stands behind the English
                                      //   description. Only `copy` is gated —
                                      //   the rest are short labels (ADR-027)

  // — capacity & attributes —
  "guests": 4, "bedrooms": 3, "bathrooms": 1, "sizeM2": 75,
  "floorNumber": 1,
  "amenities": ["wifi", "desk", "lift", "heating", "kitchen"],
  "energyRating": "C",
  "petsAllowed": false, "smokingAllowed": false, "couplesAllowed": true,
  "selfCheckin": true,
  "videoUrl": null,

  // — pricing (drives docs/spec/05 §5.1 verbatim) —
  "priceNumber": 950,                 // monthly rent, whole EUR — all math
  "priceLabel": "950 EUR",
  "depositAmount": 950,               // nullable → treated as 0
  "upfrontRentEur": 950,
  "billsPolicy": "included",          // included | capped | excluded (v1 ADR-008;
                                      //   the legacy billsIncluded boolean is 🗑️
                                      //   dropped — fresh start, no legacy rows)
  "utilitiesCapEur": null,
  "minStayMonths": 1, "maxStayMonths": 11,   // hard cap 11 regardless

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

  // — badges / flags —
  "rating": 4.8, "isNew": false, "checked": true, "depositProtected": true,
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
      // where the camera said it was — admin-only, see §2.2.2
      "capturedLat": 41.65393, "capturedLng": -0.90783, "capturedAt": "2026-05-14T10:22:07Z" }
  ],

  // — embedded availability (§2.2.3) —
  "availability": [
    { "start": "2026-07-04", "end": "2026-07-11", "status": "confirmed",
      "note": "Reforma cocina" },
    { "start": "2026-09-01", "end": "2026-10-01", "status": "hold",
      "holdExpiresAt": "2026-07-20T11:30:00Z" }
  ],

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
`status: "published"` documents and **strip** `reviewNote`, `hostId`, and
`availability[].note` / `availability[].holdExpiresAt` — the public
availability shape is date ranges only (`{start, end}` pairs), never user
identifiers or notes. This resolves v1's `availability_blocks.user_id`/`note`
world-readability leak **by design** (v1 open decision #1, docs/spec/11).
`nearby[].osmId` / `.measuredAt` / `.needsCheck` are stripped the same way —
they are provenance for the owner and the (planned) admin review, not a guest
fact (§2.2.5).

**One exception, `GET /api/properties/{id}` only (ADR-029):** the owner of a
listing receives that same projection for their own listing in **any** status,
carrying one added field — `previewStatus`, the stored lifecycle value, `null`
on every read a guest can perform. Ownership is `hostId == principal.userId`,
resolved in the Function; anonymous callers and signed-in non-owners still get
a flat **404**, never a 401 or 403, so the id space stays opaque. The response
carries `Cache-Control: no-store`. **`GET /api/properties` (the list) has no
such exception** — an unpublished listing never appears in search.

### 2.2.1 Property status lifecycle ✅ (ADR-014, `paused` per ADR-024, edit split per ADR-025)

```
draft ──submit──▶ pending_review ──approve──▶ published ──pause──▶ paused
  ▲                    │                          ▲                  │
  │                 reject(note)                  └───── reopen ─────┘
  └──edit/resubmit── rejected
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
| any → any | **admin** | Admins may edit any listing directly without re-review (the reviewer needs no reviewer). |

`draft`/`pending_review`/`rejected`/`paused` documents are visible only to
their host and to admins. There is no `is_published` boolean (v1 §4.2) —
`status` is the single source of visibility.

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

Each entry: `{ start, end, status, holdExpiresAt?, note?, turnoverDaysOverride? }`.

- **`end` is EXCLUSIVE** (checkout day). ⚠️ This is a deliberate change from
  v1, where `availability_blocks.end_date` was *inclusive* and three different
  overlap-bound conventions coexisted (docs/spec/05 §5.4.2, flagged 🐞 in
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

- **Turnover buffer** ✅ (ADR-026). A home is not
  relettable the day the keys come back: the inventory has to be checked, the
  meters read (ADR-023 settles utilities after move-out), and a stay measured
  in months needs a deep clean, not a turnover clean. Every blocking entry
  therefore shuts the `turnoverDays` that follow it:

  ```
  turnover(entry, property) = entry.turnoverDaysOverride ?? property.turnoverDays
  effectiveEnd(entry, property) = entry.end + turnover(entry, property) days
  ```

  The buffer is **derived inside the predicate**, never written to
  `availability` — a stored buffer would be a second copy of a rule and would
  go stale the moment either the rule or the stay moved. `turnoverDaysOverride`
  is admin-set, for when operations cannot get a cleaning team into the slot.
  Owners see the buffer as a distinct **turnaround** state; guests just see
  dates that are unavailable.

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
  "needsCheck": false         // true when a re-measurement (pin moved) landed
                              // outside the group's radius — the SELECTION is
                              // now suspect, not just the number
}
```

**§2.2 Public projection strips `osmId`, `measuredAt` and `needsCheck`** — see
above. Everything else is what the guest-facing "What's nearby" section reads
(§4.2, merged with §7 "Where you'll be" per ADR-028 Decision 9).

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

---

## 2.3 Container: `profiles` ✅

Bootstrapped on first sign-in (§3.6). `id` = the stable SWA principal
`userId`.

```jsonc
{
  "id": "<swa userId>",          // PK + partition key
  "provider": "github",          // identityProvider: github | aad
  "name": "Jane Doe",            // userDetails at first sign-in (display only)
  "isDeactivated": false,        // admin-set; §3.7 — functions reject when true
  "createdAt": "2026-07-19T10:00:00Z",
  "lastSeenAt": "2026-07-19T10:00:00Z"
}
```

No `isAdmin`/`isOwner` flags: **roles live in SWA role management** (§3.2),
never in the database — a profile document cannot grant privileges. "Host" is
not a stored role either; it is the implicit state of having listings
(`properties.hostId = profiles.id`).

## 2.4 Container: `bookingRequests` ✅

Written **only** by `POST /api/booking-requests` (§4.3); partition key
`/propertyId`. Carries the full logged payload plus the server's recomputed
estimate and the mismatch flag.

```jsonc
{
  "id": "<uuid>",
  "propertyId": "pedro1",             // partition key
  "propertyName": "Pedro II el Católico 3 - 1 IZQ",   // snapshot
  "userId": "<profile id>",           // from x-ms-client-principal — never client-supplied
  "userName": "Jane Doe",             // snapshot
  "provider": "github",
  "locale": "es",                     // UI language at submit
  "channel": "whatsapp",              // email | whatsapp — chosen draft channel

  "startDate": "2026-08-01",
  "endDate": "2026-10-01",            // exclusive checkout
  "months": 2,                        // billed whole months (docs/spec/05 §5.1.1)
  "tenantNames": "Jane Doe\nJohn Roe",  // free text, one per line, ≤800 chars

  "clientEstimate": {                  // as computed & displayed by the widget
    "rent": 1900.00, "commissionRaw": 285.00, "commission": 285.00,
    "discount": 0, "deposit": 950.00, "total": 3135.00
  },
  "serverEstimate": {                  // recomputed by the function from the
    "rent": 1900.00, "commissionRaw": 285.00,   // property document, same
    "commission": 285.00, "discount": 0,        // algorithm (docs/spec/05 §5.1)
    "deposit": 950.00, "total": 3135.00
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
immutable`** (1 year, v1 practice per docs/spec/07 §7.1 Storage) and a
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
`docker run -d --name ebrostay-blob -p 10000:10000
mcr.microsoft.com/azure-storage/azurite azurite-blob --blobHost 0.0.0.0`.

What "validates" and "compresses" mean concretely — magic-byte sniffing, the
`Content-Type` allowlist, no SVG, server-generated blob names, caps applied
before decode, and the re-encode that both resizes and sanitises — is the
**ADR-019 amendment of 2026-07-28**. The short version: the container is
public-read, so an upload is a URL we host, and the re-encode is what
guarantees the bytes behind it are pixels.

## 2.7 Seed data ✅

Dev and test environments are seeded with the **4 v1 sample homes**
(`pedro0`, `pedro2`, `movera0`, `movera1` — values per docs/spec/05 §5.3
worked example G and v1 `data.js`), translated into the §2.2 document shape
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
| `booking_requests` written by unwired Edge Fn 🔜 | `bookingRequests` written by the **live** booking flow ✅ (ADR-015) |

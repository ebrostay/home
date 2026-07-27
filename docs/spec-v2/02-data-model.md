# Ebrostay v2 Target Spec — §2 Data Model

> Target: branch `redesign/v2`, locked 2026-07-19. Status tags: ✅ decided/locked · 🔜 planned · 🗑️ not carried from v1.
> v1 reference: [docs/spec/04-data-model.md](../spec/04-data-model.md) (conceptual fields carry over; storage moves Postgres → Cosmos). Decisions: [ADR-011, ADR-014, ADR-016, ADR-019](05-decision-log.md).

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
across all containers) → four containers:

| Container | Partition key | One document per | Writers (via API only) |
| --- | --- | --- | --- |
| `properties` | `/id` | listing (photos + availability **embedded**) | host (own, pre-publish states), admin |
| `profiles` | `/id` | signed-in user (bootstrapped, §3.6) | the system (bootstrap), admin (deactivation) |
| `bookingRequests` | `/propertyId` | logged booking request | booking function (insert), admin (status) |
| `inquiries` | `/id` | contact-form inquiry | anyone incl. anonymous (insert), admin (read) |

Partition-key rationale:

- `properties` and `profiles` partition on `/id`: small, point-read-dominated
  containers; every access is by id (property page, profile check).
- `bookingRequests` partitions on `/propertyId`: the hot queries are "requests
  for property X" (host dashboard) and admin listing (cross-partition, cheap at
  this volume); grouping by property keeps the host query single-partition.
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
  "lat": 41.65393, "lng": -0.90783,

  // — bilingual copy —
  "area":    { "es": "…", "en": "…" },
  "copy":    { "es": "…", "en": "…" },
  "details": { "es": "…", "en": "…" },
  "beds":    { "es": "…", "en": "…" },
  "priceNote": { "es": "…", "en": "…" },   // optional

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
  "turnoverDays": 3,                  // 🔜 days shut after a stay for
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
    { "url": "https://ebrostayphotos.blob.core.windows.net/property-photos/pedro1/1718000000-kitchen.jpg",
      "isFloorplan": false, "sortOrder": 10 }
  ],

  // — embedded availability (§2.2.3) —
  "availability": [
    { "start": "2026-07-04", "end": "2026-07-11", "status": "confirmed",
      "note": "Reforma cocina" },
    { "start": "2026-09-01", "end": "2026-10-01", "status": "hold",
      "holdExpiresAt": "2026-07-20T11:30:00Z" }
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
| any → `paused` | host (own) or admin | Closed to new requests and invisible in search; the listing and its history are kept. Admin may also pause as a takedown. |
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

- **Turnover buffer** 🔜 (ADR-026, not yet implemented). A home is not
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
**public read** at the blob level. **All writes go through the API**
(ADR-019): the upload function validates content type/size, compresses
(carrying v1's client-compression practice server-side or client-side before
upload — see §4.4), writes the blob with **`Cache-Control:
public, max-age=31536000`** (1 year, v1 practice per docs/spec/07 §7.1
Storage), and appends the photo entry to the property document. Deleting a
photo removes both the blob and the embedded entry. No SAS tokens and no
storage keys ever reach the client.

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

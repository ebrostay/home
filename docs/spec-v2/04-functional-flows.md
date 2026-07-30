# Ebrostay v2 Target Spec — §4 Functional Flows

> Target: branch `redesign/v2`, locked 2026-07-19. Status tags: ✅ decided/locked · 🔜 planned · 🗑️ not carried from v1.
> v1 reference: [docs/spec/06a](../spec/06a-functional-home-property.md) / [06b](../spec/06b-functional-account-admin.md) (screen behavior), [docs/spec/05](../spec/05-business-rules.md) (all numbers). Decisions: [ADR-014, ADR-015, ADR-017, ADR-020, ADR-028](05-decision-log.md).

API surface referenced below (all under `/api`, enforcement per §3.4–3.5):

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | anon | Liveness (exists ✅). |
| `GET /api/properties` · `GET /api/properties/{id}` | anon | Published listings / detail, public projection (§2.2). The detail route also answers to the listing's **own owner** in any status, adding `previewStatus` (ADR-029); everyone else gets 404. |
| `POST /api/inquiries` | anon | Contact inquiry (§2.5). |
| `GET /api/me` | auth | Profile bootstrap/fetch (§3.6). |
| `POST /api/booking-requests` | auth | Log-then-draft booking flow (§4.3). |
| `GET/POST /api/host/properties` · `GET/PUT /api/host/properties/{id}` | auth (own) | Host listings CRUD — **content** edits, which re-enter review (§2.2.1). |
| `PUT /api/host/properties/{id}/pricing` · `…/availability` | auth (own) | **Operational** edits — apply live, `status` untouched (ADR-025). |
| `PUT /api/host/properties/{id}/status` | auth (own) | Pause / reopen only (ADR-024). Publishing stays an admin act. |
| `POST /api/host/properties/{id}/submit` | auth (own) | draft/rejected → `pending_review`. |
| `POST /api/host/properties/{id}/photos` · `DELETE …/photos/{n}` | auth (own) | Photo upload/delete via Blob (§4.4). |
| `POST /api/import` | auth | Enqueue extraction from a pasted portal URL — `202 { jobId, stage: "queued" }` (ADR-033). Errors: `unsupported_host`, `bad_url`, `too_many_imports`, `daily_import_limit`. |
| `GET /api/import/{jobId}` | auth (own) | Poll a job's stage/result, `queued → fetching → reading → matching → done \| failed \| cancelled`; also the reaper — a job found past its deadline is written `failed`/`timeout` here rather than by a timer trigger (ADR-033 Decisions 7, 10). |
| `POST /api/import/{jobId}/callback` | **anon**, per-job `X-Import-Token` (`FixedTimeEquals`; a mismatch is `404`, never `403`) | The extraction pipeline reports stage/result (ADR-033 Decisions 5–6, 10–11). Errors: `body_required`, `result_invalid`, `imported_unknown_field`, `imported_too_many`, `stage_invalid`, `error_code_invalid`, `job_finished`; failure codes carried on a `failed` job: `login_wall`, `not_found`, `withdrawn`, `unreadable`, `timeout`, `pipeline_error`. |
| `DELETE /api/import/{jobId}` | auth (own) | Cancel a running job (*Stop reading*). `204` once cancelled; `cancel_conflict` (`409`) if the cancel loses the race against the pipeline's own write twice rather than falsely reporting success (ADR-033 Decision 11). |
| `GET /api/nearby/vocabulary` | anon | The type/group/profile vocabulary, cached 1h (§2.2.5, ADR-028). |
| `GET /api/host/nearby/candidates` | auth (own point) | Owner's candidate search — Overpass + ORS matrix (§4.4.1). |
| `GET /api/host/nearby/preview-route` | auth (own points) | Route preview for a not-yet-saved candidate; stores nothing (§4.4.1). |
| `GET /api/properties/{id}/nearby/{entryId}/route` | anon | Lazy, cached route lookup by id — never coordinates (§4.2.1, ADR-028 Decision 4). |
| `GET /api/host/booking-requests?propertyId=` | auth (own property) | Booking-interest log for own listings. |
| `POST /api/ai-assistant` | auth (own listing) / admin | DeepSeek actions (§4.6). |
| `GET /api/admin/review-queue` · `POST /api/admin/properties/{id}/approve` · `…/reject` | admin | Review queue (§4.5). |
| `GET/PUT /api/admin/properties*` · `GET /api/admin/users*` · `PUT /api/admin/users/{id}/deactivation` | admin | All-properties mgmt, users. |
| `GET /api/admin/booking-requests` · `PATCH …/{id}` (status) · `GET /api/admin/inquiries` | admin | Log viewers, request triage. |

---

## 4.1 Public browse & search ✅ (anonymous)

The home page fetches published listings from `GET /api/properties` once,
then filters/sorts **client-side** — the rules carry over from v1 **verbatim**:

- **Main predicate, quick filters, enhanced filters:** per docs/spec/05
  §5.2.1–§5.2.3 (city substring, type, max budget, min guests, amenities AND,
  available-from, date-overlap; chips `checked`/`bills`/`deposit` combinable
  AND; address text search across address + translated area/name/copy/details,
  min bedrooms/bathrooms; "saved only" stays 🚫 out of scope). The bills chip
  keys off `billsPolicy === "included"`.
- **Sorting:** per docs/spec/05 §5.3 (`best` rating desc/price asc; `price`
  asc; `new` isNew first/price asc).
- **One pipeline** drives cards, the result count, and the Leaflet map markers
  — the three always agree (v1 R-Home-1 carried).
- **Date-overlap filtering** uses the single v2 predicate on half-open ranges
  and excludes expired holds (§2.2.3) — the v1 grid-vs-estimate bound
  inconsistency (docs/spec/05 §5.2.1 🐞) does not exist in v2.
- Maps: Leaflet + OSM tiles with price-labeled markers and card↔marker
  highlighting (docs/spec/07 §7.5 carried). Analytics: Umami events
  (docs/spec/07 §7.8 carried).

No sample-data fallback: if `/api/properties` fails, the grid shows a
bilingual error/retry state (ADR-017).

## 4.2 Property detail & estimate widget ✅

Per v1 docs/spec/06a with the v2 data source: gallery + lightbox (photos where
`isFloorplan: false`, by `sortOrder`), floor-plan section, amenities,
conditions table (incl. `billsPolicy` copy and `utilitiesCapEur`), move-in
cost box (`upfrontRentEur`, `depositAmount`), Leaflet location map, optional
video CTA, and the availability calendar (blocked = blocking entries per
§2.2.3, rendered from the public ranges).

The **estimate widget is visible to everyone** — anonymous visitors see dates,
tenant-names input, and the full itemized estimate. All rules verbatim from
docs/spec/05: billed months (§5.1.1, end-exclusive, round up, min 1),
rent/commission/deposit/total with the commission cap and visible
**commission-discount line** (§5.1.2), money formatting (§5.1.3), estimate
states `empty`/`conflict`/`toolong`/`ok` (§5.5.2, with `toolong` → the
two-contract message for >11 months), date-picker min/max bounds (§5.5.3 —
checkout in v2 is the exclusive end date), and CTA gating on `ok` + ≥1 tenant
name (§5.5.4). Every figure is labelled an **estimate**; there is no online
payment (v1 R-CORE-2 carried).

For anonymous visitors the Email/WhatsApp CTAs are replaced by a **"Sign in to
book"** CTA that routes to `/.auth/login/{provider}` with a
`post_login_redirect_uri` back to the property page (§3.1).

### 4.2.1 Neighbourhood: the merged section and the lazy route ✅ (ADR-028)

v1's sections 7 ("Where you'll be") and 9 ("What's nearby") are **one section**
in v2: a `Nearby` list (`app/components/detail/Nearby.tsx`) beside a
`NeighbourhoodMap`, because the two halves fix each other's weakness — a map
with nothing to click is inert, a list of places with no map is abstract.
`YourPlaces` (search-to-address, straight-line `km ÷ speed`) is deliberately
untouched (ADR-028 "What this deliberately does not do"): it routes to
arbitrary guest-typed addresses, which is exactly the unbounded,
guest-triggered workload the lazy-route design below exists to avoid.

**Everything a guest sees on page load is already on the document.** The
detail response's `nearby[]` (public projection, §2.2.5) carries a group, a
type, a name, a point and `reach` for every profile ORS could route — no
third party is on the critical path for the list itself.

```
1. GUEST     opens the property page. Nearby renders a card per group from
             `nearby[]`, entries ranked by the active profile's minutes;
             a group left empty by the active profile is dropped from the
             grid entirely (an entry ORS could route on foot but not by car
             simply has no `reach.car`, and vice versa — never a zero).
2. GUEST     clicks a place → the destination pin appears on
             NeighbourhoodMap IMMEDIATELY (it is already known — same figure
             already displayed), and the entry's row shows a loading state
             while:
             CLIENT  GET /api/properties/{id}/nearby/{entryId}/route?profile=
                     — ids only, never coordinates (Decision 4 below).
3. SERVER    PropertyNearbyRoute (anonymous) loads the PUBLISHED (or PAUSED)
             property, then RouteCache.GetAsync:
               - point-read `nearbyRoutes` by id "{entryId}-{profile}" in the
                 property's partition. Hit → return it. The unknown-entry
                 check runs BEFORE this read, so a bogus entryId 404s without
                 ever touching ORS or the route container.
               - Miss → call OrsClient.RouteAsync with the ORIGIN AND
                 DESTINATION READ FROM THE STORED DOCUMENT (the property's
                 own pin; the entry's own point) — never from the request —
                 write-through into `nearbyRoutes`, return it.
             Response carries `Cache-Control: public, max-age=86400`.
4. GUEST     the polyline decodes (`decodePolyline`, `app/lib/nearby.ts`) and
             draws on the map. A SECOND click on the same entry re-fires the
             fetch, but it is served from the browser's HTTP cache
             (transferSize 0) and never reaches the Function.
5. GUEST     switches the foot/car profile toggle → step 2 re-runs for
             whichever entry is still active (a different profile is a
             different cached document, `"{entryId}-foot"` vs
             `"{entryId}-car"`), so the line redraws for the new mode.
```

- **Nothing on page load depends on ORS.** Only a first-ever click on one
  `(entry, profile)` pair can fail, and it fails to a named message
  (`routeMissing` for 404, `routeUnavailable` for anything else) beside a
  figure that is still correct — the distance and duration shown in the list
  came from the document, not from this call.
- **The public endpoint takes `(propertyId, entryId, profile)`, never a
  coordinate.** This is the security property the whole lazy design exists
  for: an anonymous caller cannot make the account route arbitrary points at
  Ebrostay's expense. `RouteCache` is the only place a `from`/`to` pair is
  ever constructed for this endpoint.
- **A missing entry never touches ORS.** `RouteCache.GetAsync` looks the
  `entryId` up on the loaded property document first; only a match proceeds
  to the cache read and, on a miss, the outbound call.

## 4.3 Booking flow — login-gated, log-then-draft ✅ (ADR-015)

Actors: signed-in user on a published property page.

```
1. CLIENT   computeEstimate(start, end)  — per docs/spec/05 §5.1 / §5.5.2;
            CTAs enable when status == "ok" AND tenantNames ≥ 1.
2. CLIENT   user clicks Email or WhatsApp →
            POST /api/booking-requests
            { propertyId, startDate, endDate, tenantNames,
              clientEstimate {rent, commissionRaw, commission, discount,
                              deposit, total}, locale, channel }
3. SERVER   validate (table below) → recompute months + estimate from the
            property document with the SAME algorithm (docs/spec/05 §5.1) →
            estimateMismatch = any field differs from clientEstimate by
            > €0.01 → insert bookingRequests document (§2.4) →
            [ACS notification hook point — no-op for now, ADR-015] →
            200 { id, months, serverEstimate, estimateMismatch }
4. CLIENT   builds the bilingual stay summary (v1 format per docs/spec/06a
            R-Prop-9: property, dates, months, itemized estimate, tenant
            names, estimate disclaimer) FROM THE SERVER ESTIMATE and opens
            the chosen draft:
              email    → mailto:<CONTACT_EMAIL>?subject=…&body=…
              whatsapp → https://wa.me/<number>?text=…
```

**Parity check:** step 3 is the v2 form of the v1 parity guard (docs/spec/05
§5.6). The algorithms are identical by spec; `estimateMismatch` is the
tripwire that proves it in production. A mismatch **does not block** the flow
(the request is logged, the draft opens — with server figures), but it is
surfaced in the admin request viewer and should page the team in dev/test.

Server validation order (adapted from v1 §5.5.5; first failure wins):

| # | Check | Failure |
| --- | --- | --- |
| 1 | authenticated principal | `401 unauthorized` |
| 2 | profile not deactivated (§3.7) | `403 account_deactivated` |
| 3 | `propertyId` + ISO dates present, `endDate > startDate` | `400 bad_request` |
| 4 | property exists and `status == "published"` | `404 not_found` |
| 5 | `months ≤ min(11, maxStayMonths)` | `400 max_stay` |
| 6 | `months ≥ max(1, minStayMonths)` | `400 min_stay` |
| 7 | `startDate ≥ today` and `≥ availableFrom` | `409 dates_unavailable` |
| 8 | no overlap with **blocking** entries — expired holds excluded, same predicate as the client (§2.2.3; resolves v1 🐞 §5.4.4) | `409 dates_unavailable` |
| 9 | insert document | `500 server_error` |

**No transactional email** (Resend 🗑️ dropped): the flow's delivery mechanism
is the user-sent draft, exactly as v1's live MVP. The step-3 hook point is
where **Azure Communication Services email** can later notify staff/guest
without touching the flow shape (OD-2, §5). Failures after logging (user
closes the draft) are visible to staff via the admin request log.

## 4.4 Host flow ✅ (any authenticated user — ADR-014)

**Dashboard** — "Manage Property", `/{locale}/host/` ✅ built: own listings
with status badges (`draft`/`pending_review`/`published`/`rejected` +
`reviewNote`/`paused`), a portfolio ledger, a pending-requests roll-up, and
per-listing availability bands. Reads `GET /api/host/properties`. Every
portfolio figure is derived from the availability data that draws the bands —
never stored twice (`app/lib/portfolio.ts`).

**Manage property** — `/{locale}/host/manage?id=` ✅ built: the per-listing
working view. Reads `GET /api/host/properties/{id}`, which returns the owner
projection, the pricing block, and the **booking-interest log** for that
listing (`bookingRequests`, read-only — status is admin-triaged, and the log is
projected **without `userId`/`userName`**: Ebrostay owns every tenant
conversation, so the owner surface has no tenant identity to leak). Five
sections behind a sticky scroll-spy nav:

| Section | Source | State |
| --- | --- | --- |
| Stays | `confirmed` availability blocks; length in days and rent derived per ADR-022/023 | ✅ real, thin — see below |
| Pricing | `PUT …/pricing`; payout preview from `lib/pricing.ts` | ✅ live-editing |
| Availability | `PUT …/availability`; day calendar + the 12-month band | ✅ live-editing |
| Billing & payouts | `paymentSchedule()` over confirmed blocks | ✅ derived, read-only |
| Performance | request log (real); views 🔜 no source | ⚠️ partial |

Two figures on this page have no data model behind them yet and are shown as
honest empty states rather than invented: **views/analytics** (no read API —
Umami is write-only from the client) and a **stay record**. A confirmed stay is
currently just an availability range with a free-text `note` (§4.5), so the
Stays table can derive dates, length and rent but has no stay reference, no
stay type, and no *agreed* rent distinct from the live price. Owner payouts are
likewise still 🔜 (§2.1): the billing table derives what the pricing rules
already fix and the payout account is shown disabled.

**Commission on this page follows ADR-004 as amended, not a flat monthly
deduction:** 15% of rent, capped at 30 days' rent, charged **once on the first
instalment** (`paymentSchedule()`). Later monthly payouts are rent in full.

**Vocabulary:** stays are measured in **days of occupancy**, never "nights" —
that is short-let language, and Ebrostay lets homes by the month under an
*arrendamiento de temporada*. The boundary event is the return of the keys,
which is exactly what the exclusive `end` already encodes: the tenant does not
pay for their move-out day.

**Turnover (ADR-026) ✅ built:** the availability section draws a **turnaround**
state for the `turnoverDays` after each stay — hatched, distinct from a
booking, so the owner can see which days earned and which were the cost of the
ones that did. The pricing fieldset carries `turnoverDays`, `cleaningBy` and
the host's cleaning fee. The buffer is applied once, in the public projection,
never stored as a block.

**Edit listing** — `/{locale}/host/edit?id=` ✅ built (ADR-027): the other half
of the owner portal, and the content half of the ADR-025 split. Reads the same
`GET /api/host/properties/{id}`, writes `PUT /api/host/properties/{id}`.
Nine sections down a sticky rail, saved by **one** whole-page diff:

| Section | Source | State |
| --- | --- | --- |
| Basics | `name`, `type`, capacity, `sizeM2`, `floorNumber` | ✅ editable |
| Address & cadastre | `address`, `postcode`, `cadastralRef`, `lat`/`lng` | ✅ editable; Catastro queried live both ways — reference → record, and address → reference for an owner without their IBI receipt. No `MATCHED` badge, no licence field (ADR-027). An outside answer fills only an empty field and otherwise offers — **including the pin**, which a saved listing keeps until the owner accepts a move; a declined offer is remembered and not repeated until it changes (§2.2.4) |
| Rooms & levels | — | ❌ no room entity (ADR-027) |
| Nearby | embedded `nearby[]` — group tabs, map-assisted candidate picker, route preview | ✅ editable (ADR-028, §4.4.1 below) |
| Photos | embedded `photos[]` — reorder, cover, floor-plan flag, remove | ⚠️ no upload (ADR-019 🔜) |
| Floor plan | `isFloorplan` photos | ⚠️ flag only; no pins |
| Description | `copy`/`details`/`beds` bilingual + `copyEnApproved` | ✅ editable; owner writes both languages |
| Amenities | `amenities[]` | ✅ editable |
| Rules & terms | `petsAllowed`, `smokingAllowed`, `couplesAllowed`, `selfCheckin` | ✅ editable; policy block read-only |
| Legal | — | ❌ no document model (ADR-027 🔜) |

The rail reports **edit status, not scroll position** — three states (edited,
needs attention, resting) — which is why it carries no scroll spy while
Manage's tab bar does: the two pages are navigated for different reasons. Both
pages read one derived diff (`lib/listing.ts`); the save bar's chips, count,
review note and button state are all the same comparison.

The **danger zone** offers pause/reopen via `PUT …/status` (ADR-024, no
re-review on reopen). Deleting a listing is not offered: a listing carries stay
history, and "keep the data, close the listing" is what `paused` means.

**Add a property** — `/{locale}/host/new` ✅ built (ADR-030): the nine-step
wizard a listing comes into existence through. It owns no fields — every step
but the last wraps a component the editor already uses, over **one** draft
`HostListing` plus its pricing and blocks:

| Step | Composes | Gate to advance |
| --- | --- | --- |
| Address | `AddressFields` (geocoder, cadastre, `LocationPicker`) | street, valid postcode, a placed pin |
| Nearby | `NearbyEditor` (§4.4.1) | — skippable |
| The home | `BasicsFields` | name, area, ≥1 bedroom, ≥1 bathroom |
| Photos | `PhotoManager` | — skippable |
| Description | `DescriptionFields` | ES description present |
| Amenities | `AmenityPicker` | — |
| Price & availability | `PricingFields` + `AvailabilityEditor` + payout card | price > 0, a chosen minimum stay |
| Rules & terms | `RulesFields` | — all four rules have a valid default |
| Paperwork | — | ❌ no document model — shipped inside a `NOT BUILT YET` frame (ADR-030 Decision 6) |

The document is created **on leaving step 1** by `POST /api/host/properties`
(no body, mints an empty owned `draft`, `MaxOpenDrafts = 8`), because photo
uploads are live writes that need a real id. A draft — and only a draft — may
be nameless: the wizard asks *where* before *what to call it*.

The draft persists when a step is **left**, not on every keystroke, through
the same three endpoints the editor and Manage use. Step gates cover only what
the next step needs; everything else is reported at submit by the editor's own
`blockersOf`, surfaced on the rail. The rail is `SectionNav` with jump buttons
and a `done`/`now`/`ahead` disc set — the same measured rail → bar → sheet
ladder as the other two owner pages.

**Create/edit → submit → review → publish/reject** (lifecycle §2.2.1):

1. Create listing → `draft` (owner = caller) ✅ `POST /api/host/properties`.
2. Editor: full property data entry — **bilingual es+en fields side by side**
   (both required to submit), amenities, conditions, pricing, stay limits;
   **availability blocks** (add/remove confirmed blocks and holds, §2.2.3);
   **Nominatim geocoding** for the address (client-direct, docs/spec/07 §7.4
   carried incl. usage-policy notes); **AI assistant** (§4.6).
3. **Photos:** ✅ upload via `POST /api/host/properties/{id}/photos`, one file
   per request. The browser downscales to a ~2560 px ceiling first — a
   transfer optimisation only, and its output is untrusted like any other
   input. The API sniffs magic bytes, refuses SVG and HEIC by name, caps bytes
   and reads dimensions **before** decoding, extracts EXIF, then re-encodes
   into three WebP sizes (§2.2.2) under server-generated names with 1-year
   cache headers. Full rules: ADR-019 amendment.
   - **Applies live**, and does **not** move `status`: a photo is a transfer,
     not a claim. Reorder, floor-plan flag and delete stay in the editor's diff
     and travel with the content save, because those *are* claims.
   - Removing a photo deletes all three blobs, after the document write.
4. Submit → `pending_review` ✅ `PUT …/status`, accepted from `draft` or
   `rejected` only, and only when `HostProjection.SectionsDone(doc) ==
   SectionsTotal` — the same eleven checks the portfolio's draft progress bar
   counts (required fields in both locales, ≥1 photo, a price, a deposit).
   Resubmitting clears `reviewNote`. A **content** edit of a published listing
   also returns it to `pending_review` (§2.2.1; refinement OD-5). Operational
   edits made from Manage do not — ADR-025.
5. Admin approves → `published` (public) or rejects with a note → `rejected`;
   host edits and resubmits.

Hosts never write `status: "published"` directly and never touch other users'
listings — enforced in the functions (§3.5), not the UI.

### 4.4.1 Nearby editor: candidate lookup, then a save that measures ✅ (ADR-028)

The owner never types a distance (Decision 1). They pick a group, see real
places around the pin, choose which to keep, and the server measures
everything.

```
1. HOST      opens a group tab (transport | groceries | food | outdoors |
             health) in the Nearby section →
             CLIENT  GET /api/host/nearby/candidates?lat=&lng=&group=
                     (the listing's OWN pin — a candidate open costs one
                     request per profile, not one per candidate, because it
                     is answered by a matrix, not N single routes)
2. SERVER    HostNearbyCandidates: owner-authenticated, `NearbyGroups
             .InZaragoza` bound, unknown group → 400 `bad_group`.
             NearbyLookup.CandidatesAsync:
               a. OverpassClient.FindAsync — POI search, cached per rounded
                  CELL + group (§2.2.5); a cache hit skips Overpass entirely.
               b. ORS MATRIX, once per profile, ALWAYS against the true pin
                  (never the rounded cell — that would put cell-rounding
                  error into a distance shown as precise).
               c. a POI with no walking figure at all is dropped — it can be
                  neither ranked nor shown; a profile with no figure (e.g.
                  routable on foot but not by car) is simply absent from
                  that candidate's `reach`, not zero.
             Returns candidates ranked by walking minutes ascending.
3. HOST      clicks a candidate to preview it before adding →
             CLIENT  GET /api/host/nearby/preview-route?lat=&lng=&toLat=
                      &toLng=&profile= (owner-authenticated, stores nothing —
                      for a candidate not yet saved, so nothing here writes
                      to `nearbyRoutes`)
             the map draws the real routed line, same OrsClient.RouteAsync
             the public lazy fetch uses (§4.2.1) — a preview is never a
             straight-line guess either.
4. HOST      clicks Add → the entry moves into the listing's chosen list
             (client-side only; nothing is measured or saved yet). A 7th
             pick in one group is refused client-side with the same
             `nearby_group_full` reason the server enforces (§2.2.5 caps).
             Focus stays in the candidate finder after Add, falling back to
             the next addable row.
5. HOST      clicks the page save bar → PUT /api/host/properties/{id} with
             the WHOLE nearby list (§4.4's one-diff, one-save rule). The
             server never trusts a client-sent reach figure (§2.2.5): it
             matches each entry by id against the stored document, carries
             over the figures of anything unchanged, and re-measures only
             what is new, moved, or every entry at once if the PIN moved.
             An entry no profile can route to blocks the WHOLE save
             (`nearby_unroutable`) — no entry is ever written with an empty
             `reach`. Only after the write succeeds are that property's
             cached `nearbyRoutes` dropped (pin-move case only) so the next
             guest click re-routes from the new pin.
```

A **custom place** (no OSM match — the type dropdown's escape hatch) skips
steps 1–3: the owner types a name, a Spanish label required (English
optional, falling back to Spanish with an attention flag — the `enNotApproved`
pattern, ADR-027 Decision 4), and drops a pin by hand; it still goes through
the same server-side measurement at step 5, because **no entry's figures are
ever authored** (Decision 1, Decision 8).

## 4.5 Admin flow ✅ (3 invited admins — §3.3)

`/{locale}/admin/` (route rule cosmetic; every endpoint checks the role):

- **Review queue:** `pending_review` listings, oldest first; full detail view;
  **Approve** → `published`, **Reject** (note required) → `rejected`.
  - **🔜 Catastro check (ADR-027).** When the listing carries a
    `cadastralRef`, call the Catastro **at review time** and show what it says
    beside what the owner claims. Nothing is stored — read a live answer, not
    a copy, because the only copy would be one the client reported.
    `app/lib/catastro.ts` already does the call and the parsing.

    Four things to put in front of the reviewer:

    | Signal | Source | Why it matters |
    | --- | --- | --- |
    | **Use** | `luso` | The strongest one, and the reviewer's job rather than the owner's (product owner, 2026-07-28). A reference resolving to `Comercial` or `Almacén-Estacionamiento` is probably not a home. Deliberately *not* warned about in the editor: a legitimately reclassified property would be nagged on every visit. |
    | Built surface | `sfc` | A listing claiming much more than the register records is a claim worth reading. Note `sfc` includes a share of common areas, so it runs *above* what an owner measures inside — a small excess is normal, a large one is not. |
    | Postcode | `dp` | Cheap contradiction check against the address. |
    | Position | `Consulta_CPMRC` | The parcel centroid against the listing's pin. Far apart means the reference and the map disagree about which building this is. |

    None of these is a rejection on its own. The register goes stale, and an
    owner may simply be right — that is why the owner is never blocked from
    saving them (ADR-027 decision 4b). They are what a reviewer looks at.

    **Where the owner has declined a suggestion** (§2.2.4), say so beside the
    live comparison — "owner declined this on 28 Jul" — and nothing more.

    | Rule | Why |
    | --- | --- |
    | It never suppresses a signal | The comparison above is computed from the live answer and shown in full whether or not the owner declined it. A decline is host-writable, so a queue that hid rows on the strength of one would let a listing silence its own review. |
    | It is context, never a resolution | A reviewer may want to know the owner considered this and disagreed. That is not an answer to the question they are being asked. |
    | It is not evidence of anything | It records that a dismissal happened, not that the owner was right. Weigh it accordingly. |
  - **🔜 Photo location check (ADR-019 amendment).** Each photo's
    `capturedLat`/`capturedLng` (§2.2.2) shown as a distance from the listing
    pin. The published images have had their EXIF stripped; these are what it
    said before it went.

    | Reading | What to make of it |
    | --- | --- |
    | **No coordinates** | Nothing. The common case, and not a signal: WhatsApp and most social platforms strip EXIF, screenshots never had it, location services are often off. Shown as "—", never as a warning — flagging absence would flag nearly every listing and teach reviewers to ignore the column. |
    | Within ~1 km of the pin | Consistent. The radius is deliberately loose: these are **indoor** photos, where a phone falls back to wifi and cell positioning and can be off by hundreds of metres. A tight radius would flag honest listings all day. |
    | Far from the pin | Worth reading. One outlier is often a stock shot of the neighbourhood; the whole set far away is a different question. |
    | **Scattered across several places** | The strongest of the three, and the reason to show them together rather than one at a time: a set of photos from three different districts is not one home. |

    `capturedAt` rides along and is not flagged — but a "recently renovated"
    listing whose photos are eight years old is something a reviewer can see
    for themselves.

    **This is a signal, never a verification, and the surface must say so.**
    `exiftool` rewrites GPS in seconds, so a determined bad actor defeats it
    completely; it catches honest mistakes and lazy fraud. Same discipline as
    the absent `MATCHED` badge (ADR-027).
- **All-properties management:** list/filter every listing in any status;
  direct edit (no re-review, §2.2.1); pause/takedown.
- **Users:** list `profiles` (id, provider, name, created, flags);
  **deactivate/reactivate** (§3.7). No hard delete in v2 scope.
- **Booking-request log viewer:** all `bookingRequests`, newest first, with
  `estimateMismatch` highlighted; status triage `new → contacted →
  confirmed | declined` (carried from v1 §4.6). When accepting a stay the
  admin (or host) records it as a **confirmed availability block** on the
  property — creating blocks stays a manual acceptance act, as in v1.
- **Inquiries viewer:** read `inquiries` (§2.5).

## 4.6 AI assistant ✅ (ADR-020)

v1's DeepSeek assistant (docs/spec/07 §7.3) ported to a C# function,
`POST /api/ai-assistant`, using the **existing DeepSeek key** (Functions app
setting, §1.3). Actions carried: **extract** (paste/OCR text or images →
property fields), **translate** (es↔en field), **describe** (generate
bilingual copy). Available to **hosts for their own listings** (ownership
checked server-side) **and admins** — the widened audience vs v1 (admin-only
editor) follows the marketplace model. Degradation carried from v1: key not
configured → `503 ai_not_configured`, editor shows a friendly notice and works
normally otherwise. Privacy note carried: send property text only, never
tenant/user personal data (DeepSeek's hosted API runs in China — docs/spec/07
§7.3).

## 4.7 i18n & theme requirements ✅

Hard requirements on **every** flow above (carried from v1 R-NF-3 and CLAUDE.md
conventions):

- **Every user-facing string exists in `app/messages/es.json` AND `en.json`**
  — including error states, estimate lines, review-queue UI, and the
  email/WhatsApp draft summary (the draft renders in the user's UI locale;
  bilingual summary format carried from v1). Spanish is default; routes are
  always locale-prefixed (`localePrefix: "always"`); navigation only via
  `@/i18n/navigation`.
- Locale-specific money/date formatting per docs/spec/05 §5.1.3 (ES
  `14.850 EUR` / EN `14,850 EUR`; `es-ES` / `en-GB` dates).
- **Light AND dark themes are both first-class** on every page incl. host and
  admin surfaces: theme = `data-theme` on `<html>`, set pre-paint by the
  layout bootstrap script; Tailwind `dark:` variant keys off it; never
  `@media (prefers-color-scheme)` directly.

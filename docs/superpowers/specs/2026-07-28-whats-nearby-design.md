# "What's nearby" — design

**Date:** 2026-07-28
**Branch:** `redesign/v2`
**Status:** approved design, not yet implemented
**Supersedes:** the placeholder in `app/lib/detail-placeholders.ts`

---

## 1. What this is

The property detail page has a "What's nearby" section fed by
`PLACEHOLDER_NEARBY` — generic Zaragoza facts, identical for every listing,
with distances measured from nowhere in particular. Its own header says to
delete it once the API has fields. This design gives it real per-listing data
and an editor to produce it.

The listing editor gains a **Nearby** section where an owner picks a group
(public transport, restaurants, …), gets a map-assisted list of real places
around their pin, and chooses which ones the listing should mention. Distances
are **measured, never typed**. A guest can click any entry and see the actual
walking (or driving) route drawn on the map.

### Goals

- Per-listing nearby entries that are true of *that* home, not of the city.
- Distances an owner cannot inflate.
- Bilingual ES/EN throughout, with no owner translation burden in the common
  case.
- No third party in the request path of anything a guest sees on page load.

### Non-goals

- A city-wide curated POI set shared across listings (§11).
- Transit or cycling profiles (the design admits them; v1 ships foot and car).
- Replacing `YourPlaces` (§9.4).
- An admin review surface for nearby entries (§11).

---

## 2. Decisions

These were settled in conversation on 2026-07-28 and are not open in the
implementation plan.

| # | Decision | Rationale |
|---|---|---|
| D1 | **Suggestion is the primary path**, manual entry the escape hatch | OSM already knows where every stop, pharmacy and park in Zaragoza is. Typing them by hand is repetitive and produces inconsistent listings. |
| D2 | **Walking distance comes from a routing engine**, computed once at pick time and stored | Zaragoza has a river. A straight line of 300 m can be a 2 km walk. Straight-line figures would be optimistic exactly where it matters. |
| D3 | The second line is a **fixed translated type vocabulary**; custom types take **Spanish required, English optional** with fallback + attention flag | The vocabulary is bilingual for free in `messages/*.json`. The escape hatch mirrors the existing `enNotApproved` pattern rather than inventing a parallel one. |
| D4 | **Per-listing curation.** No city-wide POI set | Optimise later on a better decision base; let owners choose first. |
| D5 | Pin moves → **re-measure silently**, and flag entries that drifted beyond the group radius as `needsCheck` | Distances are derived facts the owner never authored, so recomputing them is not overwriting their work. But an entry that ends up 3 km away is a bad *selection*, not just a bad number. |
| D6 | **OpenRouteService, hosted, called from a Function** | Every routing service worth relying on needs a key, and *"Secrets never in the client or repo"*. Also: the browser cannot set a `User-Agent`, which these services require. |
| D7 | **Numbers eager, geometry lazy** | The owner needs distances to choose. Nobody needs a route line until someone clicks. |
| D8 | The public route endpoint takes **`(propertyId, entryId, profile)` and never coordinates** | Coordinates come from the stored document, so the endpoint cannot be used to route arbitrary points at our expense. |
| D9 | **Reach is a map of profile → figures**, not two scalar pairs; the profile toggle is a **guest-side** control | A third profile becomes configuration rather than a migration. Owners choose *places*; guests choose how they'd travel. |
| D10 | **Search radius is per group** | "Nearby" means 800 m for a bus stop and 10 km for a hospital. |
| D11 | Detail-page sections 7 ("Where you'll be") and 9 ("What's nearby") **merge into one** | The route line has to be drawn in the same viewport as the list you clicked. |
| D12 | **The owner never types a distance or a duration** | A number beside a place name is a promise a guest reads as fact. Owners control *which* places appear, never how far they are. |

---

## 3. Provider: OpenRouteService

Account: `info@ebrostay.com`, signed in via GitHub at
<https://account.heigit.org>. HeiGIT permits one account per person, so this is
the project's single account. Key is read from **`ORS_API_KEY`** —
`api/local.settings.json` locally (gitignored), Static Web App environment
variables when deployed.

### Terms, read 2026-07-28

Findings from <https://account.heigit.org/info/tos>:

- **Commercial use is not restricted.** The terms do not address it.
- **Results are CC-BY-SA 4.0**, not CC-BY. ShareAlike attaches to the result,
  not to our codebase.
- **Attribution is required** wherever results are shown, verbatim:
  `© openrouteservice by HeiGIT | Data from OpenStreetMap`
- **No restriction on caching or storing results.**
- Prohibited conduct includes transmitting personal data. Read literally that
  is odd for a routing service — you cannot route without transmitting
  locations — so it plainly means data *about people*. Our requests therefore
  carry coordinates and a profile and **nothing else**: no listing id, no owner
  id, no address string.
- **Exceeding limits repeatedly can disable the account without notice.** This
  is why §8 forbids retry loops.
- Free tier is ~2,500 requests/day. Matrix accepts 3,500 locations per request;
  ours is 1 × ~20.

### Engine independence

`OrsClient` is the only class that knows ORS exists. The terms may change
"effective immediately upon posting", and self-hosting OSRM (BSD-2-Clause) or
ORS (GPL-3.0, no network clause) is the escape hatch. Both speak the same
request shape, so the exit is one class.

---

## 4. Architecture

Three Functions, two owner-only.

```
EDITOR (owner, authenticated)
  GET /api/host/nearby/candidates?lat=&lng=&group=
      → Overpass: POIs for that group within the group's radius
      → ORS matrix (per profile): pin → all candidates
      → ranked candidates: name, type, coords, reach per profile

  GET /api/host/nearby/preview-route?lat=&lng=&to=&profile=
      → ORS directions → drawn in the editor, stored nowhere

PUBLIC (anonymous)
  GET /api/properties/{id}/nearby/{entryId}/route?profile=foot
      → route doc in Cosmos?  hit  → return
                              miss → coordinates from the property document
                                   → ORS directions
                                   → write through, return
```

### Services (`api/Services/`)

| Class | Responsibility |
|---|---|
| `OrsClient` | The seam. `MatrixAsync`, `RouteAsync`. Holds the key, sets `User-Agent`, enforces the budget, handles 429. Nothing else knows ORS exists. |
| `OverpassClient` | POI search. Group → OSM tag filters **and radius** live here, because they are query syntax rather than UI vocabulary. |
| `NearbyLookup` | Composes the two, merges, ranks, applies the candidate cache. |
| `RouteCache` | The lazy write-through. The only thing the public Function talks to, and the only place origin and destination are chosen — so "the caller cannot make us route arbitrary points" holds by construction. |
| `OrsBudget` | Cross-instance limiter (§8.2). |

### Client

- `app/lib/nearby.ts` — type vocabulary and its group mapping, polyline
  decoder. Pure, no fetching, matching `lib/listing.ts` and `lib/pricing.ts`.
- `app/components/host/fields/NearbyEditor.tsx` — the editor section.
- `app/components/detail/Nearby.tsx` — rewritten for real data and the merged
  neighbourhood section.

### Two boundaries

1. **Coordinates never come from the client on the public path.** Same shape as
   `photo_unknown` rejecting URLs that are not already on the document.
2. **The public projection carries no OSM ids and no raw ORS payload.** A
   `PublicNearby` record, sibling to `PublicPhoto`, which exists because
   `ToDetail` once leaked EXIF.

---

## 5. Data model

### 5.1 Entries — embedded on `PropertyDoc`

Read with the property ~100% of the time, changed only on owner save, ~200
bytes each. That is an embed, like `Photos` and `Availability`.

Boundedness is **enforced, not assumed**: `HostValidation` caps entries at
**6 per group and 24 in total**. Note the total binds first — five full groups
would be 30 — so an owner cannot fill every group to its per-group maximum.
That is deliberate: 24 entries is already more than the detail page reads well
with, and the per-group cap exists to stop one group crowding out the rest.

```csharp
public record NearbyReach(int Metres, int Minutes);

public record NearbyEntry(
    string Id,             // server-generated GUID; keys the route cache
    string Group,          // transport | groceries | food | outdoors | health
    string? Type,          // vocabulary key ("tram"); null when custom
    Bilingual? CustomType, // only when Type is null. Es required, En optional
    string Name,           // proper noun, one string, deliberately not bilingual
    double Lat,
    double Lng,
    Dictionary<string, NearbyReach> Reach,  // "foot" → …, "car" → …
    string? OsmId,         // "node/1234" — provenance, never public
    string? MeasuredAt,    // ISO; when Reach was computed
    bool NeedsCheck        // a pin move pushed this beyond the group radius
);

// on PropertyDoc:
public NearbyEntry[] Nearby { get; set; } = [];
```

`Id` is server-generated, like photo filenames. A client-supplied id would let
a caller point the route cache at an entry it does not own.

**Public projection** — `PublicNearby` carries id, group, type/customType,
name, coordinates and `Reach`. It drops `OsmId`, `MeasuredAt` and `NeedsCheck`.
Coordinates are public: a bus stop's location is not sensitive, and the map
needs the destination marker before the line loads.

### 5.2 Routes — referenced, own container

Embedding fails on two counts, the second a correctness problem rather than a
performance one:

- **Access correlation is near zero.** The property document is read on every
  detail page load and every owner portal load; a route is read only when
  someone clicks one entry.
- **The write paths would collide.** Routes are written lazily by an
  *anonymous* request; the property document is written by the owner's save.
  Embedding means the public path does a read-modify-write on the hot document
  and can clobber a save.

```
container      nearbyRoutes
partition key  /propertyId          (same shape as bookingRequests)
id             "{entryId}-{profile}"   → always a point read, ~1 RU
defaultTtl     180 days
```

```csharp
public record NearbyRouteDoc(
    string Id, string PropertyId,
    string Profile,
    string Polyline,          // encoded polyline5, overview=simplified
    int Metres, int Seconds,  // provenance only; the entry's Reach is displayed
    string FetchedAt
);
```

≤24 entries × 2 profiles × ~2 KB ≈ 100 KB per logical partition against a 20 GB
limit. Cardinality equals the number of properties; reads are per-property, so
no hotspot.

**The TTL is the point.** These are a cache. 180 days means road-network
changes propagate with no admin work and no stale-route problem to solve by
hand.

**Indexing — exclude everything.** We only ever point-read by
`(id, propertyId)`, and point reads do not use the index. Indexing a 2 KB
polyline we never query on is pure write cost.

```json
{ "indexingMode": "consistent",
  "includedPaths": [{ "path": "/propertyId/?" }],
  "excludedPaths": [{ "path": "/*" }] }
```

`/propertyId` stays indexed only so invalidation can find a property's routes.

### 5.3 Candidate cache — split so the numbers stay honest

Caching the whole lookup would break the figures: rounding the origin to a
~110 m cell to get hits would put up to ~78 m of error into a distance we
present as precise. So the cache splits along what actually varies.

- **Overpass POI results are cached**, keyed on a rounded cell + group. Bus
  stops do not move, and two flats in the same block genuinely share an answer.
- **The ORS matrix always runs against the true pin.**

```
container      nearbyCandidates
partition key  /cell     e.g. "41.648|-0.889|transport"
id             = cell    one document per cell+group, point read
defaultTtl     30 days
```

Cell coordinates are rounded to **3 decimal places (~110 m)**. A warm category
open therefore costs one matrix call per profile and no Overpass call at all —
two requests instead of three — and returns fast enough to feel instant rather
than waiting on the slowest of the two services.

### 5.4 Budget counter

```
container      serviceBudget
partition key  /id
id             "ors-2026-07-28"    one document per day
defaultTtl     2 days              self-cleaning
```

### 5.5 Existing container

The `properties` indexing policy should exclude `/nearby/*` — we never query on
it and every save would otherwise index the array. `/photos/*` and
`/availability/*` are almost certainly in the same position today; that is
pre-existing and deliberately **out of scope** here.

### 5.6 Infrastructure

`infra/local-bootstrap.mjs` and `infra/main.bicep` both gain the three new
containers so a fresh machine and Azure stay in step.

---

## 6. Group vocabulary

Groups are fixed at five, matching the existing `CATEGORY_ICONS`. Each carries
its OSM tag filters **and its own radius**, defined in `OverpassClient`.

| Group | Radius | Types in the vocabulary |
|---|---|---|
| `transport` | 800 m | tram, bus, rail, metro, bikeshare, taxi |
| `groceries` | 1 km | supermarket, market, bakery, convenience, mall |
| `food` | 1 km | restaurant, tapas, cafe, bar |
| `outdoors` | 2 km | park, river, sports, pool, playground |
| `health` | 10 km | pharmacy, clinic, hospital, dentist, vet |

Type labels live under a shared **`nearby.type.*`** key in `es.json`/`en.json`,
not under the editor's namespace, because the public page renders the same
labels. Defined once.

Profiles for v1: **`foot`** (ORS `foot-walking`) and **`car`** (ORS
`driving-car`). The list is closed and validated server-side so the endpoint
cannot be used to invoke arbitrary ORS profiles.

---

## 7. Surfaces

### 7.1 Editor

A new `SectionCard id="nearby"`, placed **directly after Address** —
`basics → address → nearby → photos → description → amenities → terms`.
Thematically it sits closer to description, but it depends on the pin, and
sequencing a form by dependency beats sequencing it by theme.

Adding `"nearby"` to `SECTIONS` in `app/lib/listing.ts` is all the wiring
needed: the section nav grows a rung, the diff tracks it, the "changed"
indicator and the single save bar pick it up.

**Group chips carry the overview.** `ChipGroup`, not `Segmented` — that
component's own comment says *"a segmented control with five segments is a tab
bar wearing a hat"*. Each chip carries a count, so the chips are the summary
rather than decoration.

```
┌ WHAT'S NEARBY ─────────────────────────────── 11 places ─┐
│  [Transport 4] [Groceries 2] [Restaurants 3]             │
│  [Outdoors 2]  [Health 0]                                │
│                                                          │
│  ── your transport entries ───────────────────────────   │
│   Tranvía L1 · Plaza España     TRAM    4 min · 340 m  × │
│   Bus Ci1 / 22 · Coso           BUS     3 min · 190 m  × │
│                                                          │
│   [ Find nearby ]   [ Add manually ]                     │
└──────────────────────────────────────────────────────────┘
```

"Find nearby" expands the finder **inline** — `AddressFields` already puts
`LocationPicker` inline, and a modal would fight the sticky nav and save bar
for the same screen.

```
│  ── nearby transport ──────────────────────────  close  │
│  ┌────────────────────┬──────────────────────────────┐  │
│  │  home pin,         │  ○ Bus 40 · Mayor            │  │
│  │  candidate pins,   │      5 min · 410 m     [add] │  │
│  │  route line when   │  ○ Tranvía L1 · Gran Vía     │  │
│  │  one is clicked    │      7 min · 600 m     [add] │  │
│  └────────────────────┴──────────────────────────────┘  │
│  © openrouteservice by HeiGIT | Data from OpenStreetMap │
```

**Side-by-side above a threshold, stacked below — via a container query, not a
media query.** This is the opposite call from the `SectionNav` work: that was
content-dependent width (variable label strings) and had to be measured. This
is not — but the edit page grows a rail at `64rem`, so the card's width is not
a function of the viewport, and a media query would be wrong in exactly the
rail case. Tailwind v4 `@container`.

**Clicking** a candidate draws its route — click, not hover, because hover
would fire a request per mouse movement, and click is also the gesture guests
use, so there is one mental model.

**Adding manually** puts the map in drop-a-point mode: click, then name and
type it. A one-shot matrix runs for that point, so manual entries get real
figures too. Per D12 the owner never types a distance.

**Type control** is a `select` (≈15 entries is past chip territory),
pre-filled from the OSM tag, always overridable, with **Other…** last revealing
the two bilingual inputs.

**The editor shows walking figures only** and ranks candidates by walking time,
while computing and storing both profiles. Owners choose places; the profile
toggle is the guest's.

**States:** empty (all chips at zero and one explanatory line — not an error,
not an attention item, not required to publish); at cap (add disabled *with the
reason shown*); lookup failed (named, retryable, manual add still works); ORS
unreachable (**the entry is not saved** — no nearby section beats a fabricated
number).

**Keyboard:** the list is the source of truth, the map is the enhancement.
Every candidate is addable from the list alone. Map pins get accessible names
as `ListingsMap` already does. After adding, focus stays in the candidate list.

### 7.2 Public page

Sections 7 and 9 merge into one **neighbourhood** section (D11):

```
┌ THE NEIGHBOURHOOD ───────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────┐  │
│  │   map — home pin, route line, destination marker    │  │
│  └────────────────────────────────────────────────────┘  │
│  📍 Calle …                          [ on foot | by car ]│
│  © openrouteservice by HeiGIT | Data from OpenStreetMap  │
│                                                          │
│  ┌ PUBLIC TRANSPORT ────┐  ┌ RESTAURANTS ──────────┐     │
│  │ Tranvía L1  4 min ·… │  │ El Tubo    4 min · …  │     │
│  └──────────────────────┘  └───────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

The existing card grid survives nearly intact — same `sm:grid-cols-2`, same
`CATEGORY_ICONS`, same figure typography. Entries become buttons, ordered by
the active profile's time ascending within each group.

**Profile toggle** re-labels every figure and redraws any drawn line. Default
`foot`.

**Fetching:** loading state on the clicked entry, not the page. Failure shows
"route unavailable" on that entry and stays clickable — **the figures never
disappear**, because they came from the document.
`Cache-Control: public, max-age=86400` so a second click does not reach the
Function, mirroring the photo blobs' `immutable` header.

No new location is disclosed: the origin is the pin the map already publishes.

**Attribution** sits under the map, verbatim and untranslated in both locales —
it is a legal credit, not copy. Leaflet already emits the OSM tile attribution;
this is the ORS half, and it names CC-BY-SA 4.0 for the geometry.

**Empty:** groups with no entries render nothing; a listing with no entries at
all loses the nearby half and keeps the map and address. A guest has no use for
an empty state that says the owner did not fill something in.

### 7.3 Two things this fixes

- **The subtitle currently lies.** *"Indicative times from central Zaragoza"*
  was honest about placeholder data and becomes false once figures are measured
  from this address. It becomes "Walking times from this address" /
  "Tiempos a pie desde esta dirección", varying with the active profile.
- **`app/lib/detail-placeholders.ts` is deleted**, as its own header instructs.
  `PLACEHOLDER_NEARBY` appears to be its last remaining export since the host
  block was removed on 2026-07-28; confirm at build time rather than assume.

### 7.4 `YourPlaces` is deliberately untouched

It computes travel times as `km ÷ MODE_SPEED` on a straight-line distance, so
once Nearby shows routed times the page carries two standards of rigour a few
hundred pixels apart. It stays as is, for a structural reason: `YourPlaces`
routes to **arbitrary addresses a visitor types**, which is exactly the
unbounded, guest-triggered, uncacheable workload the `(propertyId, entryId)`
design exists to avoid. Making it real would reintroduce the open-proxy
problem in its purest form.

---

## 8. Errors and limits

### 8.1 Failure taxonomy

| Failure | Consequence |
|---|---|
| Overpass down | Candidate lookup fails, named, retryable. Manual add still works; cached cells still serve. |
| ORS matrix fails | No figures → **the entry cannot be added**. Never a guessed number. |
| ORS directions fails | The line does not draw. Figures unaffected. |
| Budget ceiling hit | As a 429 but clearer, and **no outbound call at all**. |
| Route cache write fails | **The request still succeeds.** The next click refetches. |
| Unknown property or entry id | 404 without touching ORS. |

**On 429: at most one bounded retry**, honouring `Retry-After`, then surface.
Never a retry loop — the ToS makes an aggressive retry the single most
dangerous thing we could write.

`IHttpClientFactory` named clients with explicit timeouts (Overpass 10 s, it is
genuinely slow; ORS 5 s) and `User-Agent` set once on the client.

### 8.2 Budget counter

Increment `ors-YYYY-MM-DD` with ETag optimistic concurrency **before every
outbound call**, bounded retries on 412, ceiling ~1,500/day against ORS's
2,500. **Fails closed** — if the budget cannot be confirmed, no call. Academic
in practice: if Cosmos is unreachable the property read already failed.

This is a Cosmos document rather than a Durable Functions entity because
**SWA managed functions support HTTP triggers only** and Durable Functions are
unavailable on them
([docs](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions)).
Cosmos is the shared state we already have.

### 8.3 Validation on save — the rule that matters most

**Reach figures are never accepted from the client.** Entries are matched by id
against the stored document, the same `kept[p.Url]` pattern the photo path
uses:

- entry unchanged **and the pin unchanged** → keep stored `Reach` and
  `MeasuredAt`
- new entry, or the entry's coordinates changed → measure server-side now
- **the property's pin moved** → re-measure *every* entry, because the origin
  of all of them changed (D5), and flag any that now fall beyond their group's
  radius as `needsCheck`
- `MeasuredAt` older than ~12 months → re-measure in the same call
  *(deferred; see §11)*

A tampered payload claiming a one-minute walk to the airport is silently
corrected, and an ordinary save costs zero ORS calls.

Alongside it: group and profile from closed sets; coordinates inside a Zaragoza
bounding box, defined once in configuration alongside the group vocabulary
(**this is what stops the owner endpoint being a general-purpose router**);
≤6 per group and ≤24 total; name ≤80 chars; custom-type Spanish required,
≤40 chars each.

Saving the section re-enters review for a published listing, inherited from
`HostDetailsUpdate` — *"everything here is a claim about the home"*. Nearby
entries are claims about the home's surroundings.

---

## 9. Verification

Local stack as usual — Cosmos emulator, Azurite, SWA on **:4280** (not :3000) —
plus the three new containers via `local-bootstrap.mjs`.

**There is no ORS emulator**, so local development hits the real API and
consumes real quota. The candidate cache absorbs repeat testing. A **fixture
switch** is required so the failure paths — 429, timeout, malformed response —
are testable at all; the live service cannot be asked to fail on demand.

End-to-end checks:

1. Transport on EBR-P-0201 → candidates with figures, pins on the map.
2. Click a candidate → **verify the drawn line is not straight**, the only real
   proof it routed rather than interpolated.
3. Seventh entry in a group → blocked, reason visible.
4. Custom type, Spanish only → saves, attention flag appears; add English →
   flag clears.
5. **Tampered payload** with absurd metres → server overwrites with its own
   measurement.
6. Public page: click draws a line; second click served from cache with **no
   ORS call**.
7. Car toggle → figures change, line redraws.
8. Move the pin, save → route docs gone, figures re-measured, out-of-range
   entries flagged `needsCheck`.
9. `GET /api/properties/{id}/nearby/{bogus}/route` → 404, no ORS call.
10. Public projection contains no `osmId`, `measuredAt` or `needsCheck`.
11. Owner endpoints with no principal or the wrong owner → 404/403.
12. Coordinates outside the Zaragoza box → 400.
13. Both locales, both themes, narrow width (container query stacks),
    `npm run build` green, `tsc` clean, lint at the 5 pre-existing errors.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| **Cross-instance rate limiting is awkward on Consumption** — in-process throttling is per-instance and therefore useless | The candidate cache structurally caps outbound volume; the Cosmos counter (§8.2) is the backstop. Tracked as task #33. |
| ORS terms can change "effective immediately upon posting" | `OrsClient` is the only class that knows ORS exists. Self-hosting OSRM or ORS is a config-shaped exit. |
| The account is **personal** (one account per person, tied to info@ebrostay.com) | Noted. Becomes an operational concern only if someone else has to run this. |
| Drive time **excludes parking** | Labelled "drive", never the default. Every mapping product has this problem and none solves it; naming it beats shipping it quietly. |
| Local dev burns production quota | Candidate cache plus the fixture switch. |
| CC-BY-SA attaches to stored geometry | Attribution line names it. ShareAlike reaches the geometry, not the codebase. |

---

## 11. Deferred

- **Refreshing stale measurements** (task #34). `MeasuredAt` records when
  figures were computed; nothing refreshes them, because Cosmos `_ts` is
  document-level and embedded fields cannot carry a TTL. Preferred approach:
  lazy refresh on save. SWA managed functions are HTTP-only, so a timer trigger
  is not available; a guaranteed sweep would need an admin endpoint driven by a
  GitHub Actions cron.
- **City-wide POI set.** Revisit once there is a real basis for deciding which
  entries are shared city facts.
- **Cycling and transit profiles.** The `Reach` map admits them without a
  migration.
- **Admin review surface** for nearby entries — alongside the Catastro check
  and photo location check already planned for §4.5.
- **`properties` indexing policy** sweep for `/photos/*` and `/availability/*`.

---

## 12. Relationship to the decision log

**`ADR-028` in `docs/spec-v2/05-decision-log.md` is the primary record.** It
holds the decisions and their rationale in the project's own format, and is
what should be read before touching this feature.

This document is the working design that elaborates it: the shapes, the
container definitions, the ASCII layouts, the failure table and the
verification list — build-level detail an ADR should not carry. Where the two
ever disagree, the ADR wins and this document is wrong.

Still to be written during implementation: `docs/spec-v2/02-data-model.md`
gains the entry and route shapes, and `04-functional-flows.md` gains the
lookup and route flows.

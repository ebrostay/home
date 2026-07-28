# "What's nearby" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `PLACEHOLDER_NEARBY` stand-in with real per-listing nearby places that an owner curates from map-assisted suggestions, where every distance is measured by OpenRouteService rather than typed, and a guest can draw the actual walking or driving route.

**Architecture:** Three Azure Functions — two owner-authenticated (candidate lookup, route preview) and one anonymous (`GET /api/properties/{id}/nearby/{entryId}/route`) that takes **ids, never coordinates**, and lazily caches route geometry write-through into its own Cosmos container. Entries embed on the property document; geometry does not, because the anonymous write path would otherwise read-modify-write the hot document. `OrsClient` is the only class that knows ORS exists.

**Tech Stack:** .NET 9 isolated Functions, Cosmos DB (NoSQL, serverless), Next.js App Router with `output: "export"`, next-intl v4, Tailwind v4, Leaflet, Vitest (new).

## Global Constraints

- **Primary record is `ADR-028`** in `docs/spec-v2/05-decision-log.md`. Where it and `docs/superpowers/specs/2026-07-28-whats-nearby-design.md` disagree, the ADR wins.
- **Bilingual ES/EN is a hard requirement.** Every user-facing string goes in `app/messages/es.json` **and** `en.json`. Spanish is default.
- **Light and dark mode both first-class.** Theme is `data-theme` on `<html>`; use the Tailwind `dark:` variant. Never `@media (prefers-color-scheme)`.
- **Static export.** No middleware, no route handlers, no server components at runtime. Dynamic data is fetched client-side from `/api/*`.
- **Authorization is enforced in the C# functions** (read `x-ms-client-principal`), never only via SWA route rules or UI gates.
- **Secrets never in the client or repo.** `ORS_API_KEY` lives in Functions app settings and `api/local.settings.json` (gitignored).
- **Import `Link`/`useRouter` from `@/i18n/navigation`**, never from `next/link` / `next/navigation`.
- **The owner never types a distance or duration** (ADR-028 Decision 1).
- **Derived figures are never accepted from the client** (ADR-028 Decision 8).
- **Attribution, verbatim and untranslated, wherever ORS results are shown:** `© openrouteservice by HeiGIT | Data from OpenStreetMap`
- **At most ONE retry on a 429.** Repeatedly exceeding ORS quota can disable the account without notice.
- Browse the local stack at **`:4280`** (SWA emulator), never `:3000` — only `:4280` injects `x-ms-client-principal`.
- `COSMOS_CONNECTION_MODE=Gateway` is required against the local emulator.
- Build must stay green: `cd app && npm run build`, `npx tsc --noEmit`, `npx eslint` at its **5 pre-existing errors** (spread across `app/not-found.tsx`, `app/components/site/ThemeToggle.tsx`, `app/app/[locale]/page.tsx` and `app/app/[locale]/property/page.tsx` — verify the count, not the file list). Any 6th is yours.

---

## File Structure

**Created — API**

| File | Responsibility |
|---|---|
| `api/Models/NearbyModels.cs` | `NearbyReach`, `NearbyEntry`, `NearbyRouteDoc`, `NearbyWrite`, `NearbyCandidatesDoc`, `OrsBudgetDoc` |
| `api/Services/NearbyGroups.cs` | Group vocabulary: radius, OSM filters, allowed types, profiles, Zaragoza bbox. Pure config + predicates. |
| `api/Services/OrsBudget.cs` | Cross-instance daily counter, ETag optimistic concurrency, fails closed |
| `api/Services/OrsClient.cs` | The only class that knows ORS exists. `MatrixAsync`, `RouteAsync`, fixture switch, 429 handling |
| `api/Services/OverpassClient.cs` | POI search + the candidate document cache |
| `api/Services/NearbyLookup.cs` | Composes Overpass + matrix, ranks, returns candidates |
| `api/Services/RouteCache.cs` | Lazy write-through. The **only** place origin/destination are chosen. |
| `api/Functions/NearbyFunctions.cs` | The three endpoints |

**Created — App**

| File | Responsibility |
|---|---|
| `app/lib/nearby.ts` | Group/type vocabulary mirror, `decodePolyline`, `reachFor`. Pure — no fetching. |
| `app/lib/nearby.test.ts` | Vitest for the above |
| `app/lib/listing.test.ts` | Vitest for the section diff, including `nearby` |
| `app/components/host/fields/NearbyMap.tsx` | Leaflet: home pin, candidate pins, route line, drop-a-point mode |
| `app/components/host/fields/NearbyEditor.tsx` | Group chips, chosen list, finder, manual add, type select |
| `app/components/detail/NeighbourhoodMap.tsx` | Public map: home pin, destination marker, route line |
| `app/vitest.config.ts` | Test config |

**Modified**

| File | Change |
|---|---|
| `api/Models/PropertyDoc.cs` | `NearbyEntry[] Nearby` |
| `api/Models/PublicModels.cs` | `PublicNearby`, `PropertyDetail.Nearby`, `ToDetail` |
| `api/Models/HostModels.cs` | `HostListing.Nearby` |
| `api/Models/HostWrites.cs` | `DetailsUpdate.Nearby` |
| `api/Functions/HostFunctions.cs` | Save merge + validation |
| `api/Program.cs` | DI, `IHttpClientFactory`, three containers |
| `app/lib/api.ts` | `PublicNearby`, `HostNearbyEntry`, candidate/route fetchers |
| `app/lib/listing.ts` | `SECTIONS` + `FIELDS` gain `nearby` |
| `app/app/[locale]/host/edit/page.tsx` | New `SectionCard` after Address |
| `app/components/detail/Nearby.tsx` | Rewritten for real data + profile toggle |
| `app/app/[locale]/property/page.tsx` | Merge sections 7 and 9 |
| `app/messages/{es,en}.json` | All new strings + shared `nearby.type.*` |
| `app/package.json` | Vitest |
| `infra/local-bootstrap.mjs`, `infra/main.bicep` | Three containers |
| `docs/spec-v2/02-data-model.md`, `04-functional-flows.md` | Shapes and flows |

**Deleted:** `app/lib/detail-placeholders.ts`

---

## Task 1: Vitest, and the pure nearby core

**Files:**
- Create: `app/vitest.config.ts`, `app/lib/nearby.ts`, `app/lib/nearby.test.ts`
- Modify: `app/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `NEARBY_GROUPS: readonly NearbyGroup[]` where `NearbyGroup = "transport" | "groceries" | "food" | "outdoors" | "health"`
  - `NEARBY_PROFILES: readonly NearbyProfile[]` where `NearbyProfile = "foot" | "car"`
  - `decodePolyline(encoded: string, precision?: number): [number, number][]`
  - `reachFor(entry: { reach: Partial<Record<NearbyProfile, {metres: number; minutes: number}>> }, profile: NearbyProfile): {metres: number; minutes: number} | null`

> **The TYPE list is deliberately NOT here.** It is served by
> `GET /api/nearby/vocabulary` (Task 6) so there is one definition, in
> `NearbyGroups.cs`. Groups and profiles stay compile-time constants because
> they are structural, not configuration: groups key the icon map in
> `Nearby.tsx`, which is a `Record<NearbyGroup, LucideIcon>` and cannot be
> built from a runtime fetch, and profiles key the toggle.

- [ ] **Step 1: Install Vitest**

```bash
cd app && npm install -D vitest
```

- [ ] **Step 2: Add the config and script**

Create `app/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests cover the PURE logic only — vocabulary invariants, polyline
// decoding, the section diff. Anything touching Leaflet, the DOM or the API is
// verified in the browser against :4280, which is how this project has always
// checked its work.
export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

Add to `app/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: Write the failing tests**

Create `app/lib/nearby.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { NEARBY_GROUPS, NEARBY_PROFILES, decodePolyline, reachFor } from "./nearby";

// The TYPE list lives on the server and arrives over the wire, so it cannot be
// asserted here. What CAN be asserted is that the two catalogues agree with
// each other — if they drift, one locale renders a type the other cannot, and
// that is the failure this split introduced.
describe("type labels", () => {
  const keys = (m: { nearby: { type: Record<string, string> } }) =>
    Object.keys(m.nearby.type).sort();

  it("defines the same type keys in both locales", () => {
    expect(keys(es as never)).toEqual(keys(en as never));
  });

  it("leaves no label empty", () => {
    for (const m of [es, en] as never[])
      for (const [k, v] of Object.entries(
        (m as { nearby: { type: Record<string, string> } }).nearby.type,
      ))
        expect(v.trim(), `empty label for ${k}`).not.toBe("");
  });
});

describe("groups", () => {
  it("stays at the five the icon map is built for", () => {
    expect([...NEARBY_GROUPS]).toEqual([
      "transport", "groceries", "food", "outdoors", "health",
    ]);
  });
});

describe("decodePolyline", () => {
  // The canonical Google encoded-polyline example.
  it("decodes the reference vector", () => {
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points).toHaveLength(3);
    expect(points[0][0]).toBeCloseTo(38.5, 5);
    expect(points[0][1]).toBeCloseTo(-120.2, 5);
    expect(points[2][0]).toBeCloseTo(43.252, 5);
    expect(points[2][1]).toBeCloseTo(-126.453, 5);
  });

  it("returns nothing for an empty string rather than throwing", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("reachFor", () => {
  const entry = { reach: { foot: { metres: 340, minutes: 4 } } };

  it("returns the requested profile", () => {
    expect(reachFor(entry, "foot")).toEqual({ metres: 340, minutes: 4 });
  });

  // A listing saved before a profile existed simply has no figures for it. The
  // caller must be able to hide the entry rather than render "undefined min".
  it("returns null for a profile the entry has no figures for", () => {
    expect(reachFor(entry, "car")).toBeNull();
  });

  it("resolves every declared profile independently", () => {
    const both = { reach: { foot: { metres: 340, minutes: 4 }, car: { metres: 900, minutes: 3 } } };
    for (const p of NEARBY_PROFILES) expect(reachFor(both, p)).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run and watch it fail**

Run: `cd app && npm test`
Expected: FAIL — `Failed to resolve import "./nearby"`.

- [ ] **Step 5: Implement `app/lib/nearby.ts`**

```ts
// The structural half of the nearby vocabulary, plus the pure helpers.
//
// GROUPS and PROFILES are compile-time constants because they are structure,
// not configuration: groups key the icon map in Nearby.tsx, which is a
// Record<NearbyGroup, LucideIcon> and cannot be built from a runtime fetch.
//
// TYPES are NOT here. They are served by GET /api/nearby/vocabulary so that
// NearbyGroups.cs is their single definition — the server has to validate
// against its own copy regardless, and a second hand-maintained list would
// drift. The cost is that a type can arrive with no translation, so the editor
// hides any type it has no label for rather than throwing MISSING_MESSAGE.

export const NEARBY_GROUPS = [
  "transport",
  "groceries",
  "food",
  "outdoors",
  "health",
] as const;
export type NearbyGroup = (typeof NEARBY_GROUPS)[number];

export const NEARBY_PROFILES = ["foot", "car"] as const;
export type NearbyProfile = (typeof NEARBY_PROFILES)[number];

export type Reach = { metres: number; minutes: number };

export function reachFor(
  entry: { reach: Partial<Record<NearbyProfile, Reach>> },
  profile: NearbyProfile,
): Reach | null {
  return entry.reach[profile] ?? null;
}

/** Google encoded polyline, precision 5 — what ORS returns for
 *  `geometries=polyline`. An order of magnitude smaller than GeoJSON, which
 *  matters because these are stored per entry per profile. */
export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / factor, lng / factor]);
  }
  return points;
}
```

- [ ] **Step 6: Run tests**

Run: `cd app && npm test`
Expected: PASS. The label tests will only pass once Task 11 adds the
`nearby.type.*` block to both catalogues — until then they fail on a missing
key, which is correct and expected. Add a minimal `"nearby": { "type": {} }`
to both files in this task so the suite is green, and Task 11 fills it.

- [ ] **Step 7: Commit**

```bash
git add app/package.json app/package-lock.json app/vitest.config.ts app/lib/nearby.ts app/lib/nearby.test.ts
git commit -m "test(app): add Vitest and the pure nearby vocabulary core"
```

---

## Task 2: Cosmos containers and the document models

**Files:**
- Create: `api/Models/NearbyModels.cs`
- Modify: `api/Models/PropertyDoc.cs`, `infra/local-bootstrap.mjs`, `infra/main.bicep`

**Interfaces:**
- Consumes: Task 1's group names (must match exactly).
- Produces: `NearbyReach`, `NearbyEntry`, `NearbyRouteDoc`, `NearbyCandidatesDoc`, `OrsBudgetDoc`, `PropertyDoc.Nearby`.

- [ ] **Step 1: Create `api/Models/NearbyModels.cs`**

```csharp
namespace Ebrostay.Api.Models;

/// How far a place is, by one means of travel. Metres and whole minutes,
/// measured — never supplied by a client (ADR-028 Decision 8).
public record NearbyReach(int Metres, int Minutes);

/// One place a listing chooses to mention. Embedded on the property because it
/// is read with the property ~100% of the time and changes only on owner save.
/// Bounded by validation at 6 per group and 24 in total.
public record NearbyEntry(
    string Id,
    string Group,
    string? Type,
    Bilingual? CustomType,
    string Name,
    double Lat,
    double Lng,
    Dictionary<string, NearbyReach> Reach,
    string? OsmId,
    string? MeasuredAt,
    bool NeedsCheck);

/// Route geometry, in its OWN container rather than embedded: it is written by
/// an anonymous lazy path while the property document is written by the owner's
/// save, so embedding would let a guest's click clobber a save.
public record NearbyRouteDoc(
    string Id,            // "{entryId}-{profile}"
    string PropertyId,    // partition key
    string Profile,
    string Polyline,      // encoded polyline5, overview=simplified
    int Metres,
    int Seconds,          // provenance only — the entry's Reach is displayed
    string FetchedAt);

/// Cached Overpass answer for one rounded cell + group. POIs do not move, so
/// this is cacheable; the ORS matrix is NOT cached, because it must run against
/// the true pin or the distances stop being honest.
public record NearbyCandidatesDoc(
    string Id,            // == Cell
    string Cell,          // partition key: "41.648|-0.889|transport"
    NearbyPoi[] Pois,
    string FetchedAt);

public record NearbyPoi(string OsmId, string Name, string Type, double Lat, double Lng);

/// One document per day. The cross-instance limiter: SWA managed functions run
/// on Consumption and scale out, so an in-process counter is per-instance and
/// therefore no limit at all.
public record OrsBudgetDoc(string Id, int Calls, int Ttl);
```

- [ ] **Step 2: Add the array to `PropertyDoc`**

In `api/Models/PropertyDoc.cs`, beside `Photos`:

```csharp
    public NearbyEntry[] Nearby { get; set; } = [];
```

- [ ] **Step 3: Add the containers to the local bootstrap**

In `infra/local-bootstrap.mjs`, extend `CONTAINERS`:

```js
  { id: "nearbyRoutes", partitionKey: "/propertyId" },
  { id: "nearbyCandidates", partitionKey: "/cell" },
  { id: "serviceBudget", partitionKey: "/id" },
```

- [ ] **Step 4: Add the same three to `infra/main.bicep`**

Follow the existing container resource pattern in that file. Set on each:
- `nearbyRoutes`: `defaultTtl: 15552000` (180 days), indexing policy
  `{ indexingMode: 'consistent', includedPaths: [{ path: '/propertyId/?' }], excludedPaths: [{ path: '/*' }] }`
- `nearbyCandidates`: `defaultTtl: 2592000` (30 days)
- `serviceBudget`: `defaultTtl: 172800` (2 days)

Also add `{ path: '/nearby/*' }` to the **existing `properties` container's**
`excludedPaths`. We never query on the array, so every save would otherwise pay
to index it. Leave `/photos/*` and `/availability/*` alone — they are almost
certainly in the same position, but that is pre-existing and out of scope here.

- [ ] **Step 5: Build and bootstrap**

```bash
~/.dotnet/dotnet build api && node infra/local-bootstrap.mjs
```

Expected: build succeeds; bootstrap prints seven containers.

- [ ] **Step 6: Commit**

```bash
git add api/Models infra/local-bootstrap.mjs infra/main.bicep
git commit -m "feat(api): nearby entry, route and cache document models"
```

---

## Task 3: `NearbyGroups` — vocabulary, radius, bbox

**Files:**
- Create: `api/Services/NearbyGroups.cs`

**Interfaces:**
- Produces:
  - `NearbyGroups.All: IReadOnlyList<string>`
  - `NearbyGroups.Profiles: IReadOnlyList<string>`
  - `NearbyGroups.RadiusMetres(string group): int`
  - `NearbyGroups.OverpassTags(string group): (string Key, string Value)[]`
  - `NearbyGroups.Vocabulary: IReadOnlyDictionary<string, string[]>`
  - `NearbyGroups.Cell(double lat, double lng, string group): string`
  - `NearbyGroups.TypeOf(string osmTagKey, string osmTagValue): string?`
  - `NearbyGroups.IsKnownType(string group, string type): bool`
  - `NearbyGroups.InZaragoza(double lat, double lng): bool`
  - `NearbyGroups.OrsProfile(string profile): string`

- [ ] **Step 1: Create the file**

```csharp
using System.Globalization;

namespace Ebrostay.Api.Services;

/// The closed vocabulary, and the ONLY place a group's search radius lives.
///
/// Radius is per group because "nearby" is not one distance: a bus stop is
/// nearby at 800 m and a hospital at 10 km, and a single radius is wrong at
/// both ends (ADR-028 Decision 6).
///
/// `app/lib/nearby.ts` mirrors the group and type names for the editor's select.
/// THIS copy is authoritative — a client cannot be trusted to constrain itself.
public static class NearbyGroups
{
    public static readonly IReadOnlyList<string> All =
        ["transport", "groceries", "food", "outdoors", "health"];

    public static readonly IReadOnlyList<string> Profiles = ["foot", "car"];

    public static string OrsProfile(string profile) => profile switch
    {
        "foot" => "foot-walking",
        "car" => "driving-car",
        _ => throw new ArgumentOutOfRangeException(nameof(profile)),
    };

    public static int RadiusMetres(string group) => group switch
    {
        "transport" => 800,
        "groceries" => 1000,
        "food" => 1000,
        "outdoors" => 2000,
        "health" => 10000,
        _ => throw new ArgumentOutOfRangeException(nameof(group)),
    };

    /// The OSM tag pairs each group searches for. Returned as PAIRS rather than
    /// as an assembled query string: the caller has to interleave an
    /// `(around:…)` clause after every selector, and doing that by string
    /// surgery on an assembled query is the kind of thing that works until
    /// someone adds a selector containing the separator.
    public static (string Key, string Value)[] OverpassTags(string group) => group switch
    {
        "transport" =>
        [
            ("railway", "tram_stop"), ("highway", "bus_stop"),
            ("railway", "station"), ("amenity", "bicycle_rental"),
            ("amenity", "taxi"),
        ],
        "groceries" =>
        [
            ("shop", "supermarket"), ("amenity", "marketplace"),
            ("shop", "bakery"), ("shop", "convenience"), ("shop", "mall"),
        ],
        "food" =>
        [
            ("amenity", "restaurant"), ("amenity", "cafe"),
            ("amenity", "bar"), ("amenity", "pub"),
        ],
        "outdoors" =>
        [
            ("leisure", "park"), ("leisure", "sports_centre"),
            ("leisure", "swimming_pool"), ("leisure", "playground"),
        ],
        "health" =>
        [
            ("amenity", "pharmacy"), ("amenity", "clinic"),
            ("amenity", "hospital"), ("amenity", "dentist"),
            ("amenity", "veterinary"),
        ],
        _ => throw new ArgumentOutOfRangeException(nameof(group)),
    };

    /// OSM tag → our vocabulary key. Returns null for anything unmapped, which
    /// the lookup drops rather than guessing at.
    public static string? TypeOf(string key, string value) => (key, value) switch
    {
        ("railway", "tram_stop") => "tram",
        ("highway", "bus_stop") => "bus",
        ("railway", "station") => "rail",
        ("amenity", "bicycle_rental") => "bikeshare",
        ("amenity", "taxi") => "taxi",
        ("shop", "supermarket") => "supermarket",
        ("amenity", "marketplace") => "market",
        ("shop", "bakery") => "bakery",
        ("shop", "convenience") => "convenience",
        ("shop", "mall") => "mall",
        ("amenity", "restaurant") => "restaurant",
        ("amenity", "cafe") => "cafe",
        ("amenity", "bar") => "bar",
        ("amenity", "pub") => "bar",
        ("leisure", "park") => "park",
        ("leisure", "sports_centre") => "sports",
        ("leisure", "swimming_pool") => "pool",
        ("leisure", "playground") => "playground",
        ("amenity", "pharmacy") => "pharmacy",
        ("amenity", "clinic") => "clinic",
        ("amenity", "hospital") => "hospital",
        ("amenity", "dentist") => "dentist",
        ("amenity", "veterinary") => "vet",
        _ => null,
    };

    /// `tapas`, `river` and `metro` are owner-selectable only: no OSM tag
    /// maps to them, so they can never arrive from a lookup. That is
    /// deliberate — without saying so, a reader cannot tell a curated type
    /// from a mapping somebody forgot to write.
    private static readonly Dictionary<string, string[]> TypesByGroup = new()
    {
        ["transport"] = ["tram", "bus", "rail", "metro", "bikeshare", "taxi"],
        ["groceries"] = ["supermarket", "market", "bakery", "convenience", "mall"],
        ["food"] = ["restaurant", "tapas", "cafe", "bar"],
        ["outdoors"] = ["park", "river", "sports", "pool", "playground"],
        ["health"] = ["pharmacy", "clinic", "hospital", "dentist", "vet"],
    };

    public static bool IsKnownType(string group, string type) =>
        TypesByGroup.TryGetValue(group, out var types) && types.Contains(type);

    /// The vocabulary served to the editor. THIS is the single definition of
    /// the type list — the client has none of its own, so drift is impossible
    /// by construction rather than by discipline.
    public static IReadOnlyDictionary<string, string[]> Vocabulary => TypesByGroup;

    /// Invariants that used to be guarded by client-side tests. With the list
    /// server-only and no C# test project, a startup check is what is left —
    /// it fails the deployment rather than shipping a group with no types or a
    /// type that answers to two groups.
    static NearbyGroups()
    {
        var seen = new HashSet<string>();
        foreach (var group in All)
        {
            if (!TypesByGroup.TryGetValue(group, out var types) || types.Length == 0)
                throw new InvalidOperationException($"nearby group '{group}' has no types");
            foreach (var t in types)
                if (!seen.Add(t))
                    throw new InvalidOperationException($"nearby type '{t}' is in two groups");
        }
    }

    /// Every listing is in Zaragoza. This bound is what stops the owner
    /// endpoint being a general-purpose router at our expense.
    public static bool InZaragoza(double lat, double lng) =>
        lat is >= 41.50 and <= 41.80 && lng is >= -1.10 and <= -0.65;

    /// Cache cell for the Overpass answer — 3 decimal places, about 110 m.
    ///
    /// InvariantCulture is load-bearing, not decoration: this string is a
    /// Cosmos partition key, and a host running under a comma-decimal locale
    /// would write "41,650|..." into a different partition and silently
    /// fragment the cache. Same reason PlatformSettings and HostWrites pass it.
    public static string Cell(double lat, double lng, string group) =>
        string.Create(CultureInfo.InvariantCulture, $"{lat:F3}|{lng:F3}|{group}");
}
```

- [ ] **Step 2: Build**

Run: `~/.dotnet/dotnet build api`
Expected: succeeds with no warnings.

- [ ] **Step 3: Commit**

```bash
git add api/Services/NearbyGroups.cs
git commit -m "feat(api): nearby group vocabulary with per-group radius"
```

---

## Task 4: `OrsBudget` and `OrsClient`

**Files:**
- Create: `api/Services/OrsBudget.cs`, `api/Services/OrsClient.cs`
- Modify: `api/Program.cs`

**Interfaces:**
- Consumes: `NearbyGroups.OrsProfile`, `OrsBudgetDoc`.
- Produces:
  - `OrsBudget.TryConsumeAsync(int calls, CancellationToken): Task<bool>`
  - `OrsClient.MatrixAsync(GeoPoint origin, IReadOnlyList<GeoPoint> destinations, string profile, CancellationToken): Task<NearbyReach[]>`
  - `OrsClient.RouteAsync(GeoPoint from, GeoPoint to, string profile, CancellationToken): Task<OrsRoute>`
  - `record GeoPoint(double Lat, double Lng)`
  - `record OrsRoute(string Polyline, int Metres, int Seconds)`
  - `class OrsUnavailableException : Exception`

- [ ] **Step 1: Create `api/Services/OrsBudget.cs`**

```csharp
using Microsoft.Azure.Cosmos;
using Ebrostay.Api.Models;

namespace Ebrostay.Api.Services;

/// A daily ceiling on outbound ORS calls, held in Cosmos because SWA managed
/// functions scale out and share no memory — an in-process counter would be one
/// counter per instance, which is no ceiling at all. Durable Functions entities
/// are unavailable on managed functions, so this is the only option that works
/// without changing hosting model.
///
/// FAILS CLOSED. If the count cannot be confirmed we do not call. That is
/// academic in practice: if Cosmos is unreachable the property read already
/// failed.
public sealed class OrsBudget(Container container)
{
    /// Well below ORS's ~2,500/day, so we trip our own wire first.
    private const int DailyCeiling = 1500;
    private const int MaxAttempts = 5;

    public async Task<bool> TryConsumeAsync(int calls, CancellationToken ct)
    {
        // InvariantCulture for the same reason NearbyGroups.Cell needs it: this
        // is a Cosmos id AND partition key. A host whose culture defaults to a
        // non-Gregorian calendar would render a different year entirely.
        var id = FormattableString.Invariant(
            $"ors-{DateTimeOffset.UtcNow:yyyy-MM-dd}");
        var key = new PartitionKey(id);

        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            try
            {
                var read = await container.ReadItemAsync<OrsBudgetDoc>(id, key,
                    cancellationToken: ct);

                if (read.Resource.Calls + calls > DailyCeiling) return false;

                await container.ReplaceItemAsync(
                    read.Resource with { Calls = read.Resource.Calls + calls },
                    id, key,
                    new ItemRequestOptions { IfMatchEtag = read.ETag },
                    ct);
                return true;
            }
            catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                try
                {
                    // 172800s = 2 days, so yesterday's counters clean themselves up.
                    await container.CreateItemAsync(
                        new OrsBudgetDoc(id, calls, 172800), key, cancellationToken: ct);
                    return true;
                }
                catch (CosmosException c) when (c.StatusCode == System.Net.HttpStatusCode.Conflict)
                {
                    // Another instance created it between our read and our write.
                }
            }
            catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.PreconditionFailed)
            {
                // Another instance incremented it. Re-read and try again.
            }
        }
        return false;
    }
}
```

- [ ] **Step 2: Create `api/Services/OrsClient.cs`**

```csharp
using System.Net;
using System.Text;
using System.Text.Json;
using Ebrostay.Api.Models;

namespace Ebrostay.Api.Services;

public record GeoPoint(double Lat, double Lng);
public record OrsRoute(string Polyline, int Metres, int Seconds);

public sealed class OrsUnavailableException(string reason) : Exception(reason);

/// The ONLY class that knows OpenRouteService exists.
///
/// Server-side is forced three times over: the key cannot go in the client;
/// ORS requires a real User-Agent, which a browser will not let us set; and a
/// rate promise can only be kept from a place that sees all the traffic.
///
/// The terms may change "effective immediately upon posting", so the seam is
/// deliberate — self-hosting OSRM or ORS speaks the same request shape.
public sealed class OrsClient(
    IHttpClientFactory factory,
    OrsBudget budget,
    ILogger<OrsClient> log)
{
    private const string Base = "https://api.openrouteservice.org";

    /// Set ORS_FIXTURES=1 locally to answer from canned data. Required, not a
    /// nicety: there is no ORS emulator, so without it the failure paths cannot
    /// be exercised at all and every UI iteration burns production quota.
    private static bool Fixtures =>
        Environment.GetEnvironmentVariable("ORS_FIXTURES") == "1";

    public async Task<NearbyReach[]> MatrixAsync(
        GeoPoint origin, IReadOnlyList<GeoPoint> destinations, string profile,
        CancellationToken ct)
    {
        if (destinations.Count == 0) return [];
        if (Fixtures)
            return [.. destinations.Select((_, i) => new NearbyReach(200 + i * 90, 3 + i))];

        if (!await budget.TryConsumeAsync(1, ct))
            throw new OrsUnavailableException("budget");

        var coords = new List<double[]> { [origin.Lng, origin.Lat] };
        coords.AddRange(destinations.Select(d => new[] { d.Lng, d.Lat }));

        var body = JsonSerializer.Serialize(new
        {
            locations = coords,
            sources = new[] { 0 },
            metrics = new[] { "distance", "duration" },
        });

        using var res = await SendAsync(
            $"{Base}/v2/matrix/{NearbyGroups.OrsProfile(profile)}", body, ct);

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        var distances = doc.RootElement.GetProperty("distances")[0];
        var durations = doc.RootElement.GetProperty("durations")[0];

        var reach = new NearbyReach[destinations.Count];
        for (var i = 0; i < destinations.Count; i++)
        {
            // Index 0 is the origin to itself.
            var m = distances[i + 1];
            var s = durations[i + 1];
            if (m.ValueKind == JsonValueKind.Null || s.ValueKind == JsonValueKind.Null)
                throw new OrsUnavailableException("unroutable");
            reach[i] = new NearbyReach(
                (int)Math.Round(m.GetDouble()),
                Math.Max(1, (int)Math.Round(s.GetDouble() / 60.0)));
        }
        return reach;
    }

    public async Task<OrsRoute> RouteAsync(
        GeoPoint from, GeoPoint to, string profile, CancellationToken ct)
    {
        if (Fixtures)
            return new OrsRoute("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 340, 260);

        if (!await budget.TryConsumeAsync(1, ct))
            throw new OrsUnavailableException("budget");

        var body = JsonSerializer.Serialize(new
        {
            coordinates = new[]
            {
                new[] { from.Lng, from.Lat },
                new[] { to.Lng, to.Lat },
            },
            // Encoded polyline rather than GeoJSON: an order of magnitude
            // smaller, and these are stored per entry per profile.
            geometry_simplify = true,
        });

        using var res = await SendAsync(
            $"{Base}/v2/directions/{NearbyGroups.OrsProfile(profile)}", body, ct);

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        var route = doc.RootElement.GetProperty("routes")[0];
        var summary = route.GetProperty("summary");

        return new OrsRoute(
            route.GetProperty("geometry").GetString()
                ?? throw new OrsUnavailableException("no_geometry"),
            (int)Math.Round(summary.GetProperty("distance").GetDouble()),
            (int)Math.Round(summary.GetProperty("duration").GetDouble()));
    }

    /// ONE retry on a 429, honouring Retry-After. Never a loop: repeatedly
    /// exceeding the quota can disable the account without notice, which makes
    /// an aggressive retry the most dangerous thing this feature could contain.
    private async Task<HttpResponseMessage> SendAsync(
        string url, string body, CancellationToken ct)
    {
        var http = factory.CreateClient("ors");

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var res = await http.PostAsync(url,
                new StringContent(body, Encoding.UTF8, "application/json"), ct);

            if (res.IsSuccessStatusCode) return res;

            if (res.StatusCode == HttpStatusCode.TooManyRequests && attempt == 0)
            {
                var wait = res.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(2);
                res.Dispose();
                await Task.Delay(wait > TimeSpan.FromSeconds(10)
                    ? TimeSpan.FromSeconds(10) : wait, ct);
                continue;
            }

            log.LogWarning("ORS {Status} for {Url}", res.StatusCode, url);
            res.Dispose();
            throw new OrsUnavailableException($"ors_{(int)res.StatusCode}");
        }
        throw new OrsUnavailableException("ors_429");
    }
}
```

- [ ] **Step 3: Register in `api/Program.cs`**

Add alongside the existing Cosmos registrations:

```csharp
services.AddHttpClient("ors", c =>
{
    c.Timeout = TimeSpan.FromSeconds(5);
    // Required by ORS. A browser will not let us set this, which is one of the
    // three reasons this call cannot be client-direct.
    c.DefaultRequestHeaders.UserAgent.ParseAdd("ebrostay/2.0 (info@ebrostay.com)");
    c.DefaultRequestHeaders.Add("Authorization",
        Environment.GetEnvironmentVariable("ORS_API_KEY") ?? "");
});

services.AddHttpClient("overpass", c =>
{
    // Overpass is genuinely slow; 5s would time out on legitimate answers.
    c.Timeout = TimeSpan.FromSeconds(10);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("ebrostay/2.0 (info@ebrostay.com)");
});

services.AddSingleton(sp => new OrsBudget(
    sp.GetRequiredService<Database>().GetContainer("serviceBudget")));
services.AddSingleton<OrsClient>();
```

Adapt `GetRequiredService<Database>()` to however `Program.cs` currently exposes the database — read it first and follow the existing pattern.

- [ ] **Step 4: Build**

Run: `~/.dotnet/dotnet build api`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add api/Services/OrsBudget.cs api/Services/OrsClient.cs api/Program.cs
git commit -m "feat(api): ORS client behind a budget that works across instances"
```

---

## Task 5: `OverpassClient` and `NearbyLookup`

**Files:**
- Create: `api/Services/OverpassClient.cs`, `api/Services/NearbyLookup.cs`
- Modify: `api/Program.cs`

**Interfaces:**
- Consumes: `NearbyGroups`, `OrsClient.MatrixAsync`, `NearbyCandidatesDoc`, `NearbyPoi`, `GeoPoint`, `NearbyReach`.
- Produces:
  - `OverpassClient.FindAsync(double lat, double lng, string group, CancellationToken): Task<NearbyPoi[]>`
  - `NearbyLookup.CandidatesAsync(double lat, double lng, string group, CancellationToken): Task<NearbyCandidate[]>`
  - `record NearbyCandidate(string OsmId, string Name, string Type, double Lat, double Lng, Dictionary<string, NearbyReach> Reach)`

- [ ] **Step 1: Create `api/Services/OverpassClient.cs`**

```csharp
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Azure.Cosmos;
using Ebrostay.Api.Models;

namespace Ebrostay.Api.Services;

/// POI search, with the answer cached per rounded cell.
///
/// ONLY the Overpass half is cached. The ORS matrix always runs against the
/// true pin, because rounding the origin to a ~110 m cell would put up to ~78 m
/// of error into a distance we present as precise.
public sealed class OverpassClient(
    IHttpClientFactory factory,
    Container cache,
    ILogger<OverpassClient> log)
{
    private const string Endpoint = "https://overpass-api.de/api/interpreter";
    private const int MaxPois = 20;

    public async Task<NearbyPoi[]> FindAsync(
        double lat, double lng, string group, CancellationToken ct)
    {
        var cell = NearbyGroups.Cell(lat, lng, group);

        try
        {
            var hit = await cache.ReadItemAsync<NearbyCandidatesDoc>(
                cell, new PartitionKey(cell), cancellationToken: ct);
            return hit.Resource.Pois;
        }
        catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            // Cold cell — fall through and ask.
        }

        var pois = await QueryAsync(lat, lng, group, ct);

        try
        {
            await cache.UpsertItemAsync(
                new NearbyCandidatesDoc(cell, cell, pois,
                    DateTimeOffset.UtcNow.ToString("o")),
                new PartitionKey(cell), cancellationToken: ct);
        }
        catch (CosmosException e)
        {
            // A failed cache write must never fail the request — it only means
            // the next lookup asks again.
            log.LogWarning(e, "nearby candidate cache write failed for {Cell}", cell);
        }

        return pois;
    }

    private async Task<NearbyPoi[]> QueryAsync(
        double lat, double lng, string group, CancellationToken ct)
    {
        var radius = NearbyGroups.RadiusMetres(group);
        var inv = System.Globalization.CultureInfo.InvariantCulture;
        var around = $"(around:{radius},{lat.ToString(inv)},{lng.ToString(inv)})";

        var selectors = string.Concat(NearbyGroups.OverpassTags(group)
            .Select(t => $"node[\"{t.Key}\"=\"{t.Value}\"]{around};"));

        var ql = $"[out:json][timeout:20];({selectors});out body {MaxPois * 3};";

        var http = factory.CreateClient("overpass");
        using var res = await http.PostAsync(Endpoint,
            new StringContent(ql, Encoding.UTF8, "text/plain"), ct);

        if (!res.IsSuccessStatusCode)
            throw new OrsUnavailableException($"overpass_{(int)res.StatusCode}");

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));

        var found = new List<NearbyPoi>();
        foreach (var el in doc.RootElement.GetProperty("elements").EnumerateArray())
        {
            if (!el.TryGetProperty("tags", out var tags)) continue;
            if (!tags.TryGetProperty("name", out var nameEl)) continue;

            var name = nameEl.GetString();
            if (string.IsNullOrWhiteSpace(name)) continue;

            string? type = null;
            foreach (var tag in tags.EnumerateObject())
            {
                type = NearbyGroups.TypeOf(tag.Name, tag.Value.GetString() ?? "");
                if (type is not null) break;
            }
            // Unmapped tags are dropped rather than guessed at.
            if (type is null) continue;

            found.Add(new NearbyPoi(
                $"node/{el.GetProperty("id").GetInt64()}",
                name.Length > 80 ? name[..80] : name,
                type,
                el.GetProperty("lat").GetDouble(),
                el.GetProperty("lon").GetDouble()));
        }

        return [.. found
            .DistinctBy(p => p.OsmId)
            .OrderBy(p => Haversine(lat, lng, p.Lat, p.Lng))
            .Take(MaxPois)];
    }

    /// Straight-line, used ONLY to pick which candidates are worth routing.
    /// Never displayed — displayed figures always come from the routing engine.
    internal static double Haversine(double aLat, double aLng, double bLat, double bLng)
    {
        const double R = 6371000;
        var dLat = (bLat - aLat) * Math.PI / 180;
        var dLng = (bLng - aLng) * Math.PI / 180;
        var h = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
            + Math.Cos(aLat * Math.PI / 180) * Math.Cos(bLat * Math.PI / 180)
            * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return 2 * R * Math.Asin(Math.Sqrt(h));
    }
}
```

- [ ] **Step 2: Create `api/Services/NearbyLookup.cs`**

```csharp
using Ebrostay.Api.Models;

namespace Ebrostay.Api.Services;

public record NearbyCandidate(
    string OsmId, string Name, string Type, double Lat, double Lng,
    Dictionary<string, NearbyReach> Reach);

/// Composes the POI search with the walking/driving figures.
///
/// One matrix request per profile covers every candidate at once, which is why
/// a category open costs two requests rather than one per candidate.
public sealed class NearbyLookup(OverpassClient overpass, OrsClient ors)
{
    public async Task<NearbyCandidate[]> CandidatesAsync(
        double lat, double lng, string group, CancellationToken ct)
    {
        var pois = await overpass.FindAsync(lat, lng, group, ct);
        if (pois.Length == 0) return [];

        var origin = new GeoPoint(lat, lng);
        var points = pois.Select(p => new GeoPoint(p.Lat, p.Lng)).ToArray();

        var byProfile = new Dictionary<string, NearbyReach[]>();
        foreach (var profile in NearbyGroups.Profiles)
            byProfile[profile] = await ors.MatrixAsync(origin, points, profile, ct);

        var candidates = pois.Select((p, i) => new NearbyCandidate(
            p.OsmId, p.Name, p.Type, p.Lat, p.Lng,
            NearbyGroups.Profiles.ToDictionary(x => x, x => byProfile[x][i])));

        // Ranked by walking time: the owner is choosing what is genuinely
        // nearby, and walking is the honest proxy for that whatever a guest
        // later toggles to.
        return [.. candidates.OrderBy(c => c.Reach["foot"].Minutes)];
    }
}
```

- [ ] **Step 3: Register both in `Program.cs`**

```csharp
services.AddSingleton(sp => new OverpassClient(
    sp.GetRequiredService<IHttpClientFactory>(),
    sp.GetRequiredService<Database>().GetContainer("nearbyCandidates"),
    sp.GetRequiredService<ILogger<OverpassClient>>()));
services.AddSingleton<NearbyLookup>();
```

- [ ] **Step 4: Build**

Run: `~/.dotnet/dotnet build api`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add api/Services/OverpassClient.cs api/Services/NearbyLookup.cs api/Program.cs
git commit -m "feat(api): Overpass POI search with a per-cell cache, and candidate ranking"
```

---

## Task 6: `RouteCache` and the three endpoints

**Files:**
- Create: `api/Services/RouteCache.cs`, `api/Functions/NearbyFunctions.cs`
- Modify: `api/Program.cs`

**Interfaces:**
- Consumes: `NearbyLookup.CandidatesAsync`, `OrsClient.RouteAsync`, `NearbyRouteDoc`, `NearbyGroups.InZaragoza`, the existing `ProfileService`/`ClientPrincipal` auth helpers.
- Produces:
  - `RouteCache.GetAsync(PropertyDoc property, string entryId, string profile, CancellationToken): Task<NearbyRouteDoc?>`
  - `RouteCache.DropAsync(string propertyId, CancellationToken): Task`
  - Endpoints: `GET /api/host/nearby/candidates`, `GET /api/host/nearby/preview-route`, `GET /api/properties/{id}/nearby/{entryId}/route`

- [ ] **Step 1: Create `api/Services/RouteCache.cs`**

```csharp
using System.Net;
using Microsoft.Azure.Cosmos;
using Ebrostay.Api.Models;

namespace Ebrostay.Api.Services;

/// The lazy write-through, and the ONLY place a route's origin and destination
/// are chosen.
///
/// That single fact is the security property: both come from the stored
/// document, so an anonymous caller cannot make us route arbitrary points at
/// our expense. There is no code path here that reads coordinates from a
/// request.
public sealed class RouteCache(
    Container routes, OrsClient ors, ILogger<RouteCache> log)
{
    public async Task<NearbyRouteDoc?> GetAsync(
        PropertyDoc property, string entryId, string profile, CancellationToken ct)
    {
        var entry = property.Nearby.FirstOrDefault(e => e.Id == entryId);
        if (entry is null) return null;

        var id = $"{entryId}-{profile}";
        var key = new PartitionKey(property.Id);

        try
        {
            var hit = await routes.ReadItemAsync<NearbyRouteDoc>(id, key,
                cancellationToken: ct);
            return hit.Resource;
        }
        catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            // Cold. Fetch it once, for everyone.
        }

        var route = await ors.RouteAsync(
            new GeoPoint(property.Lat, property.Lng),
            new GeoPoint(entry.Lat, entry.Lng),
            profile, ct);

        var doc = new NearbyRouteDoc(id, property.Id, profile,
            route.Polyline, route.Metres, route.Seconds,
            DateTimeOffset.UtcNow.ToString("o"));

        try
        {
            await routes.UpsertItemAsync(doc, key, cancellationToken: ct);
        }
        catch (CosmosException e)
        {
            // A failed cache write must NOT fail the request. It only means the
            // next click fetches again.
            log.LogWarning(e, "route cache write failed for {Id}", id);
        }

        return doc;
    }

    /// Called when the pin moves: every route from it is now wrong.
    public async Task DropAsync(string propertyId, CancellationToken ct)
    {
        var key = new PartitionKey(propertyId);
        var query = new QueryDefinition(
            "SELECT c.id FROM c WHERE c.propertyId = @p").WithParameter("@p", propertyId);

        using var it = routes.GetItemQueryIterator<IdOnly>(query,
            requestOptions: new QueryRequestOptions { PartitionKey = key });

        while (it.HasMoreResults)
            foreach (var row in await it.ReadNextAsync(ct))
                try
                {
                    await routes.DeleteItemAsync<NearbyRouteDoc>(row.Id, key,
                        cancellationToken: ct);
                }
                catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound)
                {
                    // Already gone, or expired by TTL.
                }
    }

    private record IdOnly(string Id);
}
```

- [ ] **Step 2: Create `api/Functions/NearbyFunctions.cs`**

Follow the shape of `HostFunctions.cs` for auth (`ClientPrincipal.Parse`, `profiles.RequireActiveAsync`, `LoadOwnedAsync`) and for `BadRequest`.

The snippets below use four injected fields — `profiles` (`ProfileService`), `lookup` (`NearbyLookup`), `ors` (`OrsClient`) and `cache` (`RouteCache`), plus whatever `HostFunctions` uses to reach Cosmos. Declare them as primary-constructor parameters in the same style `HostFunctions` uses; the plan does not repeat that boilerplate. Three endpoints:

```csharp
// GET /api/nearby/vocabulary
// Anonymous and heavily cached: it is static configuration, holds no secrets
// and names no listing. It exists so NearbyGroups.cs is the ONE definition of
// the type list — the client keeps no copy.
[Function("NearbyVocabulary")]
public IActionResult Vocabulary(
    [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "nearby/vocabulary")]
    HttpRequest req)
{
    req.HttpContext.Response.Headers.CacheControl = "public, max-age=3600";
    return new OkObjectResult(new
    {
        groups = NearbyGroups.All.Select(g => new
        {
            key = g,
            types = NearbyGroups.Vocabulary[g],
        }),
        profiles = NearbyGroups.Profiles,
    });
}

// GET /api/host/nearby/candidates?lat=&lng=&group=
// Owner-authenticated. Rejects coordinates outside Zaragoza and unknown groups
// — that bound is what stops this being a general-purpose router.
[Function("HostNearbyCandidates")]
public async Task<IActionResult> Candidates(
    [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "host/nearby/candidates")]
    HttpRequest req)
{
    var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
    if (error is not null) return error;

    if (!TryPoint(req, out var lat, out var lng)) return BadRequest("bad_point");
    var group = req.Query["group"].ToString();
    if (!NearbyGroups.All.Contains(group)) return BadRequest("bad_group");
    if (!NearbyGroups.InZaragoza(lat, lng)) return BadRequest("out_of_area");

    try
    {
        return new OkObjectResult(
            await lookup.CandidatesAsync(lat, lng, group, req.HttpContext.RequestAborted));
    }
    catch (OrsUnavailableException e)
    {
        return new ObjectResult(new { error = e.Message }) { StatusCode = 503 };
    }
}

// GET /api/host/nearby/preview-route?lat=&lng=&toLat=&toLng=&profile=
// Owner-authenticated, stores nothing — for a candidate not yet saved.
[Function("HostNearbyPreviewRoute")]
public async Task<IActionResult> PreviewRoute(
    [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "host/nearby/preview-route")]
    HttpRequest req)
{
    var (owner, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
    if (error is not null) return error;

    if (!TryPoint(req, out var lat, out var lng)) return BadRequest("bad_point");
    if (!TryPoint(req, out var toLat, out var toLng, "toLat", "toLng"))
        return BadRequest("bad_point");
    var profile = req.Query["profile"].ToString();
    if (!NearbyGroups.Profiles.Contains(profile)) return BadRequest("bad_profile");
    if (!NearbyGroups.InZaragoza(lat, lng) || !NearbyGroups.InZaragoza(toLat, toLng))
        return BadRequest("out_of_area");

    try
    {
        var route = await ors.RouteAsync(new GeoPoint(lat, lng),
            new GeoPoint(toLat, toLng), profile, req.HttpContext.RequestAborted);
        return new OkObjectResult(route);
    }
    catch (OrsUnavailableException e)
    {
        return new ObjectResult(new { error = e.Message }) { StatusCode = 503 };
    }
}

// GET /api/properties/{id}/nearby/{entryId}/route?profile=foot
// ANONYMOUS. Takes ids, never coordinates.
[Function("PropertyNearbyRoute")]
public async Task<IActionResult> Route(
    [HttpTrigger(AuthorizationLevel.Anonymous, "get",
        Route = "properties/{id}/nearby/{entryId}/route")]
    HttpRequest req, string id, string entryId)
{
    var profile = req.Query["profile"].ToString();
    if (string.IsNullOrEmpty(profile)) profile = "foot";
    if (!NearbyGroups.Profiles.Contains(profile)) return BadRequest("bad_profile");

    var doc = await LoadPublishedAsync(id, req.HttpContext.RequestAborted);
    if (doc is null) return new NotFoundResult();

    try
    {
        var route = await cache.GetAsync(doc, entryId, profile,
            req.HttpContext.RequestAborted);
        // An unknown entry id 404s WITHOUT having touched ORS.
        if (route is null) return new NotFoundResult();

        req.HttpContext.Response.Headers.CacheControl = "public, max-age=86400";
        return new OkObjectResult(new
        {
            polyline = route.Polyline,
            metres = route.Metres,
            seconds = route.Seconds,
        });
    }
    catch (OrsUnavailableException e)
    {
        return new ObjectResult(new { error = e.Message }) { StatusCode = 503 };
    }
}
```

Add the private helper:

```csharp
private static bool TryPoint(HttpRequest req, out double lat, out double lng,
    string latKey = "lat", string lngKey = "lng") =>
    double.TryParse(req.Query[latKey], System.Globalization.NumberStyles.Float,
        System.Globalization.CultureInfo.InvariantCulture, out lat)
    & double.TryParse(req.Query[lngKey], System.Globalization.NumberStyles.Float,
        System.Globalization.CultureInfo.InvariantCulture, out lng);
```

`LoadPublishedAsync` reads the property by id and returns null unless
`Status is "published" or "paused"` — a draft's nearby routes are not public.

- [ ] **Step 3: Register `RouteCache` in `Program.cs`**

```csharp
services.AddSingleton(sp => new RouteCache(
    sp.GetRequiredService<Database>().GetContainer("nearbyRoutes"),
    sp.GetRequiredService<OrsClient>(),
    sp.GetRequiredService<ILogger<RouteCache>>()));
```

- [ ] **Step 4: Build and smoke-test with fixtures**

```bash
~/.dotnet/dotnet build api
```

Then set `"ORS_FIXTURES": "1"` in `api/local.settings.json`, start the stack, and check:

```bash
curl -s "http://localhost:4280/api/properties/movera0/nearby/does-not-exist/route" -o /dev/null -w "%{http_code}\n"
```

Expected: `404`.

- [ ] **Step 5: Commit**

```bash
git add api/Services/RouteCache.cs api/Functions/NearbyFunctions.cs api/Program.cs
git commit -m "feat(api): nearby candidate, preview-route and public route endpoints"
```

---

## Task 7: The save path — merge, validate, project

**Files:**
- Modify: `api/Models/HostWrites.cs`, `api/Models/HostModels.cs`, `api/Models/PublicModels.cs`, `api/Functions/HostFunctions.cs`

**Interfaces:**
- Consumes: `NearbyEntry`, `NearbyGroups`, `OrsClient.MatrixAsync`, `RouteCache.DropAsync`.
- Produces: `NearbyWrite`, `PublicNearby`, `HostListing.Nearby`, `PropertyDetail.Nearby`.

- [ ] **Step 1: Add the write shape to `HostWrites.cs`**

```csharp
/// What a client may say about a nearby entry. Note what is ABSENT: reach
/// figures. They are measured server-side and never accepted (ADR-028
/// Decision 8), the same posture as photo URLs in ADR-027 Decision 3.
public record NearbyWrite(
    string? Id,
    string? Group,
    string? Type,
    BilingualWrite? CustomType,
    string? Name,
    double Lat,
    double Lng);
```

Add `NearbyWrite[]? Nearby` as the last parameter of `DetailsUpdate`.

- [ ] **Step 2: Add `PublicNearby` to `PublicModels.cs`**

```csharp
/// A nearby entry as a visitor may see it. Narrower than the stored record on
/// purpose: `osmId`, `measuredAt` and `needsCheck` are provenance and internal
/// state. Handing the document type straight out is exactly how EXIF shipped
/// once already — see PublicPhoto.
public record PublicNearby(
    string Id,
    string Group,
    string? Type,
    Bilingual? CustomType,
    string Name,
    double Lat,
    double Lng,
    Dictionary<string, NearbyReach> Reach);
```

Add `PublicNearby[] Nearby` to `PropertyDetail`, and map it in `ToDetail`:

```csharp
Nearby: [.. p.Nearby.Select(n => new PublicNearby(
    n.Id, n.Group, n.Type, n.CustomType, n.Name, n.Lat, n.Lng, n.Reach))],
```

- [ ] **Step 3: Add validation to `HostValidation.CheckDetails`**

```csharp
var nearby = update.Nearby ?? [];
if (nearby.Length > 24) return "nearby_too_many";

foreach (var g in nearby.GroupBy(n => n.Group))
    if (g.Count() > 6) return "nearby_group_full";

foreach (var n in nearby)
{
    if (n.Group is null || !NearbyGroups.All.Contains(n.Group)) return "nearby_bad_group";
    if (string.IsNullOrWhiteSpace(n.Name) || n.Name.Length > 80) return "nearby_bad_name";
    if (!NearbyGroups.InZaragoza(n.Lat, n.Lng)) return "nearby_out_of_area";

    if (n.Type is not null)
    {
        if (!NearbyGroups.IsKnownType(n.Group, n.Type)) return "nearby_bad_type";
    }
    else
    {
        // The escape hatch: Spanish required, English optional and falling back
        // to it, mirroring copyEnApproved rather than inventing a new state.
        var es = n.CustomType?.Es?.Trim();
        if (string.IsNullOrEmpty(es) || es.Length > 40) return "nearby_bad_custom";
        if ((n.CustomType?.En?.Trim()?.Length ?? 0) > 40) return "nearby_bad_custom";
    }
}
```

- [ ] **Step 4: Merge in `UpdateDetails`, beside the photo merge**

`HostFunctions` gains two constructor dependencies for this — `OrsClient ors`
and `RouteCache cache` — added in the same style as its existing ones.

```csharp
// Reach figures are NEVER taken from the payload. Entries are matched by id
// against the stored document and their measured figures carried over — the
// same posture as photos, where everything but order and flags comes from the
// stored entry.
//
// The pin is the origin of every one of these distances, so when it moves they
// are ALL wrong, even though no entry changed. That is the case a naive
// "unchanged → keep" rule gets exactly backwards.
var pinMoved = Math.Abs(doc.Lat - update.Lat) > 0.000001
    || Math.Abs(doc.Lng - update.Lng) > 0.000001;

var storedNearby = doc.Nearby.ToDictionary(n => n.Id, StringComparer.Ordinal);
var writes = update.Nearby ?? [];
var merged = new List<NearbyEntry>(writes.Length);
var needsMeasuring = new List<int>();

for (var i = 0; i < writes.Length; i++)
{
    var w = writes[i];
    var known = w.Id is not null && storedNearby.TryGetValue(w.Id, out var prev) ? prev : null;

    var moved = known is not null
        && (Math.Abs(known.Lat - w.Lat) > 0.000001
            || Math.Abs(known.Lng - w.Lng) > 0.000001);

    var entry = new NearbyEntry(
        // Server-generated: a client-supplied id would let a caller point the
        // route cache at an entry it does not own.
        Id: known?.Id ?? Guid.NewGuid().ToString("n"),
        Group: w.Group!,
        Type: w.Type,
        CustomType: ToBilingual(w.CustomType),
        Name: w.Name!.Trim(),
        Lat: w.Lat,
        Lng: w.Lng,
        Reach: known is not null && !moved && !pinMoved
            ? known.Reach
            : new Dictionary<string, NearbyReach>(),
        OsmId: known?.OsmId,
        MeasuredAt: known is not null && !moved && !pinMoved ? known.MeasuredAt : null,
        NeedsCheck: false);

    merged.Add(entry);
    if (entry.Reach.Count == 0) needsMeasuring.Add(i);
}

if (needsMeasuring.Count > 0)
{
    var origin = new GeoPoint(update.Lat, update.Lng);
    var points = needsMeasuring.Select(i =>
        new GeoPoint(merged[i].Lat, merged[i].Lng)).ToArray();

    var measured = new Dictionary<string, NearbyReach[]>();
    foreach (var prof in NearbyGroups.Profiles)
        measured[prof] = await ors.MatrixAsync(origin, points, prof,
            req.HttpContext.RequestAborted);

    for (var k = 0; k < needsMeasuring.Count; k++)
    {
        var i = needsMeasuring[k];
        var reach = NearbyGroups.Profiles.ToDictionary(x => x, x => measured[x][k]);
        // Beyond its group's radius the SELECTION is now wrong, not just the
        // number — so it is flagged rather than silently kept or dropped.
        var far = reach["foot"].Metres > NearbyGroups.RadiusMetres(merged[i].Group) * 1.5;
        merged[i] = merged[i] with
        {
            Reach = reach,
            MeasuredAt = DateTimeOffset.UtcNow.ToString("o"),
            NeedsCheck = far,
        };
    }
}

doc.Nearby = [.. merged];
```

After the successful save, beside the existing `DropBlobsAsync` call:

```csharp
if (saved is OkObjectResult && pinMoved)
    await cache.DropAsync(doc.Id, req.HttpContext.RequestAborted);
```

Wrap the measuring block so an `OrsUnavailableException` returns
`503 { error = "ors_unavailable" }` **before** the document is written — an
entry with no figures must not be saved.

- [ ] **Step 5: Carry entries on the host projection**

Add `NearbyEntry[] Nearby` to `HostListing` in `HostModels.cs` and map
`p.Nearby` in `HostProjection.ToListing`. The owner *does* see `needsCheck`.

- [ ] **Step 6: Build and verify the tamper guard**

```bash
~/.dotnet/dotnet build api
```

With the stack running and `ORS_FIXTURES=1`, `PUT` a details payload whose
nearby entry claims absurd figures, then `GET` the listing back and confirm the
stored `reach` is the server's own measurement, not the payload's.

- [ ] **Step 7: Commit**

```bash
git add api/Models api/Functions/HostFunctions.cs
git commit -m "feat(api): merge nearby entries on save, measuring server-side only"
```

---

## Task 8: API types and fetchers

> Ordered before the section diff on purpose: the diff's test builds a
> `HostListing` fixture and cannot compile until that type carries `nearby`.

**Files:**
- Modify: `app/lib/api.ts`

**Interfaces:**
- Produces:
  - `type NearbyReachMap = Partial<Record<NearbyProfile, { metres: number; minutes: number }>>`
  - `type PublicNearbyEntry`, `type HostNearbyEntry`
  - `fetchNearbyVocabulary(signal?): Promise<{ groups: { key: string; types: string[] }[]; profiles: string[] }>`
  - `fetchNearbyCandidates(lat, lng, group, signal?): Promise<NearbyCandidate[]>`
  - `fetchPreviewRoute(from, to, profile, signal?): Promise<RouteLine>`
  - `fetchNearbyRoute(propertyId, entryId, profile, signal?): Promise<RouteLine>`
  - `type RouteLine = { polyline: string; metres: number; seconds: number }`

- [ ] **Step 1: Add the types and fetchers**

Follow the existing `ApiError` and fetch conventions in the file. Add
`nearby: PublicNearbyEntry[]` to `PropertyDetail` and `nearby: HostNearbyEntry[]`
to `HostListing`.

```ts
export type RouteLine = { polyline: string; metres: number; seconds: number };

/// Loading the route for one entry. The 503 case is distinguished from a 404
/// because they mean different things to the reader: "we cannot reach the
/// routing service" is temporary, "no such entry" is not.
export async function fetchNearbyRoute(
  propertyId: string,
  entryId: string,
  profile: NearbyProfile,
  signal?: AbortSignal,
): Promise<RouteLine> {
  const res = await fetch(
    `/api/properties/${encodeURIComponent(propertyId)}/nearby/${encodeURIComponent(entryId)}/route?profile=${profile}`,
    { signal },
  );
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as RouteLine;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/lib/api.ts
git commit -m "feat(app): nearby types and the three fetchers"
```

---

## Task 9: The section diff

**Files:**
- Modify: `app/lib/listing.ts`
- Create: `app/lib/listing.test.ts`

**Interfaces:**
- Consumes: `HostListing.nearby` from Task 8. **Task 8 must land first** — the
  test below will not typecheck against a `HostListing` without a `nearby`
  field.
- Produces: `SECTIONS` including `"nearby"`.

- [ ] **Step 1: Write the failing test**

Create `app/lib/listing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SECTIONS, changedSections } from "./listing";
import type { HostListing } from "./api";

// A listing with only the fields the diff reads. Cast once here so each test
// stays about the rule under test rather than about fixture plumbing.
const base = (over: Partial<HostListing> = {}): HostListing =>
  ({
    name: "Movera 7",
    type: "apartment",
    guests: 2, bedrooms: 1, bathrooms: 1, sizeM2: 60,
    floorNumber: null, energyRating: null,
    address: "Calle", postcode: "50194", cadastralRef: null,
    lat: 41.65, lng: -0.89,
    area: null, copy: null, copyEnApproved: false, details: null, beds: null,
    amenities: [], photos: [],
    petsAllowed: false, smokingAllowed: false,
    couplesAllowed: false, selfCheckin: false,
    nearby: [],
    ...over,
  }) as HostListing;

const entry = (over = {}) => ({
  id: "a", group: "transport", type: "tram", customType: null,
  name: "Tranvía L1", lat: 41.651, lng: -0.891,
  reach: { foot: { metres: 340, minutes: 4 } },
  needsCheck: false,
  ...over,
});

describe("SECTIONS", () => {
  it("includes nearby, after address", () => {
    expect(SECTIONS).toContain("nearby");
    expect(SECTIONS.indexOf("nearby")).toBe(SECTIONS.indexOf("address") + 1);
  });
});

describe("changedSections", () => {
  it("reports nothing when nothing moved", () => {
    expect(changedSections(base(), base())).toEqual([]);
  });

  it("notices an added entry", () => {
    expect(changedSections(base({ nearby: [entry()] }), base())).toEqual(["nearby"]);
  });

  it("notices a removed entry", () => {
    expect(changedSections(base(), base({ nearby: [entry()] }))).toEqual(["nearby"]);
  });

  it("notices a retyped entry", () => {
    expect(
      changedSections(
        base({ nearby: [entry({ type: "bus" })] }),
        base({ nearby: [entry()] }),
      ),
    ).toEqual(["nearby"]);
  });

  // Reach is measured server-side and can change without the owner doing
  // anything. Treating it as an edit would light the "changed" indicator on a
  // page the owner just opened — the exact bug that opened this whole thread.
  it("ignores a change to the measured figures", () => {
    expect(
      changedSections(
        base({ nearby: [entry({ reach: { foot: { metres: 999, minutes: 12 } } })] }),
        base({ nearby: [entry()] }),
      ),
    ).toEqual([]);
  });

  // Order is not content here: the public page sorts by time, so an array
  // reshuffle is not something the owner changed.
  it("ignores reordering", () => {
    const a = entry({ id: "a" });
    const b = entry({ id: "b", name: "Bus Ci1" });
    expect(changedSections(base({ nearby: [b, a] }), base({ nearby: [a, b] }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd app && npm test`
Expected: FAIL — `SECTIONS` does not contain `"nearby"`.

- [ ] **Step 3: Extend `SECTIONS` and `FIELDS`**

In `app/lib/listing.ts`, insert `"nearby"` after `"address"` in `SECTIONS`, and add to `FIELDS`:

```ts
  // What the owner CHOSE — not what we measured. Reach figures are recomputed
  // server-side and can change with no owner action, so comparing them would
  // light the "changed" indicator on a freshly opened page. Sorted, because
  // array order is not content here: the public page orders by time.
  nearby: (l) =>
    l.nearby
      .map((n) =>
        [n.group, n.type ?? "", n.customType?.es ?? "", n.customType?.en ?? "",
         n.name, n.lat.toFixed(6), n.lng.toFixed(6)].join("|"),
      )
      .sort(),
```

- [ ] **Step 4: Run tests**

Run: `cd app && npm test`
Expected: PASS, 13 tests total.

- [ ] **Step 5: Commit**

```bash
git add app/lib/listing.ts app/lib/listing.test.ts
git commit -m "feat(app): track the nearby section in the listing diff"
```

---

## Task 10: `NearbyMap`

**Files:**
- Create: `app/components/host/fields/NearbyMap.tsx`

**Interfaces:**
- Consumes: `decodePolyline` from `app/lib/nearby.ts`.
- Produces:

```ts
export function NearbyMap(props: {
  home: { lat: number; lng: number };
  candidates: { id: string; lat: number; lng: number; label: string }[];
  chosen: { id: string; lat: number; lng: number; label: string }[];
  activeId: string | null;
  routePolyline: string | null;
  dropMode: boolean;
  onPick: (id: string) => void;
  onDrop: (lat: number, lng: number) => void;
  className?: string;
}): JSX.Element
```

- [ ] **Step 1: Build the component**

Follow `LocationPicker.tsx` exactly for the Leaflet lifecycle. The skeleton — this is the part with the known trap, so it is spelled out:

```tsx
"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { decodePolyline } from "@/lib/nearby";

export function NearbyMap({ home, candidates, chosen, activeId, routePolyline,
  dropMode, onPick, onDrop, className = "" }: NearbyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet is loaded at
     runtime and has no types available at this import site. */
  const mapRef = useRef<any>(null);
  const pinsRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Read inside handlers registered once. Written in effects, not during
  // render: a ref is not render output, and assigning one on the way past
  // makes the value depend on how many times React chose to render.
  const onPickRef = useRef(onPick);
  const onDropRef = useRef(onDrop);
  const dropModeRef = useRef(dropMode);
  useEffect(() => {
    onPickRef.current = onPick;
    onDropRef.current = onDrop;
    dropModeRef.current = dropMode;
  }, [onPick, onDrop, dropMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Leaflet touches `window` as it loads, so it cannot be a module import
      // in a statically exported page.
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      mapRef.current = L.map(containerRef.current, { scrollWheelZoom: false })
        .setView([home.lat, home.lng], 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);
      pinsRef.current = L.layerGroup().addTo(mapRef.current);

      mapRef.current.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        if (dropModeRef.current) onDropRef.current(e.latlng.lat, e.latlng.lng);
      });
    })();
    return () => { cancelled = true; };
  }, [home.lat, home.lng]);

  // …one effect redrawing pins from `candidates`/`chosen`/`activeId`, and one
  // redrawing the line from `routePolyline` via decodePolyline().
}
```

Remaining requirements:

Requirements:
- Home pin uses the existing `map-marker` divIcon class.
- Candidate pins are visually distinct from chosen pins and carry `title`/`alt` accessible names, as `ListingsMap` does.
- **Do not re-fit bounds on every prop change** — that is the bug `LocationPicker`'s comment warns about. Fit once when candidates first arrive.
- The route line renders via `L.polyline(decodePolyline(routePolyline))` into a layer cleared on each change.
- In `dropMode`, a map click calls `onDrop`; otherwise clicks do nothing.

- [ ] **Step 2: Typecheck and build**

```bash
cd app && npx tsc --noEmit && npm run build
```

Expected: both clean. A `getComputedStyle` or `window` reference outside an effect will fail prerendering here — that is the point of running the build.

- [ ] **Step 3: Commit**

```bash
git add app/components/host/fields/NearbyMap.tsx
git commit -m "feat(app): nearby editor map with candidate pins and a route line"
```

---

## Task 11: `NearbyEditor` and the edit page

**Files:**
- Create: `app/components/host/fields/NearbyEditor.tsx`
- Modify: `app/app/[locale]/host/edit/page.tsx`, `app/messages/es.json`, `app/messages/en.json`

**Interfaces:**
- Consumes: `NearbyMap`, `fetchNearbyCandidates`, `fetchPreviewRoute`, `NEARBY_GROUPS`, `TYPES_BY_GROUP`, `HostNearbyEntry`.
- Produces: `NearbyEditor({ value, lat, lng, onChange })` where `value: HostNearbyEntry[]`.

- [ ] **Step 1: Add the strings to BOTH catalogues**

Under a new shared `nearby` root (read by the editor **and** the public page):

```json
"nearby": {
  "type": {
    "tram": "Tram", "bus": "Bus", "rail": "Train", "metro": "Metro",
    "bikeshare": "Bike share", "taxi": "Taxi",
    "supermarket": "Supermarket", "market": "Market", "bakery": "Bakery",
    "convenience": "Corner shop", "mall": "Shopping centre",
    "restaurant": "Restaurant", "tapas": "Tapas", "cafe": "Café", "bar": "Bar",
    "park": "Park", "river": "River", "sports": "Sports centre",
    "pool": "Pool", "playground": "Playground",
    "pharmacy": "Pharmacy", "clinic": "Clinic", "hospital": "Hospital",
    "dentist": "Dentist", "vet": "Vet"
  },
  "attribution": "© openrouteservice by HeiGIT | Data from OpenStreetMap"
}
```

`attribution` is **identical in both files** — it is a required legal credit, not copy.

Under `host.edit.nearby`: `title`, `hint`, `find`, `addManually`, `close`, `remove`, `added`, `groupFull`, `needsCheck`, `customType`, `customEs`, `customEn`, `lookupFailed`, `retry`, `orsDown`, `empty`, `count`.

- [ ] **Step 2: Build the component**

Structure per ADR-028 Decision 7 and the design's §7.1:

- `ChipGroup` for the five groups, each label carrying its count. **Not `Segmented`** — that component's own comment rules out five segments.
- The chosen list for the active group: name, type chip, walking figure, remove button, and a `needsCheck` marker.
- `Find nearby` expands the finder **inline** (never a dialog — it would fight the sticky nav and save bar).
- Finder layout uses a **container query** (`@container`), not a media query: the edit page grows a rail at `64rem`, so the card's width is not a function of the viewport and a media query would be wrong in exactly the rail case.
- Clicking a candidate calls `fetchPreviewRoute` and passes the polyline down. **Click, not hover** — hover would fire a request per mouse movement.
- Type `<select>` built from `fetchNearbyVocabulary()` — **the client keeps no type list of its own.** Pre-filled from the candidate's type, with `Other…` last revealing the ES/EN inputs.
- **Hide any served type that has no `nearby.type.<key>` string** rather than rendering it. The vocabulary now arrives over the wire while the labels stay in the catalogues, so a type added server-side before its strings would otherwise throw `MISSING_MESSAGE`. Use next-intl's `has()` to check, and never render a raw key as a label.
- If the vocabulary fetch fails, the finder still works and the type select falls back to disabled with the failure named — a candidate's own type is already known from the lookup, so adding is not blocked.
- At 6 in a group, add controls are `disabled` with the reason rendered, not hidden.
- On lookup failure, render the message and a retry; manual add stays available.
- After adding, **focus stays in the candidate list**.
- The editor shows **walking figures only**.

- [ ] **Step 3: Wire into the edit page**

Add a `SectionCard id="nearby" label={te("nav.nearby")}` directly after the address card, and `nav.nearby` to both catalogues.

- [ ] **Step 4: Verify in the browser**

Start the stack, open `http://localhost:4280/es/host/edit?id=movera0` (**:4280**, not :3000). Check: chips render with counts; Find nearby returns candidates; clicking one draws a line; the seventh add is blocked with a visible reason; the section nav shows a `nearby` rung; editing lights the "changed" indicator.

- [ ] **Step 5: Full gate**

```bash
cd app && npm test && npx tsc --noEmit && npx eslint && npm run build
```

Expected: tests pass, tsc clean, eslint at exactly 5 errors, build green.

- [ ] **Step 6: Commit**

```bash
git add app/components/host/fields/NearbyEditor.tsx "app/app/[locale]/host/edit/page.tsx" app/messages
git commit -m "feat(app): nearby editor section with map-assisted suggestions"
```

---

## Task 12: The public neighbourhood section

**Files:**
- Create: `app/components/detail/NeighbourhoodMap.tsx`
- Modify: `app/components/detail/Nearby.tsx`, `app/app/[locale]/property/page.tsx`, `app/messages/{es,en}.json`
- Delete: `app/lib/detail-placeholders.ts`

**Interfaces:**
- Consumes: `PublicNearbyEntry`, `fetchNearbyRoute`, `decodePolyline`, `reachFor`, `NEARBY_PROFILES`.

- [ ] **Step 1: Merge sections 7 and 9**

In `app/app/[locale]/property/page.tsx`, delete the separate "Where you'll be" (7) and "Nearby" (9) sections and render one section containing `NeighbourhoodMap` + the address line + `Nearby`. The route line has to be drawn in the same viewport as the list that was clicked, which is the whole reason for the merge.

Remove the `PLACEHOLDER_NEARBY` import and the `ListingsMap` import if now unused.

- [ ] **Step 2: Rewrite `Nearby.tsx`**

- Keeps `sm:grid-cols-2`, `CATEGORY_ICONS` and the existing figure typography.
- Entries become `<button>`s, ordered by the active profile's minutes ascending.
- A `Segmented` control for **on foot / by car** (two options — this is what `Segmented` is actually for), defaulting to `foot`.
- Entries with no figures for the active profile are hidden rather than rendered as `undefined min`.
- Clicking calls `fetchNearbyRoute`; the loading state sits **on that entry**, not the page.
- On failure the entry shows `routeUnavailable` and stays clickable. **The figures never disappear** — they came from the document, not from ORS.
- Groups with no entries render nothing; no entries at all renders nothing.
- Type label: `t(\`nearby.type.${type}\`)`, or for a custom type `customType.en ?? customType.es` in EN and `customType.es` in ES.

- [ ] **Step 3: Fix the subtitle, which now lies**

`detail.nearby.subtitle` is currently `"Indicative times from central Zaragoza."` — honest about placeholder data, false about measured data. Replace with per-profile strings:
- EN: `"Walking times from this address."` / `"Driving times from this address."`
- ES: `"Tiempos a pie desde esta dirección."` / `"Tiempos en coche desde esta dirección."`

- [ ] **Step 4: Add the attribution**

Render `t("nearby.attribution")` beneath the map, verbatim, in both locales.

- [ ] **Step 5: Delete the placeholder**

```bash
cd app && grep -rn "detail-placeholders\|PLACEHOLDER_NEARBY" app components lib
```

If the only hits are the ones just removed, delete `app/lib/detail-placeholders.ts`. If anything else still imports it, keep the file and remove only `PLACEHOLDER_NEARBY`.

- [ ] **Step 6: Verify in the browser**

At `http://localhost:4280/es/property/?id=movera0`: entries render; clicking draws a line; a second click on the same entry does not produce another `/route` request (check the network panel); the profile toggle re-labels the figures and redraws; both locales; light and dark; narrow width.

- [ ] **Step 7: Full gate and commit**

```bash
cd app && npm test && npx tsc --noEmit && npx eslint && npm run build
git add -A app
git commit -m "feat(app): merge the neighbourhood section and draw real nearby routes"
```

---

## Task 13: Docs and end-to-end verification

**Files:**
- Modify: `docs/spec-v2/02-data-model.md`, `docs/spec-v2/04-functional-flows.md`, `docs/spec-v2/05-decision-log.md`

- [ ] **Step 1: Document the shapes**

In `02-data-model.md`, add a nearby subsection covering `NearbyEntry` (with the caps and what `needsCheck` means), the `nearbyRoutes` container with its partition key, TTL and indexing policy, and the `nearbyCandidates` / `serviceBudget` containers. State explicitly that reach figures are never accepted from a client.

- [ ] **Step 2: Document the flows**

In `04-functional-flows.md`, add the candidate lookup (Overpass cached per cell, matrix always against the true pin) and the lazy route flow (ids only, write-through, 404 on unknown entry without touching ORS).

- [ ] **Step 3: Mark ADR-028 built**

Change its status line to `✅ locked and ✅ **built** 2026-XX-XX`, and add a "What the build settled" list following the ADR-019 and ADR-027 precedent — including anything that turned out differently from the design.

- [ ] **Step 4: Run the full verification list**

With `ORS_FIXTURES` **unset** so real ORS is exercised at least once:

1. Transport on `EBR-P-0201` → candidates with figures, pins on the map.
2. Click a candidate → **the drawn line is not straight** (the only real proof it routed rather than interpolated).
3. Seventh entry in a group → blocked, reason visible.
4. Custom type, Spanish only → saves; add English → renders in EN.
5. Tampered `PUT` with absurd metres → stored `reach` is the server's measurement.
6. Public page: click draws a line; second click makes no `/route` request.
7. Car toggle → figures change, line redraws.
8. Move the pin, save → `nearbyRoutes` for that property is empty, figures re-measured, far entries flagged.
9. `GET /api/properties/{id}/nearby/{bogus}/route` → 404.
10. Owner endpoints with no principal → 401/403; another owner's listing → 404.
11. `?lat=48.85&lng=2.35` on candidates → 400 `out_of_area`.
12. `GET` the public detail JSON → contains no `osmId`, `measuredAt` or `needsCheck`.
13. Both locales, both themes, narrow width, `npm test`, `tsc`, `eslint` at 5, `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: record the nearby data model, flows, and what the build settled"
```

---

## Notes for the implementer

- **`api/local.settings.json` is gitignored and holds real keys.** Never commit it, never paste its contents into a message.
- **Never write to the deployed Cosmos database.** All testing is against the local emulator.
- If a step's code does not compile against the real file, **read the surrounding file and follow its conventions** rather than forcing this plan's snippet in. The plan's snippets are correct in intent; the codebase is correct in detail.
- The 5 pre-existing eslint errors are spread across `app/not-found.tsx`, `app/components/site/ThemeToggle.tsx`, `app/app/[locale]/page.tsx` and `app/app/[locale]/property/page.tsx`. Check the COUNT is still 5; a 6th is yours.

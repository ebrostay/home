# Street-Band Address Privacy (ADR-041) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public listing stops disclosing the door: street-band map (no pin), merged best–worst travel-time ranges, segment-midpoint search pins, formula listing names — exact address only for owner/admin and after booking (ADR-041, locked 2026-08-07; OD-10 decided).

**Architecture:** Everything privacy-relevant is computed **server-side**. A new `StreetBandService` derives the public street segment from OSM at save time and stores it on the property document. `PublicProjection` is the single choke point that swaps exact coordinates for band data in both anonymous payloads. Route endpoints return a merged "fan-and-trunk" shape computed from three samples (two inset segment ends + the true door — the door contributes **time only, never geometry**). The client renders what it is given and never receives an exact coordinate or address.

**Tech Stack:** .NET 9 isolated Azure Functions, Cosmos DB, OpenRouteService (ORS), Overpass API, Next.js static export, Leaflet (lazy import), vitest, Playwright, xunit-style tests in `api/Ebrostay.Api.Tests`.

**Spec sources:** `docs/spec/05-decision-log.md` ADR-041 (locked) + OD-9/OD-10; prototype `docs/ux-analysis/prototypes/street-band.html`; backlog entry "Implement the street-band design".

## Global Constraints

- Bilingual ES/EN is a hard requirement: every user-facing string goes in `app/messages/es.json` **and** `en.json`; Spanish is default.
- Static export (`output: "export"`): no middleware, no SSR; Leaflet is lazy-imported inside effects; import `Link`/`useRouter` from `@/i18n/navigation`.
- Authorization is enforced in the C# functions (`x-ms-client-principal`), never only via route rules or UI gates.
- `cd app && npm run build` must stay green; `cd app && npm test` (vitest, `app/lib` pure logic only); `cd app && npm run test:e2e` (hermetic, `/api/*` from fixtures; the guard test enumerates routes).
- API tests: `~/.dotnet/dotnet test api/Ebrostay.Api.Tests`; API build: `~/.dotnet/dotnet build api`.
- Secrets only in Functions app settings; fixture modes via env vars (`ORS_FIXTURES=1` exists; this plan adds `STREETBAND_FIXTURES=1`).
- Commit style: short lowercase conventional-commit subject lines in this repo's voice.
- **Privacy invariants (from ADR-041) — every task must preserve them:**
  1. No anonymous payload carries exact `lat`/`lng`, the `address` field, or any geometry derived from the door.
  2. The true door contributes **only scalar times/distances inside outward-rounded ranges**; the range sample set must include the door (it can fall outside the two-end range).
  3. Routing samples sit ~10 m inside the segment, never on a junction node (one-way rule).
  4. The home is off-center in the published segment by a fixed per-listing offset, stable across requests.
  5. Owner (`/api/host/*`) and admin surfaces keep exact data — no changes there except where named.

---

### Task 1: C# polyline5 codec

The band route shape ships encoded polylines the server must decode (ORS output) and re-encode (after fork-splitting). ORS uses Google encoded polyline, precision 5. `app/lib/nearby.ts:43` already has the TS decoder; this is its C# twin.

**Files:**
- Create: `api/Services/Polyline5.cs`
- Test: `api/Ebrostay.Api.Tests/Polyline5Tests.cs`

**Interfaces:**
- Produces: `static class Polyline5` with `List<GeoPoint> Decode(string encoded)` and `string Encode(IReadOnlyList<GeoPoint> points)` (namespace `Ebrostay.Api.Services`; `GeoPoint` is the existing `record GeoPoint(double Lat, double Lng)` in `OrsClient.cs`).

- [ ] **Step 1: Write the failing tests** (follow the assertion style of `api/Ebrostay.Api.Tests/PropertyDocParserTests.cs` — same framework and conventions as the existing suite)

```csharp
using Ebrostay.Api.Services;

public class Polyline5Tests
{
    // Google's canonical reference vector — the same one app/lib/nearby.test.ts uses.
    private const string Reference = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

    [Fact]
    public void Decodes_the_reference_vector()
    {
        var pts = Polyline5.Decode(Reference);
        Assert.Equal(3, pts.Count);
        Assert.Equal(38.5, pts[0].Lat, 5);
        Assert.Equal(-120.2, pts[0].Lng, 5);
        Assert.Equal(40.7, pts[1].Lat, 5);
        Assert.Equal(-120.95, pts[1].Lng, 5);
        Assert.Equal(43.252, pts[2].Lat, 5);
        Assert.Equal(-126.453, pts[2].Lng, 5);
    }

    [Fact]
    public void Encode_roundtrips_decode()
    {
        var pts = Polyline5.Decode(Reference);
        Assert.Equal(Reference, Polyline5.Encode(pts));
    }

    [Fact]
    public void Empty_string_decodes_to_empty_list()
    {
        Assert.Empty(Polyline5.Decode(""));
        Assert.Equal("", Polyline5.Encode([]));
    }
}
```

- [ ] **Step 2: Run to verify failure** — `~/.dotnet/dotnet test api/Ebrostay.Api.Tests --filter Polyline5` — expected: compile error, `Polyline5` not defined.

- [ ] **Step 3: Implement**

```csharp
namespace Ebrostay.Api.Services;

/// Google encoded polyline, precision 5 — what ORS returns and what the band
/// route endpoints ship. C# twin of app/lib/nearby.ts decodePolyline.
public static class Polyline5
{
    public static List<GeoPoint> Decode(string encoded)
    {
        var points = new List<GeoPoint>();
        int index = 0, lat = 0, lng = 0;
        while (index < encoded.Length)
        {
            lat += Next(encoded, ref index);
            lng += Next(encoded, ref index);
            points.Add(new GeoPoint(lat / 1e5, lng / 1e5));
        }
        return points;
    }

    public static string Encode(IReadOnlyList<GeoPoint> points)
    {
        var sb = new System.Text.StringBuilder();
        int prevLat = 0, prevLng = 0;
        foreach (var p in points)
        {
            var lat = (int)Math.Round(p.Lat * 1e5);
            var lng = (int)Math.Round(p.Lng * 1e5);
            Write(sb, lat - prevLat);
            Write(sb, lng - prevLng);
            prevLat = lat; prevLng = lng;
        }
        return sb.ToString();
    }

    private static int Next(string s, ref int index)
    {
        int result = 0, shift = 0, b;
        do
        {
            b = s[index++] - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        return (result & 1) != 0 ? ~(result >> 1) : result >> 1;
    }

    private static void Write(System.Text.StringBuilder sb, int value)
    {
        var v = value < 0 ? ~(value << 1) : value << 1;
        while (v >= 0x20)
        {
            sb.Append((char)((0x20 | (v & 0x1f)) + 63));
            v >>= 5;
        }
        sb.Append((char)(v + 63));
    }
}
```

- [ ] **Step 4: Run to verify pass** — same filter, expected: 3 passing.
- [ ] **Step 5: Commit** — `git add api/Services/Polyline5.cs api/Ebrostay.Api.Tests/Polyline5Tests.cs && git commit` (subject: `feat(api): polyline5 codec — the band routes need both directions`).

---

### Task 2: C# band geometry — arc-length, inset, off-center segment cut

Pure geometry for the band: measure a polyline, walk along it, project the door onto it, cut the ≤250 m off-center segment at junction indices.

**Files:**
- Create: `api/Services/BandGeometry.cs`
- Test: `api/Ebrostay.Api.Tests/BandGeometryTests.cs`

**Interfaces:**
- Consumes: `GeoPoint` (existing), `OverpassClient.Haversine` (existing `internal static`).
- Produces (`static class BandGeometry`, all pure):
  - `double Length(IReadOnlyList<GeoPoint> line)` — metres.
  - `GeoPoint MoveAlong(IReadOnlyList<GeoPoint> line, double metres)` — point at arc-length, clamped to the last point.
  - `List<GeoPoint> Slice(IReadOnlyList<GeoPoint> line, double fromM, double toM)` — sub-polyline between two arc-lengths (interpolated endpoints included).
  - `double ProjectArc(IReadOnlyList<GeoPoint> line, GeoPoint p)` — arc-length of the closest point on the line to `p`.
  - `double OffsetFraction(string listingId)` — deterministic in `[0.15,0.42] ∪ [0.58,0.85]` (never centered).
  - `(double FromM, double ToM) CutSegment(double streetLen, double homeArc, double fraction, double[] junctionArcs, double maxLen = 250, double wholeStreetTolerance = 300)` — the segment window: whole street when short; otherwise the ~`maxLen` window placed so the home sits at `fraction` of it, clamped to `[0, streetLen]`, then expanded outward to the nearest junction arc-lengths (or street ends).

- [ ] **Step 1: Write the failing tests**

```csharp
using Ebrostay.Api.Services;

public class BandGeometryTests
{
    // A straight ~1113 m west→east line at the equator (1e-2 deg lng ≈ 1113 m).
    private static readonly GeoPoint[] Line =
        [new(0, 0), new(0, 0.005), new(0, 0.01)];

    [Fact]
    public void Length_measures_the_polyline()
        => Assert.InRange(BandGeometry.Length(Line), 1100, 1125);

    [Fact]
    public void MoveAlong_interpolates_and_clamps()
    {
        var p = BandGeometry.MoveAlong(Line, BandGeometry.Length(Line) / 2);
        Assert.Equal(0.005, p.Lng, 4);
        var end = BandGeometry.MoveAlong(Line, 1e9);
        Assert.Equal(0.01, end.Lng, 6);
    }

    [Fact]
    public void ProjectArc_finds_the_closest_point()
    {
        var arc = BandGeometry.ProjectArc(Line, new GeoPoint(0.0001, 0.0025));
        Assert.InRange(arc, 250, 310); // ≈ a quarter of the way along
    }

    [Fact]
    public void OffsetFraction_is_stable_and_never_centered()
    {
        var f = BandGeometry.OffsetFraction("pedro1");
        Assert.Equal(f, BandGeometry.OffsetFraction("pedro1"));
        Assert.True(f is (>= 0.15 and <= 0.42) or (>= 0.58 and <= 0.85));
        Assert.NotEqual(f, BandGeometry.OffsetFraction("pedro2"));
    }

    [Fact]
    public void Short_street_is_taken_whole()
    {
        var (from, to) = BandGeometry.CutSegment(190, 90, 0.3, []);
        Assert.Equal(0, from);
        Assert.Equal(190, to);
    }

    [Fact]
    public void Long_street_gets_an_offcenter_window_snapped_to_junctions()
    {
        double[] junctions = [200, 400, 600, 800];
        var (from, to) = BandGeometry.CutSegment(1000, 500, 0.3, junctions);
        // Ideal window: home at 30% of 250 m → [425, 675]; snapped outward to
        // junctions → [400, 800].
        Assert.Equal(400, from);
        Assert.Equal(800, to);
        Assert.True(from <= 500 && 500 <= to, "home must be inside the segment");
    }

    [Fact]
    public void Window_clamps_at_the_street_end()
    {
        var (from, to) = BandGeometry.CutSegment(1000, 980, 0.3, [700]);
        Assert.True(to <= 1000 && from < to && from <= 980);
    }
}
```

- [ ] **Step 2: Run to verify failure** — filter `BandGeometry`, expected compile failure.
- [ ] **Step 3: Implement**

```csharp
using System.Security.Cryptography;
using System.Text;

namespace Ebrostay.Api.Services;

/// Pure geometry for the ADR-041 street band. Nothing here does IO.
public static class BandGeometry
{
    public static double Length(IReadOnlyList<GeoPoint> line)
    {
        double m = 0;
        for (var i = 1; i < line.Count; i++)
            m += OverpassClient.Haversine(
                line[i - 1].Lat, line[i - 1].Lng, line[i].Lat, line[i].Lng);
        return m;
    }

    public static GeoPoint MoveAlong(IReadOnlyList<GeoPoint> line, double metres)
    {
        var remaining = metres;
        for (var i = 1; i < line.Count; i++)
        {
            var seg = OverpassClient.Haversine(
                line[i - 1].Lat, line[i - 1].Lng, line[i].Lat, line[i].Lng);
            if (seg >= remaining && seg > 0)
            {
                var f = remaining / seg;
                return new GeoPoint(
                    line[i - 1].Lat + (line[i].Lat - line[i - 1].Lat) * f,
                    line[i - 1].Lng + (line[i].Lng - line[i - 1].Lng) * f);
            }
            remaining -= seg;
        }
        return line[^1];
    }

    public static List<GeoPoint> Slice(
        IReadOnlyList<GeoPoint> line, double fromM, double toM)
    {
        var result = new List<GeoPoint> { MoveAlong(line, fromM) };
        double walked = 0;
        for (var i = 1; i < line.Count; i++)
        {
            walked += OverpassClient.Haversine(
                line[i - 1].Lat, line[i - 1].Lng, line[i].Lat, line[i].Lng);
            if (walked > fromM && walked < toM) result.Add(line[i]);
        }
        result.Add(MoveAlong(line, toM));
        return result;
    }

    public static double ProjectArc(IReadOnlyList<GeoPoint> line, GeoPoint p)
    {
        double best = double.MaxValue, bestArc = 0, walked = 0;
        for (var i = 1; i < line.Count; i++)
        {
            var a = line[i - 1];
            var b = line[i];
            var segLen = OverpassClient.Haversine(a.Lat, a.Lng, b.Lat, b.Lng);
            // Project p onto segment a→b in a local flat frame.
            var cos = Math.Cos(a.Lat * Math.PI / 180);
            double ax = 0, ay = 0;
            double bx = (b.Lng - a.Lng) * cos, by = b.Lat - a.Lat;
            double px = (p.Lng - a.Lng) * cos, py = p.Lat - a.Lat;
            var len2 = bx * bx + by * by;
            var t = len2 == 0 ? 0 : Math.Clamp((px * bx + py * by) / len2, 0, 1);
            var dx = px - (ax + bx * t);
            var dy = py - (ay + by * t);
            var dist = Math.Sqrt(dx * dx + dy * dy);
            if (dist < best)
            {
                best = dist;
                bestArc = walked + segLen * t;
            }
            walked += segLen;
        }
        return bestArc;
    }

    /// Stable per listing, never in the middle band — an averaged segment
    /// midpoint must not converge on the door (ADR-041 point 2).
    public static double OffsetFraction(string listingId)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(listingId));
        var unit = BitConverter.ToUInt32(hash, 0) / (double)uint.MaxValue;
        // Map [0,1) onto [0.15,0.42] ∪ [0.58,0.85] (two 0.27-wide halves).
        return unit < 0.5
            ? 0.15 + unit * 2 * 0.27
            : 0.58 + (unit - 0.5) * 2 * 0.27;
    }

    public static (double FromM, double ToM) CutSegment(
        double streetLen, double homeArc, double fraction,
        double[] junctionArcs, double maxLen = 250, double wholeStreetTolerance = 300)
    {
        if (streetLen <= wholeStreetTolerance) return (0, streetLen);

        var from = Math.Clamp(homeArc - fraction * maxLen, 0, streetLen - maxLen);
        var to = from + maxLen;

        // Expand outward to whole blocks: nearest junction at-or-before `from`,
        // nearest at-or-after `to`; the street ends serve where no junction does.
        var snappedFrom = junctionArcs.Where(j => j <= from).DefaultIfEmpty(0).Max();
        var snappedTo = junctionArcs.Where(j => j >= to).DefaultIfEmpty(streetLen).Min();
        return (snappedFrom, snappedTo);
    }
}
```

- [ ] **Step 4: Run to verify pass** — filter `BandGeometry`, expected: 7 passing.
- [ ] **Step 5: Commit** — subject: `feat(api): band geometry — the segment knows its blocks and hides its middle`.

---

### Task 3: C# fork split — trunk once, stubs twice

The two boundary routes share the road once they converge; the shared part ships once (ADR-041 point 5). Split from the destination end while points coincide.

**Files:**
- Create: `api/Services/RouteSplitter.cs`
- Test: `api/Ebrostay.Api.Tests/RouteSplitterTests.cs`

**Interfaces:**
- Consumes: `GeoPoint`.
- Produces: `static class RouteSplitter` with
  `(List<GeoPoint> Trunk, List<GeoPoint> StubA, List<GeoPoint> StubB) Split(IReadOnlyList<GeoPoint> a, IReadOnlyList<GeoPoint> b)`.
  Contract: `Trunk` runs fork→destination; each stub runs origin→fork **inclusive of the fork point** so drawn lines connect. If the routes never share a tail, `Trunk` is empty and the stubs are the full routes.

- [ ] **Step 1: Write the failing tests**

```csharp
using Ebrostay.Api.Services;

public class RouteSplitterTests
{
    [Fact]
    public void Splits_at_the_fork()
    {
        GeoPoint[] a = [new(0, 0), new(1, 1), new(2, 2), new(3, 3)];
        GeoPoint[] b = [new(0, 9), new(1, 8), new(2, 2), new(3, 3)];
        var (trunk, stubA, stubB) = RouteSplitter.Split(a, b);
        Assert.Equal([new(2, 2), new(3, 3)], trunk);
        Assert.Equal([new(0, 0), new(1, 1), new(2, 2)], stubA);
        Assert.Equal([new(0, 9), new(1, 8), new(2, 2)], stubB);
    }

    [Fact]
    public void Never_converging_routes_become_two_full_stubs()
    {
        GeoPoint[] a = [new(0, 0), new(1, 1)];
        GeoPoint[] b = [new(0, 9), new(1, 8)];
        var (trunk, stubA, stubB) = RouteSplitter.Split(a, b);
        Assert.Empty(trunk);
        Assert.Equal(a, stubA);
        Assert.Equal(b, stubB);
    }

    [Fact]
    public void Identical_routes_are_all_trunk()
    {
        GeoPoint[] a = [new(0, 0), new(1, 1)];
        var (trunk, stubA, stubB) = RouteSplitter.Split(a, a);
        Assert.Equal(a, trunk);
        Assert.Single(stubA); // just the fork point, draws nothing
        Assert.Single(stubB);
    }
}
```

- [ ] **Step 2: Run to verify failure** — filter `RouteSplitter`.
- [ ] **Step 3: Implement**

```csharp
namespace Ebrostay.Api.Services;

/// ADR-041 point 5: the boundary routes share the road once they converge.
/// Split at the fork — trunk drawn once, stubs as branches. The DOOR route
/// never reaches this class: its geometry must not exist in any output.
public static class RouteSplitter
{
    private const double Eps = 1e-6;

    private static bool Eq(GeoPoint p, GeoPoint q) =>
        Math.Abs(p.Lat - q.Lat) < Eps && Math.Abs(p.Lng - q.Lng) < Eps;

    public static (List<GeoPoint> Trunk, List<GeoPoint> StubA, List<GeoPoint> StubB)
        Split(IReadOnlyList<GeoPoint> a, IReadOnlyList<GeoPoint> b)
    {
        int i = a.Count - 1, j = b.Count - 1;
        if (a.Count == 0 || b.Count == 0 || !Eq(a[i], b[j]))
            return ([], [.. a], [.. b]);

        while (i > 0 && j > 0 && Eq(a[i - 1], b[j - 1])) { i--; j--; }

        // a[i..] == b[j..] is the shared trunk; a[i]/b[j] is the fork point,
        // kept on both stubs so the drawn lines meet.
        return (
            [.. a.Skip(i)],
            [.. a.Take(i + 1)],
            [.. b.Take(j + 1)]);
    }
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — subject: `feat(api): fork split — shared road draws once`.

---

### Task 4: C# street derivation — Overpass fetch, way merge, `StreetBand` on the document

Derive the band from the stored pin: nearest named highway way → merge same-named neighbour ways into one chain → junction arc-lengths from node ids shared with other-named ways → cut → inset samples. Fixture mode for local/e2e.

**Files:**
- Modify: `api/Models/PropertyDoc.cs` (add `Band` + records)
- Create: `api/Services/StreetBandService.cs`
- Modify: `api/Program.cs` (register `StreetBandService`; it uses the existing `"overpass"` HttpClient)
- Test: `api/Ebrostay.Api.Tests/StreetBandServiceTests.cs` (the pure merge logic)

**Interfaces:**
- Produces on `PropertyDoc`:

```csharp
public record BandPoint(double Lat, double Lng);

/// The ADR-041 disclosure unit, derived — never typed. Everything here is
/// derived from OSM + the stored pin; SampleA/SampleB are the inset routing
/// origins and MUST NOT appear in any public projection (server-side use).
public record StreetBand(
    BandPoint[] Line,
    double MidLat,
    double MidLng,
    BandPoint SampleA,
    BandPoint SampleB,
    string? StreetName,
    string DerivedAt);

// on PropertyDoc:
public StreetBand? Band { get; set; }   // null until derived / derivation failed
```

- Produces `StreetBandService`:
  - `Task<StreetBand?> DeriveAsync(string listingId, double lat, double lng, CancellationToken ct)` — null on any failure (logged); callers treat null as "degraded, retry on next save/read".
  - `internal static List<(long NodeId, GeoPoint P)> MergeChains(List<List<(long, GeoPoint)>> ways, GeoPoint near)` — pure: joins ways that share endpoint node ids into the single chain containing the point nearest `near`.
  - Fixture mode: `STREETBAND_FIXTURES=1` returns the canned Pedro II el Católico band (the three-point line from the prototype) without network.

- [ ] **Step 1: Write the failing tests** (pure merge only — the HTTP path follows `OverpassClient`'s existing untested-by-unit pattern)

```csharp
using Ebrostay.Api.Services;

public class StreetBandServiceTests
{
    private static (long, GeoPoint) N(long id, double lat, double lng) => (id, new GeoPoint(lat, lng));

    [Fact]
    public void Merges_two_ways_sharing_an_endpoint_node()
    {
        var chain = StreetBandService.MergeChains(
            [[N(1, 0, 0), N(2, 0, 1)], [N(2, 0, 1), N(3, 0, 2)]],
            new GeoPoint(0, 0.5));
        Assert.Equal([1L, 2L, 3L], chain.Select(x => x.Item1).ToList());
    }

    [Fact]
    public void Reverses_a_way_when_its_tail_matches()
    {
        var chain = StreetBandService.MergeChains(
            [[N(1, 0, 0), N(2, 0, 1)], [N(3, 0, 2), N(2, 0, 1)]],
            new GeoPoint(0, 0));
        Assert.Equal([1L, 2L, 3L], chain.Select(x => x.Item1).ToList());
    }

    [Fact]
    public void Disconnected_same_name_ways_keep_only_the_near_chain()
    {
        var chain = StreetBandService.MergeChains(
            [[N(1, 0, 0), N(2, 0, 1)], [N(8, 5, 5), N(9, 5, 6)]],
            new GeoPoint(0, 0));
        Assert.Equal([1L, 2L], chain.Select(x => x.Item1).ToList());
    }
}
```

- [ ] **Step 2: Run to verify failure** — filter `StreetBandService`.
- [ ] **Step 3: Implement the service**

```csharp
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Ebrostay.Api.Models;

namespace Ebrostay.Api.Services;

/// Derives the ADR-041 street band from OSM. Three Overpass queries at save
/// time, zero at read time (the result is stored on the document):
///   1. named highway ways within 40 m of the pin → nearest = the street;
///   2. same-named ways within 600 m → merged into one chain;
///   3. other-named highway ways within 600 m → their node ids mark junctions.
/// The host enters nothing; failure returns null and the listing degrades
/// (rounded summary point, no public map) until the next save or read retries.
public sealed class StreetBandService(
    IHttpClientFactory factory, ILogger<StreetBandService> log)
{
    private const string Endpoint = "https://overpass-api.de/api/interpreter";
    private const double InsetMetres = 10;   // ADR-041 point 3: never on a junction node

    private static bool Fixtures =>
        Environment.GetEnvironmentVariable("STREETBAND_FIXTURES") == "1";

    public async Task<StreetBand?> DeriveAsync(
        string listingId, double lat, double lng, CancellationToken ct)
    {
        if (Fixtures)
            return Build(listingId,
                [(1, new GeoPoint(41.65476, -0.9077912)),
                 (2, new GeoPoint(41.65393, -0.90783)),
                 (3, new GeoPoint(41.6531047, -0.9078604))],
                [], new GeoPoint(lat, lng), "Calle de Pedro II El Católico");

        try
        {
            var near = await QueryWaysAsync(
                $"way(around:40,{Inv(lat)},{Inv(lng)})[\"highway\"][\"name\"];", ct);
            if (near.Count == 0) return Fail(listingId, "no named street within 40 m");

            var street = near
                .OrderBy(w => BandGeometry.ProjectDistanceProxy(w.Points, new GeoPoint(lat, lng)))
                .First();

            var sameName = await QueryWaysAsync(
                $"way(around:600,{Inv(lat)},{Inv(lng)})[\"highway\"][\"name\"=\"{Escape(street.Name)}\"];", ct);
            var chain = MergeChains(
                sameName.Select(w => w.Nodes).ToList(), new GeoPoint(lat, lng));

            var others = await QueryNodeIdsAsync(
                $"way(around:600,{Inv(lat)},{Inv(lng)})[\"highway\"][\"name\"!=\"{Escape(street.Name)}\"];", ct);

            return Build(listingId, chain, others, new GeoPoint(lat, lng), street.Name);
        }
        catch (Exception e) when (e is HttpRequestException
            or TaskCanceledException or JsonException or OrsUnavailableException)
        {
            log.LogWarning(e, "street band derivation failed for {Id}", listingId);
            return null;
        }
    }

    private StreetBand? Fail(string id, string why)
    {
        log.LogWarning("street band derivation failed for {Id}: {Why}", id, why);
        return null;
    }

    internal StreetBand? Build(
        string listingId, List<(long NodeId, GeoPoint P)> chain,
        HashSet<long> junctionNodeIds, GeoPoint home, string? streetName)
    {
        if (chain.Count < 2) return Fail(listingId, "street chain too short");
        var line = chain.Select(x => x.P).ToList();
        var len = BandGeometry.Length(line);
        var homeArc = BandGeometry.ProjectArc(line, home);

        // Arc-length of every point whose node id belongs to another street.
        var junctionArcs = new List<double>();
        double walked = 0;
        for (var i = 0; i < chain.Count; i++)
        {
            if (i > 0) walked += OverpassClient.Haversine(
                chain[i - 1].P.Lat, chain[i - 1].P.Lng, chain[i].P.Lat, chain[i].P.Lng);
            if (junctionNodeIds.Contains(chain[i].NodeId)) junctionArcs.Add(walked);
        }

        var (fromM, toM) = BandGeometry.CutSegment(
            len, homeArc, BandGeometry.OffsetFraction(listingId), [.. junctionArcs]);
        var segment = BandGeometry.Slice(line, fromM, toM);

        var mid = BandGeometry.MoveAlong(segment, BandGeometry.Length(segment) / 2);
        var sampleA = BandGeometry.MoveAlong(segment, InsetMetres);
        var reversed = segment.AsEnumerable().Reverse().ToList();
        var sampleB = BandGeometry.MoveAlong(reversed, InsetMetres);

        return new StreetBand(
            [.. segment.Select(p => new BandPoint(p.Lat, p.Lng))],
            mid.Lat, mid.Lng,
            new BandPoint(sampleA.Lat, sampleA.Lng),
            new BandPoint(sampleB.Lat, sampleB.Lng),
            streetName,
            DateTimeOffset.UtcNow.ToString("o"));
    }

    internal static List<(long, GeoPoint)> MergeChains(
        List<List<(long, GeoPoint)>> ways, GeoPoint near)
    {
        if (ways.Count == 0) return [];

        // Start from the way containing the point closest to `near`.
        var chain = new LinkedList<(long, GeoPoint)>(ways
            .OrderBy(w => w.Min(x => OverpassClient.Haversine(
                near.Lat, near.Lng, x.Item2.Lat, x.Item2.Lng)))
            .First());
        var rest = ways.Where(w => !ReferenceEquals(w, null))
            .Where(w => w.Count > 0 && w[0].Item1 != chain.First!.Value.Item1)
            .ToList();
        rest.RemoveAll(w => w.SequenceEqual(chain));

        // Repeatedly append/prepend any way sharing an endpoint node id,
        // reversing it when its tail is what matches.
        bool grew = true;
        while (grew)
        {
            grew = false;
            for (var i = rest.Count - 1; i >= 0; i--)
            {
                var w = rest[i];
                var head = chain.First!.Value.Item1;
                var tail = chain.Last!.Value.Item1;
                List<(long, GeoPoint)>? add = null;
                var append = false;
                if (w[0].Item1 == tail) { add = w; append = true; }
                else if (w[^1].Item1 == tail) { add = [.. Enumerable.Reverse(w)]; append = true; }
                else if (w[^1].Item1 == head) { add = w; }
                else if (w[0].Item1 == head) { add = [.. Enumerable.Reverse(w)]; }
                if (add is null) continue;

                if (append)
                    foreach (var x in add.Skip(1)) chain.AddLast(x);
                else
                    foreach (var x in Enumerable.Reverse(add).Skip(1)) chain.AddFirst(x);
                rest.RemoveAt(i);
                grew = true;
            }
        }
        return [.. chain];
    }

    // -- Overpass plumbing ---------------------------------------------------

    private sealed record StreetWay(
        string Name, List<(long NodeId, GeoPoint P)> Nodes, List<GeoPoint> Points);

    /// POST one QL statement, `out body geom;` — each way arrives with parallel
    /// "nodes" (ids) and "geometry" (coords) arrays in the same order.
    /// Error handling mirrors OverpassClient.QueryAsync: non-2xx and a
    /// 200-with-"remark" throw OrsUnavailableException.
    private async Task<List<StreetWay>> QueryWaysAsync(string selector, CancellationToken ct)
    {
        using var doc = await PostAsync(
            $"[out:json][timeout:12];({selector});out body geom;", ct);
        var ways = new List<StreetWay>();
        foreach (var el in doc.RootElement.GetProperty("elements").EnumerateArray())
        {
            if (!el.TryGetProperty("geometry", out var geom)) continue;
            if (!el.TryGetProperty("nodes", out var nodeIds)) continue;
            var name = el.GetProperty("tags").GetProperty("name").GetString() ?? "";
            var nodes = new List<(long, GeoPoint)>();
            var ids = nodeIds.EnumerateArray().ToArray();
            var pts = geom.EnumerateArray().ToArray();
            for (var i = 0; i < Math.Min(ids.Length, pts.Length); i++)
                nodes.Add((ids[i].GetInt64(), new GeoPoint(
                    pts[i].GetProperty("lat").GetDouble(),
                    pts[i].GetProperty("lon").GetDouble())));
            if (nodes.Count >= 2)
                ways.Add(new StreetWay(name, nodes, [.. nodes.Select(n => n.Item2)]));
        }
        return ways;
    }

    /// Same POST with `out body;` (no geometry) — only the node ids matter:
    /// any id shared with the street chain marks a junction.
    private async Task<HashSet<long>> QueryNodeIdsAsync(string selector, CancellationToken ct)
    {
        using var doc = await PostAsync(
            $"[out:json][timeout:12];({selector});out body;", ct);
        var ids = new HashSet<long>();
        foreach (var el in doc.RootElement.GetProperty("elements").EnumerateArray())
            if (el.TryGetProperty("nodes", out var nodeIds))
                foreach (var n in nodeIds.EnumerateArray())
                    ids.Add(n.GetInt64());
        return ids;
    }

    private async Task<JsonDocument> PostAsync(string ql, CancellationToken ct)
    {
        var http = factory.CreateClient("overpass");
        using var res = await http.PostAsync(Endpoint,
            new StringContent(ql, Encoding.UTF8, "text/plain"), ct);
        if (!res.IsSuccessStatusCode)
            throw new OrsUnavailableException($"overpass_{(int)res.StatusCode}");
        var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        if (doc.RootElement.TryGetProperty("remark", out _))
        {
            doc.Dispose();
            throw new OrsUnavailableException("overpass_degraded");
        }
        return doc;
    }

    private static string Inv(double d) =>
        d.ToString(System.Globalization.CultureInfo.InvariantCulture);
    private static string Escape(string s) => s.Replace("\"", "\\\"");
}
```

Also add to `BandGeometry` (Task 2's file, no new test needed — it is `ProjectArc`'s distance, exposed): `internal static double ProjectDistanceProxy(IReadOnlyList<GeoPoint> line, GeoPoint p)` returning the `best` distance the `ProjectArc` loop already computes (refactor `ProjectArc` to share the loop rather than duplicating it).

The two `...` bodies are the mechanical halves described in their comments — `MergeChains` is fully specified by its three tests, and the Overpass plumbing mirrors `OverpassClient.QueryAsync` (`api/Services/OverpassClient.cs:117-157`) with the two output modes named above. Register in `Program.cs` next to the other services: `services.AddSingleton<StreetBandService>();`.

- [ ] **Step 4: Run to verify pass** — merge tests green; `~/.dotnet/dotnet build api` green.
- [ ] **Step 5: Commit** — subject: `feat(api): the band derives from OSM — the host types nothing`.

---

### Task 5: C# derivation hooks + multi-origin matrix + reach bands

Wire derivation into the save path; extend the matrix so public reach figures become door-safe ranges at **no extra ORS cost** (one matrix call carries multiple sources).

**Files:**
- Modify: `api/Services/OrsClient.cs` (`MatrixAsync` gains multi-origin)
- Modify: `api/Models/NearbyModels.cs` (`ReachBand` + field on `NearbyEntry`)
- Modify: `api/Functions/HostFunctions.cs` (`HostDetailsUpdate`)
- Modify: `api/Functions/PropertiesFunctions.cs` (lazy backfill in `PropertyGet`)
- Test: `api/Ebrostay.Api.Tests/ReachBandTests.cs`

**Interfaces:**
- `OrsClient`: add overload `Task<NearbyReach?[][]> MatrixAsync(IReadOnlyList<GeoPoint> origins, IReadOnlyList<GeoPoint> destinations, string profile, CancellationToken ct)` — result indexed `[origin][destination]`; body sends `sources = [0..origins.Count)`, destinations after; the existing single-origin method delegates to it. Fixture mode returns the same canned values for every origin, except origin index 1 gets `Minutes + 1` and origin 2 gets `Minutes + 2` so range logic is exercisable.
- `NearbyModels.cs`:

```csharp
/// Door-safe public range for one profile (ADR-041 point 3 applied to the
/// eager reach figures, not only the on-click routes). Min/max over the two
/// inset segment ends AND the door — the door can fall outside the end pair.
public record ReachBand(int MinMinutes, int MaxMinutes);
```

  `NearbyEntry` gains `Dictionary<string, ReachBand>? ReachBands = null` (last positional param with default; legacy documents deserialize with null).
- Pure helper (new `static class ReachBands` in `NearbyModels.cs`):

```csharp
public static ReachBand? Merge(params NearbyReach?[] samples)
{
    var mins = samples.Where(s => s is not null).Select(s => s!.Minutes).ToArray();
    return mins.Length == 0 ? null : new ReachBand(mins.Min(), mins.Max());
}
```

- [ ] **Step 1: Write the failing tests**

```csharp
using Ebrostay.Api.Models;

public class ReachBandTests
{
    [Fact]
    public void Merges_min_and_max_over_all_samples()
        => Assert.Equal(new ReachBand(3, 7), ReachBands.Merge(
            new NearbyReach(400, 5), new NearbyReach(300, 3), new NearbyReach(500, 7)));

    [Fact]
    public void Door_outside_the_end_pair_still_bounds_the_band()
        => Assert.Equal(new ReachBand(5, 9), ReachBands.Merge(
            new NearbyReach(1, 5), new NearbyReach(1, 6), new NearbyReach(1, 9)));

    [Fact]
    public void Unroutable_samples_are_skipped_and_all_null_is_null()
    {
        Assert.Equal(new ReachBand(4, 4), ReachBands.Merge(null, new NearbyReach(1, 4), null));
        Assert.Null(ReachBands.Merge(null, null));
    }
}
```

- [ ] **Step 2: Run to verify failure**, **Step 3: implement `ReachBands.Merge` + the `MatrixAsync` overload**, **Step 4: tests + `dotnet build api` green.**

- [ ] **Step 5: Wire `HostDetailsUpdate`** (`api/Functions/HostFunctions.cs:209-477`) — inject `StreetBandService bands` into the class; then:

```csharp
// After `pinMoved` is computed (line ~231) and doc fields are assigned:
// the band derives from the pin, so it re-derives exactly when the pin
// moves — or when a legacy document has none yet.
if (pinMoved || doc.Band is null)
    doc.Band = await bands.DeriveAsync(
        doc.Id, update.Lat, update.Lng, req.HttpContext.RequestAborted);
```

In the `needsMeasuring` block (line ~379), replace the single-origin matrix with three origins when a band exists:

```csharp
var door = new GeoPoint(update.Lat, update.Lng);
var origins = doc.Band is null
    ? new[] { door }
    : new[] { door,
        new GeoPoint(doc.Band.SampleA.Lat, doc.Band.SampleA.Lng),
        new GeoPoint(doc.Band.SampleB.Lat, doc.Band.SampleB.Lng) };
// measured[prof] = await ors.MatrixAsync(origins, points, prof, ...);
// per entry i: Reach (owner-exact) stays measured[prof][0][k] — unchanged
// meaning; ReachBands[prof] = ReachBands.Merge(measured[prof][0][k],
// measured[prof][1][k], measured[prof][2][k]) when origins.Length == 3.
```

Carry-over rule: an entry whose figures are reused (`known is not null && !moved && !pinMoved`) also carries `ReachBands` over, same as `Reach`. Cache invalidation: the existing `pinMoved → cache.DropAsync` already covers band changes (the band only changes when the pin moves).

- [ ] **Step 6: Lazy backfill in `PropertyGet`** (`api/Functions/PropertiesFunctions.cs:62-109`) — inject `StreetBandService bands`; after the point read, before projecting:

```csharp
// ADR-041 backfill: a published listing saved before the band existed heals
// on first read. Best-effort — a failure leaves the degraded projection
// (rounded point, no public map) rather than failing the request.
if (doc.Status == "published" && doc.Band is null)
{
    doc.Band = await bands.DeriveAsync(doc.Id, doc.Lat, doc.Lng,
        req.HttpContext.RequestAborted);
    if (doc.Band is not null)
        try { await Properties.UpsertItemAsync(doc, new PartitionKey(doc.Id)); }
        catch (CosmosException e) { logger.LogWarning(e, "band backfill write failed for {Id}", id); }
}
```

- [ ] **Step 7: Build + full API test run green. Commit** — subject: `feat(api): the save derives the band and measures from three origins at once`.

---

### Task 6: C# public projections — the choke point flips

**Files:**
- Modify: `api/Models/PublicModels.cs`
- Test: `api/Ebrostay.Api.Tests/PublicProjectionBandTests.cs`

**Interfaces (the new public contract — Tasks 8/11 mirror it in TS/fixtures):**

```csharp
// PropertySummary: Lat/Lng KEEP their names but change meaning — the band
// midpoint, or the coordinate rounded to 3 decimals (~110 m) when no band
// exists. Never the door.
// PropertyDetail: Address, Lat, Lng are REMOVED; adds:
//   double[][]? Band           — the public segment as [lat, lng] pairs
//                                (null = degraded). double[][], NOT BandPoint[]:
//                                the TS side and the e2e fixtures use tuple
//                                pairs, and the camelCase serializer would
//                                emit BandPoint as {lat, lng} objects. The
//                                projection flattens:
//                                p.Band?.Line.Select(b => new[] { b.Lat, b.Lng })
// PublicNearby.Reach type changes to Dictionary<string, PublicReach>:
public record PublicReach(int MinMinutes, int MaxMinutes, int Metres);
// Metres is the door figure rounded to the nearest 50 m — coarse enough to
// mark nothing, kept because the UI shows "· 400 m" beside the minutes.
```

- [ ] **Step 1: Write the failing tests**

```csharp
using Ebrostay.Api.Models;

public class PublicProjectionBandTests
{
    private static PropertyDoc Doc(StreetBand? band) => new()
    {
        Id = "p1", Status = "published", Name = "Pedro II el Católico — Universidad",
        Address = "Pedro II el Católico 3, Zaragoza",
        Lat = 41.65393, Lng = -0.90783, Band = band,
        Nearby = [new NearbyEntry("n1", "transport", "tram", null, "Gran Vía",
            41.6521, -0.90512,
            new() { ["foot"] = new NearbyReach(423, 6) }, null, null, false)
            with { ReachBands = new() { ["foot"] = new ReachBand(4, 6) } }],
    };

    private static StreetBand Band => new(
        [new(41.65476, -0.90779), new(41.6531, -0.90786)],
        41.65393, -0.907825,
        new(41.65467, -0.90779), new(41.65319, -0.90786),
        "Calle de Pedro II El Católico", "2026-08-07T00:00:00Z");

    [Fact]
    public void Summary_ships_the_midpoint_not_the_door()
    {
        var s = PublicProjection.ToSummary(Doc(Band), DateTimeOffset.UtcNow);
        Assert.Equal(41.65393, s.Lat, 6);      // midpoint happens to be close…
        Assert.Equal(-0.907825, s.Lng, 6);     // …but comes from Band.Mid*
    }

    [Fact]
    public void Summary_without_a_band_rounds_to_three_decimals()
    {
        var s = PublicProjection.ToSummary(Doc(null), DateTimeOffset.UtcNow);
        Assert.Equal(41.654, s.Lat, 6);
        Assert.Equal(-0.908, s.Lng, 6);
    }

    [Fact]
    public void Detail_carries_the_band_and_no_address_or_door()
    {
        var d = PublicProjection.ToDetail(Doc(Band), DateTimeOffset.UtcNow, 249);
        Assert.NotNull(d.Band);
        Assert.Equal(2, d.Band!.Length);
        Assert.Equal([41.65476, -0.90779], d.Band[0]); // [lat, lng] pairs on the wire
        // Address/Lat/Lng do not exist on the type anymore — this test is the
        // compile-time proof; nothing to assert at runtime.
    }

    [Fact]
    public void Reach_projects_as_a_range_with_coarse_metres()
    {
        var d = PublicProjection.ToDetail(Doc(Band), DateTimeOffset.UtcNow, 249);
        var reach = d.Nearby[0].Reach["foot"];
        Assert.Equal(4, reach.MinMinutes);
        Assert.Equal(6, reach.MaxMinutes);
        Assert.Equal(400, reach.Metres); // 423 → nearest 50
    }

    [Fact]
    public void Legacy_entry_without_bands_degrades_to_a_flat_range()
    {
        var doc = Doc(Band);
        doc.Nearby = [doc.Nearby[0] with { ReachBands = null }];
        var d = PublicProjection.ToDetail(doc, DateTimeOffset.UtcNow, 249);
        Assert.Equal(new PublicReach(6, 6, 400), d.Nearby[0].Reach["foot"]);
    }
}
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — in `PublicModels.cs`:
  - `PropertySummary` unchanged shape; `ToSummary` computes:

```csharp
var (lat, lng) = p.Band is not null
    ? (p.Band.MidLat, p.Band.MidLng)
    : (Math.Round(p.Lat, 3), Math.Round(p.Lng, 3));
```

  - `PropertyDetail`: delete the `Address`, `Lat`, `Lng` positional params; add `BandPoint[]? Band` (place it where `Address` was, so the parameter list stays readable); `ToDetail` passes `p.Band?.Line`.
  - `PublicNearby.Reach` becomes `Dictionary<string, PublicReach>`; projection per profile:

```csharp
static Dictionary<string, PublicReach> ToPublicReach(NearbyEntry n) =>
    n.Reach.ToDictionary(kv => kv.Key, kv => new PublicReach(
        n.ReachBands?.GetValueOrDefault(kv.Key)?.MinMinutes ?? kv.Value.Minutes,
        n.ReachBands?.GetValueOrDefault(kv.Key)?.MaxMinutes ?? kv.Value.Minutes,
        (int)(Math.Round(kv.Value.Metres / 50.0) * 50)));
```

- [ ] **Step 4: Tests green; whole API test suite green** (`ListingVisibilityTests` etc. may construct `PropertyDetail` — fix call sites the compiler flags).
- [ ] **Step 5: Commit** — subject: `feat(api): the public projection forgets the door`.

---

### Task 7: C# band route endpoints — merged ranges, fan-and-trunk

**Files:**
- Modify: `api/Models/NearbyModels.cs` (`BandRouteDoc`)
- Modify: `api/Services/OrsClient.cs` (`RouteAsync` gains `bool simplify = true` — band boundary routes need unsimplified geometry or the fork points won't coincide; pass `geometry_simplify = simplify` in the body)
- Modify: `api/Services/RouteCache.cs` (`GetBandAsync`)
- Modify: `api/Functions/NearbyFunctions.cs` (`PropertyNearbyRoute`, `PropertyPlaceRoute`)
- Test: covered by Tasks 1–3 (pure parts); endpoint wiring is verified by build + the e2e fixtures in Task 11.

**Interfaces:**
- New cache doc (same container/partition as `NearbyRouteDoc`, so `DropAsync` keeps covering it; the id prefix keeps old-shape docs from ever being read):

```csharp
public record BandRouteDoc(
    string Id,            // "band-{entryId}-{profile}"
    string PropertyId,
    string Profile,
    string TrunkPolyline, // "" when the boundary routes never converge
    string StubAPolyline,
    string StubBPolyline,
    int MinMinutes, int MaxMinutes,   // outward-rounded over door + both ends
    int MinMetres, int MaxMetres,     // min/max over all three, rounded to 10 m outward
    string FetchedAt);
```

- Both anonymous route endpoints answer:

```json
{ "minutes": [4, 6], "metres": [340, 520], "trunk": "<poly5>", "stubA": "<poly5>", "stubB": "<poly5>" }
```

- `RouteCache.GetBandAsync(PropertyDoc property, string entryId, string profile, CancellationToken ct)` → `BandRouteDoc?` (null = unknown entry id, same as today). Computation on a cache miss:

```csharp
// Three routes. The DOOR route is called with simplify: true — its geometry
// is discarded unread; only seconds/metres survive, inside the merged range.
var band = property.Band!; // caller guarantees non-null (404s otherwise)
var to = new GeoPoint(entry.Lat, entry.Lng);
var a = await ors.RouteAsync(new GeoPoint(band.SampleA.Lat, band.SampleA.Lng), to, profile, ct, simplify: false);
var b = await ors.RouteAsync(new GeoPoint(band.SampleB.Lat, band.SampleB.Lng), to, profile, ct, simplify: false);
var door = await ors.RouteAsync(new GeoPoint(property.Lat, property.Lng), to, profile, ct);

var (trunk, stubA, stubB) = RouteSplitter.Split(
    Polyline5.Decode(a.Polyline), Polyline5.Decode(b.Polyline));

int[] secs = [a.Seconds, b.Seconds, door.Seconds];
int[] metres = [a.Metres, b.Metres, door.Metres];
var doc = new BandRouteDoc($"band-{entryId}-{profile}", property.Id, profile,
    Polyline5.Encode(trunk), Polyline5.Encode(stubA), Polyline5.Encode(stubB),
    (int)Math.Floor(secs.Min() / 60.0), (int)Math.Ceiling(secs.Max() / 60.0),
    metres.Min() / 10 * 10, (metres.Max() + 9) / 10 * 10,
    DateTimeOffset.UtcNow.ToString("o"));
```

  Cache read/write plumbing is identical to the existing `GetAsync` (`RouteCache.cs:27-77`) with the new id. Keep `GetAsync` for now — `HostNearbyPreviewRoute` (owner) still uses exact single routes; delete nothing owner-facing.
- `PropertyNearbyRoute` (`NearbyFunctions.cs:125-168`): after `LoadVisibleAsync`, add `if (doc.Band is null) return new NotFoundResult();` (degraded listings show no public map, so no route is ever requested; a hand-crafted request gets the same 404 as an unknown entry — it must not learn why). Replace the `cache.GetAsync` call + response body with `GetBandAsync` + the JSON shape above. Same for `PropertyPlaceRoute` (`:194-236`): inline the same three-route computation (it stays uncached, per its ADR-039 privacy comment — extract the computation into a shared `RouteCache.ComputeBandAsync(PropertyDoc, GeoPoint to, string profile, CancellationToken)` used by both, so the merge logic exists once). Note in a comment: **3 ORS calls per uncached band route** — `OrsBudget` already caps and fails closed; the browser-side cache (`app/lib/places.ts`) is what keeps real usage flat.
- Fixture mode: `RouteAsync` under `ORS_FIXTURES=1` currently returns one canned polyline; make it return a second, partially-overlapping canned polyline when `simplify == false` and the origin's latitude ends in an odd 1e-6 digit — **no**: keep it simple and deterministic instead — under fixtures `ComputeBandAsync` short-circuits before calling ORS and returns a canned `BandRouteDoc` (`trunk` = the existing canned polyline, `stubA`/`stubB` = its first two points re-encoded, minutes `[4, 6]`, metres `[340, 400]`). One canned shape, no cleverness.

- [ ] **Step 1: Implement all of the above.**
- [ ] **Step 2: `~/.dotnet/dotnet build api` green; full `dotnet test` green.**
- [ ] **Step 3: Manual smoke** — `cd api && ORS_FIXTURES=1 STREETBAND_FIXTURES=1 func start`, then `curl localhost:7071/api/properties/<seed-id>/nearby/<entryId>/route?profile=foot` → the new JSON shape.
- [ ] **Step 4: Commit** — subject: `feat(api): route answers become bands — a fan at the street, one line beyond`.

---

### Task 8: TS contract + pure logic — `RouteBand`, `PublicReach`, formula names, cached routes

**Files:**
- Modify: `app/lib/api.ts` (`:71-132` types, `:520` `RouteLine`, fetchers `:581-621`)
- Create: `app/lib/publicName.ts` + `app/lib/publicName.test.ts`
- Modify: `app/lib/places.ts` (`:58-65` `CachedRoute`, validation `:159`)
- Modify: `app/lib/places.test.ts` (cached shape), `app/lib/api.test.ts` untouched
- Modify: `app/lib/nearby.ts` (no change to the decoder; it already handles any poly5)

**Interfaces (mirrors Task 6/7 exactly):**

```ts
// api.ts — replaces RouteLine (delete the old type; the compiler finds users):
export type RouteBand = {
  minutes: [number, number];
  metres: [number, number];
  trunk: string;   // encoded polyline5, "" when the ends never converge
  stubA: string;
  stubB: string;
};
export type PublicReach = { minMinutes: number; maxMinutes: number; metres: number };
export type PublicNearbyEntry = { /* lat/lng/name/… unchanged */ reach: Record<string, PublicReach> };
// PropertySummary: lat/lng stay (now the midpoint — no client change needed).
// PropertyDetail: remove `address`, remove inherited lat/lng via the Omit
// (change the base to Omit<PropertySummary, "coverUrl"|"coverCardUrl"|"coverDetailUrl"|"lat"|"lng">),
// add:  band: [number, number][] | null;
// fetchNearbyRoute / fetchPlaceRoute return RouteBand.
```

```ts
// publicName.ts — OD-10: formula name from the typed street + area.
// "Calle de Pedro II el Católico 3" + "Universidad" → "Pedro II el Católico — Universidad"
export function formulaName(street: string | null, areaEs: string | null): string;
```

```ts
// places.ts — CachedRoute becomes the band shape; parseRoutes REJECTS the old
// shape (old localStorage entries fail validation and are silently dropped —
// that IS the migration).
type CachedRoute = { minutes: [number, number]; metres: [number, number];
  trunk: string; stubA: string; stubB: string; at: number };
```

- [ ] **Step 1: Write the failing `publicName` tests**

```ts
import { describe, expect, it } from "vitest";
import { formulaName } from "@/lib/publicName";

describe("formulaName (OD-10)", () => {
  it("strips the calle prefix and the house number, appends the area", () => {
    expect(formulaName("Calle de Pedro II el Católico 3", "Universidad"))
      .toBe("Pedro II el Católico — Universidad");
    expect(formulaName("Pedro II el Católico 3", "Universidad"))
      .toBe("Pedro II el Católico — Universidad");
  });
  it("keeps meaningful road types", () => {
    expect(formulaName("Avenida de Madrid 120", "Delicias"))
      .toBe("Avenida de Madrid — Delicias");
  });
  it("handles unit suffixes and nº forms", () => {
    expect(formulaName("Calle Cortes de Aragón 5-7, 2º Izq", "Centro"))
      .toBe("Cortes de Aragón — Centro");
    expect(formulaName("C/ Delicias nº 12", "Delicias"))
      .toBe("Delicias — Delicias");
  });
  it("degrades gracefully", () => {
    expect(formulaName("Gran Vía", null)).toBe("Gran Vía");
    expect(formulaName(null, "Centro")).toBe("");
    expect(formulaName("  ", "Centro")).toBe("");
  });
});
```

- [ ] **Step 2: `cd app && npm test -- publicName` — fails (module missing).**
- [ ] **Step 3: Implement**

```ts
// app/lib/publicName.ts
// OD-10 (decision log): the public name is a formula — street without number
// + neighbourhood — prefilled in the editor; the owner may override.
export function formulaName(street: string | null, areaEs: string | null): string {
  if (!street) return "";
  let s = street.trim();
  s = s.replace(/^(calle|c\.|c\/)\s+(de\s+la\s+|de\s+los\s+|del\s+|de\s+)?/i, "");
  // Drop everything from the first house-number-ish token on: "3", "5-7",
  // "nº 12", and any unit tail after it ("2º Izq").
  s = s.replace(/[,\s]+(n[ºo°]?\s*)?\d.*$/i, "");
  s = s.trim().replace(/[,\s]+$/, "");
  if (!s) return "";
  const area = areaEs?.trim();
  return area ? `${s} — ${area}` : s;
}
```

- [ ] **Step 4: `npm test -- publicName` green.**
- [ ] **Step 5: Apply the `api.ts` and `places.ts` type changes above; update `places.test.ts` fixtures to the new `CachedRoute` shape and add one case: an old-shape entry (`{polyline, metres: 340, seconds: 260, at}`) is dropped by `parseRoutes`. Run the full `npm test` — everything except not-yet-updated UI compiles because vitest only covers `app/lib`; `npm run build` is expected RED here (UI still uses old fields) and goes green in Task 9.**
- [ ] **Step 6: Commit** — subject: `feat(app): the contract flips — bands in, door out` (note in the body that `npm run build` is intentionally red until the UI task lands; keep both commits on the same push).

---

### Task 9: TS detail UI — plate out, band in, fan-and-trunk, ranges

**Files:**
- Modify: `app/app/[locale]/property/page.tsx` (`:245-274` copy state/handler out, `:377` share, `:416-422` header, `:561-646` plate, `:659-668` map props, `:713-739` nearby/places wiring)
- Modify: `app/components/detail/NeighbourhoodMap.tsx`
- Modify: `app/components/detail/Nearby.tsx` (`:87`, `:163-180`, `:304-307`)
- Modify: `app/components/detail/YourPlaces.tsx` (`:156`, `:281-284`, `:366-369`)
- Modify: `app/app/globals.css` (band + stub classes)
- Modify: `app/messages/es.json`, `app/messages/en.json`

**Interfaces:**
- `NeighbourhoodMap` props change to:

```ts
export type NeighbourhoodMapProps = {
  band: [number, number][];        // replaces home {lat,lng}
  bandLabel: string;               // "El piso está en esta calle"
  mapLabel: string;
  destination: NeighbourhoodMapDestination | null;
  route: RouteBand | null;         // replaces routePolyline: string | null
  routePending?: boolean;
  recentre?: number;
  className?: string;
};
```

- `Nearby`/`YourPlaces` `onRoute` callbacks change their second parameter from `polyline: string | null` to `route: RouteBand | null`; the page's `drawRoute` (`page.tsx:204`) stores the whole `RouteBand`.

- [ ] **Step 1: Messages, both locales** (es shown; en analogous):

```jsonc
// REMOVE from "detail": addressLabel, addressShowOnMap, addressCopy, addressCopied
// ADD to "detail":
"streetBand": "El piso está en esta calle",
// CHANGE detail.nearby.subtitle.foot / .car: "…desde esta dirección." →
//   "…desde esta calle." (en: "from this address." → "from this street.")
// ADD to "detail.nearby":
"minutesRange": "{lo}–{hi} min",
// ADD to "detail.places":
"minutesRange": "{lo}–{hi} min"
```

- [ ] **Step 2: `NeighbourhoodMap`** — in the mount effect (`:78-110`): replace the home marker with the band; keep everything lazy:

```ts
// The band, not a pin (ADR-041): glow under line, river blue via CSS classes.
const bandLine: [number, number][] = band;
L.polyline(bandLine, { className: "street-band-glow", weight: 22, opacity: 0.16 }).addTo(map);
L.polyline(bandLine, { className: "street-band-line", weight: 5, opacity: 0.6 }).addTo(map);
const mid = bandLine[Math.floor(bandLine.length / 2)];
L.marker(mid, {
  interactive: false,
  icon: L.divIcon({ className: "", html: `<div class="street-band-label">${escapeHtml(bandLabel)}</div>` }),
}).addTo(map);
map.fitBounds(L.latLngBounds(bandLine).pad(0.3));
```

  (`escapeHtml`: the tiny existing pattern used for `escapeAttr` in `ResultsMap.tsx` — copy the same escaping approach; the label is our own message string, but escape anyway.) Route effect (`:184-204`) draws three polylines:

```ts
if (route) {
  for (const stub of [route.stubA, route.stubB])
    if (stub) L.polyline(decodePolyline(stub), {
      className: "nearby-route-stub", weight: 3.5, opacity: 0.55 }).addTo(layer);
  if (route.trunk) L.polyline(decodePolyline(route.trunk), {
    className: "nearby-route-line", weight: 4, opacity: 0.85 }).addTo(layer);
}
```

  `fitBounds`/recentre now use `L.latLngBounds(band)` where they used the home point. Add to `globals.css` next to `.nearby-route-line` (both themes are already token-driven there):

```css
.street-band-glow { stroke: var(--river-deep); }
.street-band-line { stroke: var(--river-deep); }
.street-band-label { /* pill: panel bg, 1px river-deep border, 12px 600 river-deep text,
                        border-radius 8px, padding 3px 8px, subtle shadow — match .map-marker's styling conventions */ }
.nearby-route-stub { stroke: var(--brand); } /* same hue as .nearby-route-line, lighter via opacity */
```

- [ ] **Step 3: `property/page.tsx`** —
  - Delete the plate block `:568-646`, the `copied` state + `copyAddress` `:245-274`, and the now-unused `Copy`/`Check` imports; keep `showOnMap`/`recentre` wired to a small "show on map" text button beside the section title (reuse `listing.showOnMap`).
  - Header `:416-422`: `p.name` stays (it becomes the formula name — a data change); the `MapPin` line keeps `{biText(p.area, locale)}, Zaragoza`.
  - Share `:377`: unchanged code — safe now because `p.name` no longer contains the address.
  - Map wiring `:659-668`: `band={p.band}`, `bandLabel={td("streetBand")}`, `route={mapRoute}` (state type `RouteBand | null`).
  - **Degraded gate:** wrap the whole `Section id="neighbourhood"` (map + `Nearby` + `YourPlaces`) in `{p.band && (…)}` — a listing without a band shows no location section at all; the area badge in the header still names the neighbourhood.
- [ ] **Step 4: `Nearby.tsx`** — `routes` record becomes `Record<string, RouteBand>`; hand-off `:176-180` passes the band; reach display `:304-307`:

```tsx
{reach.minMinutes === reach.maxMinutes
  ? t("minutes", { count: reach.maxMinutes })
  : t("minutesRange", { lo: reach.minMinutes, hi: reach.maxMinutes })}
{" · "}{formatDistance(reach.metres, locale)}
```

- [ ] **Step 5: `YourPlaces.tsx`** — `:156` result type `RouteBand`; `:281-284` passes the band; `:366-369`:

```tsx
{state.route.minutes[0] === state.route.minutes[1]
  ? t("minutes", { count: state.route.minutes[1] })
  : t("minutesRange", { lo: state.route.minutes[0], hi: state.route.minutes[1] })}
{" · "}{formatDistance(state.route.metres[1], locale)}
```

- [ ] **Step 6: `cd app && npm run build` — green again (this is the gate the red from Task 8 answers to). `npm test` green.**
- [ ] **Step 7: Commit** — subject: `feat(detail): the street replaces the door — band, ranges, fan-and-trunk`.

---

### Task 10: TS editor — OD-10 prefill

The wizard prefills the formula name once the address step is done and the name is still empty. Prefill only — never overwrite something typed.

**Files:**
- Modify: `app/lib/wizard.ts` (pure helper)
- Modify: `app/app/[locale]/host/new/page.tsx` (apply on step change)
- Modify: `app/components/host/fields/BasicsFields.tsx` (hint copy)
- Modify: `app/messages/es.json` / `en.json` (`host.edit.basics.nameHint`)
- Test: `app/lib/wizard.test.ts`

**Interfaces:**

```ts
// wizard.ts
import { formulaName } from "@/lib/publicName";
/** OD-10: the suggested public name, or null when there is nothing to suggest
 *  or the owner already typed one. */
export function suggestedName(listing: HostListing): string | null {
  if (listing.name.trim() !== "") return null;
  const s = formulaName(listing.address, listing.area?.es ?? null);
  return s === "" ? null : s;
}
```

- [ ] **Step 1: Failing tests in `wizard.test.ts`**

```ts
describe("suggestedName (OD-10)", () => {
  it("suggests the formula for an unnamed listing", () => {
    const l = { ...blankListing(), address: "Calle de Pedro II el Católico 3",
      area: { es: "Universidad", en: "University" } };
    expect(suggestedName(l)).toBe("Pedro II el Católico — Universidad");
  });
  it("never overrides a typed name", () => {
    const l = { ...blankListing(), name: "Mi piso", address: "Gran Vía 2" };
    expect(suggestedName(l)).toBeNull();
  });
  it("suggests nothing without an address", () => {
    expect(suggestedName(blankListing())).toBeNull();
  });
});
```

- [ ] **Step 2: red → implement → green.**
- [ ] **Step 3: Apply in the wizard** (`host/new/page.tsx`) — where the step advances away from the `"address"` step (the step-navigation handler), before rendering the basics step:

```ts
const suggestion = suggestedName(listing);
if (suggestion) setListing((l) => ({ ...l, name: suggestion }));
```

  Update `host.edit.basics.nameHint` in both locales to say the name is public and pre-filled from street + neighbourhood, and that the exact address is never shown to guests (es default, short sentences). The edit page gets no prefill — existing listings keep their names; renaming them is the rollout step below.
- [ ] **Step 4: `npm test` + `npm run build` green. Commit** — subject: `feat(host): the wizard suggests the formula name (OD-10)`.

---

### Task 11: e2e fixtures + spec run — the hermetic proof

**Files:**
- Modify: `app/e2e/fixtures/properties.json`, `property-detail.json`, `route.json`
- Modify: `app/e2e/pages.spec.ts` (`:100-104` stubs already match; assertions at `:160`, `:477`, `:533` reviewed)

- [ ] **Step 1: `properties.json`** — for each of the 4 summaries: `name` → `"Pedro II el Católico — Universidad"` (vary per listing: append nothing, they are distinct listings — use each listing's own street formula; keep `/Pedro II/`-matching names for `pedro1`), `lat`/`lng` → the band midpoint `41.65393, -0.907825`.
- [ ] **Step 2: `property-detail.json`** — delete `"address"`, `"lat"`, `"lng"`; add:

```json
"band": [[41.65476, -0.90779], [41.65393, -0.907825], [41.6531, -0.90786]],
```

  `name` → `"Pedro II el Católico — Universidad"`; every nearby entry's `reach` becomes `{"foot": {"minMinutes": 4, "maxMinutes": 6, "metres": 400}, "car": {…}}`.
- [ ] **Step 3: `route.json`** — the new contract:

```json
{
  "minutes": [4, 6],
  "metres": [340, 400],
  "trunk": "cse}Fbq_DcBwB{@kCkCcBoAkC",
  "stubA": "cse}Fbq_DcBwB",
  "stubB": "ese}Fdq_DaBuB"
}
```

- [ ] **Step 4: Review the spec assertions** — `:160` `/Pedro II/` still matches the formula name (keep); the saved-places tests (`:477`, `:533`) assert visible minute text — update expected strings to the range form (`4–6 min`) where they pinned the old single number.
- [ ] **Step 5: Run everything:**

```bash
cd app && npm test && npm run build && npm run test:e2e
```

```bash
~/.dotnet/dotnet test api/Ebrostay.Api.Tests
```

  All green, plus one manual full-stack smoke: `swa start app/out --api-location api` with `ORS_FIXTURES=1 STREETBAND_FIXTURES=1`, open `/es/property?id=<seed>`, confirm: no address anywhere on the page or in the payload (check the network tab: `/api/properties/<id>` has no `address`/`lat`/`lng`), band renders, a nearby click draws stubs + trunk, times show as ranges.
- [ ] **Step 6: Commit** — subject: `test(e2e): the fixtures forget the door too`.

---

### Task 12: Docs sync + rollout notes

**Files:**
- Modify: `docs/spec/02-data-model.md` (§2.2: `band` on the property document — the `StreetBand` record fields and the "derived, never typed" rule; `BandRouteDoc` beside `NearbyRouteDoc`; `ReachBands` on the nearby entry)
- Modify: `docs/spec/04-functional-flows.md` (the listing-page location flow: band + ranges + fan-and-trunk; the route endpoints' new response shape; the 404-when-no-band rule)
- Modify: `docs/BACKLOG.md` (tick the ADR-041 implementation entry; add the two rollout residues below)
- Modify: `docs/spec/05-decision-log.md` only if implementation deviated from ADR-041 (record the deviation under the ADR, dated)

**Rollout residues to record on the backlog (operational, not code):**
1. **Rename existing listings** — every current listing's `name` is its address; the owner (Raphael) renames them through the editor (the wizard prefill covers only new listings). Small inventory, minutes of work, but the public pages leak the door via the title until done — do this immediately after deploy.
2. **OD-9 remains open** — the exact address is released manually via WhatsApp/email today; the safer default until decided is "signed contract".
3. Existing published docs get their band lazily on first `PropertyGet` (Task 5); confirm each listing's band looks right in the owner preview after deploy (the ADR's owner-confirmation step for pre-existing listings).

- [ ] **Step 1: Apply the doc edits.**
- [ ] **Step 2: Commit** — subject: `docs(spec): the data model and flows learn the street band`.

---

## Self-review notes (run before handoff)

- **Spec coverage:** ADR-041 points 1–7 → Tasks 9 (text/plate), 4+9 (map band), 5+6+7 (ranges + door-in-sample-set), 4 (inset ~10 m), 3+7+9 (fan-and-trunk), 6+7 (API), OD-9 residue (after booking, Task 12). Segment rule + off-center + junction snap → Task 2. OSM derivation, zero host input → Task 4. Search midpoint → Task 6 (no client change, confirmed: `ResultsMap`/`mapCluster` consume `PropertySummary.lat/lng` as-is). Your-places fan-and-trunk → Task 7 (`ComputeBandAsync` shared). OD-10 formula + owner override → Tasks 8+10 (override = the same `name` field, already review-gated).
- **Known deviations to flag during execution, not silently accept:** if ORS unsimplified geometries still fail to share fork points exactly (different snapping per origin), fall back to splitting with a 15 m proximity tolerance in `RouteSplitter` — record the change in the task commit body.
- **Type consistency spot-checks:** `RouteBand` field names (`minutes`, `metres`, `trunk`, `stubA`, `stubB`) identical in Task 7 JSON, Task 8 TS, Task 11 fixture. `PublicReach` (`minMinutes`, `maxMinutes`, `metres`) identical in Tasks 6/8/11. Wire shape of the band: `double[][]` `[lat, lng]` pairs everywhere public (Task 6 flattens `BandPoint` in the projection; Task 8 types it `[number, number][]`; Task 11 fixture matches) — `BandPoint` objects exist only inside the stored document.

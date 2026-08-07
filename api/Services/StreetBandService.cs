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
            or TaskCanceledException or JsonException or OrsUnavailableException
            or KeyNotFoundException or InvalidOperationException)
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
        // Drop only the selected way itself (by content — it is the exact list
        // `chain` was seeded from). A way merely SHARING the chain's head node
        // id — a street split at a junction, each way drawn outward from that
        // shared node — is a legitimate merge candidate and must stay in
        // `rest` for the loop below to pick up.
        var rest = ways.Where(w => w is { Count: > 0 }).ToList();
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
            // A tagless (or nameless) way is not a usable street candidate —
            // dropped here, matching OverpassClient's own defensive style
            // (OverpassClient.cs:176-177), rather than throwing past DeriveAsync's
            // "never throws" boundary.
            if (!el.TryGetProperty("tags", out var tags)) continue;
            if (!tags.TryGetProperty("name", out var nameEl)) continue;
            var name = nameEl.GetString() ?? "";
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

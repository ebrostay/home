using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
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

    // The number of elements we ASK Overpass for, not the number we return.
    // Overpass's `out body N` truncates before our own distance sort runs, and
    // truncation order has no relationship to distance from the `around`
    // point — a small cap can silently drop the true nearest POIs in a dense
    // area. 200 gives our Haversine sort a real candidate set to work from.
    private const int QueryBudget = 200;

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

        // An empty result is never cached. We cannot tell "genuinely nothing
        // in this radius" apart from a degraded-but-200 Overpass answer with
        // no remark, so writing it would risk suppressing a whole group for
        // the cache's full TTL. Re-querying an empty cell occasionally is
        // far cheaper than that.
        if (pois.Length > 0)
        {
            try
            {
                await cache.UpsertItemAsync(
                    new NearbyCandidatesDoc(cell, cell, pois,
                        DateTimeOffset.UtcNow.ToString("o")),
                    new PartitionKey(cell), cancellationToken: ct);
            }
            catch (CosmosException e)
            {
                // A failed cache write must never fail the request — it only
                // means the next lookup asks again.
                log.LogWarning(e, "nearby candidate cache write failed for {Cell}", cell);
            }
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

        // qt (quadtile) order at least correlates with spatial locality, unlike
        // the default element order, which has no relationship to distance
        // from the `around` point.
        var ql = $"[out:json][timeout:12];({selectors});out body qt {QueryBudget};";

        var http = factory.CreateClient("overpass");
        HttpResponseMessage res;
        try
        {
            res = await http.PostAsync(Endpoint,
                new StringContent(ql, Encoding.UTF8, "text/plain"), ct);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // The client's own timeout fired, not the caller's token — the QL
            // asked Overpass for 12s and the "overpass" HttpClient is
            // configured to outlive that, but treat an abort here the same
            // graceful way as a non-2xx rather than letting it escape raw.
            throw new OrsUnavailableException("overpass_timeout");
        }
        using var _ = res;

        if (!res.IsSuccessStatusCode)
            throw new OrsUnavailableException($"overpass_{(int)res.StatusCode}");

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));

        if (doc.RootElement.TryGetProperty("remark", out var remarkEl))
        {
            // A 200 with a `remark` means Overpass hit a server-side timeout or
            // is overloaded — `elements` is then empty or partial, and that is
            // indistinguishable from a genuine "nothing here" unless we check
            // for this explicitly.
            log.LogWarning(
                "Overpass returned a degraded response for {Group} near {Lat},{Lng}: {Remark}",
                group, lat, lng, remarkEl.GetString());
            throw new OrsUnavailableException("overpass_degraded");
        }

        var found = new List<NearbyPoi>();
        foreach (var el in doc.RootElement.GetProperty("elements").EnumerateArray())
        {
            if (!el.TryGetProperty("tags", out var tags)) continue;
            if (!tags.TryGetProperty("name", out var nameEl)) continue;

            var name = nameEl.GetString();
            if (string.IsNullOrWhiteSpace(name)) continue;

            // Iterate the group's own tag list first, in its declared order,
            // so a node carrying more than one mapped tag (e.g. shop=bakery
            // AND amenity=cafe) classifies deterministically rather than by
            // whatever order the JSON serialiser happened to emit the tags in.
            string? type = null;
            foreach (var candidate in NearbyGroups.OverpassTags(group))
            {
                if (tags.TryGetProperty(candidate.Key, out var v)
                    && v.GetString() == candidate.Value)
                {
                    type = NearbyGroups.TypeOf(candidate.Key, candidate.Value);
                    break;
                }
            }
            // Fall back to scanning every tag only if none of the group's own
            // selectors matched — this covers nothing in practice today (every
            // node came back because it matched a selector), but keeps the
            // wider tag-to-type mapping doing the same job it always did.
            if (type is null)
            {
                foreach (var tag in tags.EnumerateObject())
                {
                    type = NearbyGroups.TypeOf(tag.Name, tag.Value.GetString() ?? "");
                    if (type is not null) break;
                }
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

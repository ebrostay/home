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

    /// The ceiling on what one group open returns. 30, not the 20 it was: the
    /// per-type quotas below need room to seat a tram and a station without
    /// evicting the bus stops an owner also legitimately wants. It costs
    /// nothing in ORS requests — a matrix is one request whether it carries 20
    /// destinations or 30 — and the editor shows three per type until the
    /// owner asks for more.
    private const int MaxPois = 30;

    /// Overpass drops requests when it is busy: a 504 whose body is an HTML
    /// page, or a 200 whose body carries a `remark`. Both are transient and
    /// neither is our fault, so the request is worth repeating before the
    /// owner is told the search failed — a measured 1 in 3 identical small
    /// queries came back 504 during one sampling.
    private const int Attempts = 3;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(700);
    private static readonly TimeSpan RateLimitDelay = TimeSpan.FromSeconds(3);

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

        var pois = await QueryWithRetryAsync(lat, lng, group, ct);

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

    /// One shot per attempt, with a short pause between. Only the transient
    /// failures are retried — a malformed query or a genuine empty answer
    /// would return the same thing three times, so those are not repeated.
    private async Task<NearbyPoi[]> QueryWithRetryAsync(
        double lat, double lng, string group, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await QueryAsync(lat, lng, group, ct);
            }
            catch (OrsUnavailableException e) when (attempt < Attempts)
            {
                log.LogWarning(
                    "Overpass attempt {Attempt}/{Total} for {Group} failed: {Reason}",
                    attempt, Attempts, group, e.Message);
                // 429 is Overpass's slot limiter, not a busy moment: coming
                // straight back in 700 ms is what earned it. Everything else
                // (504, a degraded 200) is transient load and clears fast.
                var pause = e.Message.EndsWith("429", StringComparison.Ordinal)
                    ? RateLimitDelay
                    : RetryDelay * attempt;
                await Task.Delay(pause, ct);
            }
        }
    }

    private async Task<NearbyPoi[]> QueryAsync(
        double lat, double lng, string group, CancellationToken ct)
    {
        var inv = System.Globalization.CultureInfo.InvariantCulture;

        // Each selector carries its OWN radius, so the tram is searched for
        // across 2.5 km in the same request that looks 800 m for a bus stop.
        // Each selector brings its own radius AND its own element type: `nwr`
        // for things OSM maps as areas (a park is never a node), `node` for
        // everything else, because asking for ways where there are none is
        // pure latency. `out center` below gives every way a representative
        // point, which is all a distance needs.
        var selectors = string.Concat(NearbyGroups.OverpassSelectors(group)
            .Select(t =>
                $"{t.Element}[\"{t.Key}\"=\"{t.Value}\"]"
                + $"(around:{t.Radius},{lat.ToString(inv)},{lng.ToString(inv)});"));

        // qt (quadtile) order at least correlates with spatial locality, unlike
        // the default element order, which has no relationship to distance
        // from the `around` point.
        var ql = $"[out:json][timeout:12];({selectors});out center qt {QueryBudget};";

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

            // A node carries its own lat/lon; a way or relation carries the
            // `center` that `out center` computed for it. Anything with
            // neither is not placeable and is dropped rather than guessed at.
            double poiLat, poiLng;
            if (el.TryGetProperty("lat", out var latEl)
                && el.TryGetProperty("lon", out var lonEl))
            {
                poiLat = latEl.GetDouble();
                poiLng = lonEl.GetDouble();
            }
            else if (el.TryGetProperty("center", out var centre))
            {
                poiLat = centre.GetProperty("lat").GetDouble();
                poiLng = centre.GetProperty("lon").GetDouble();
            }
            else continue;

            found.Add(new NearbyPoi(
                // Type-qualified, because a way and a node may share an id.
                $"{el.GetProperty("type").GetString()}/{el.GetProperty("id").GetInt64()}",
                name.Length > 80 ? name[..80] : name,
                type,
                poiLat,
                poiLng));
        }

        return Select(found, lat, lng);
    }

    /// Nearest-first, but with a quota per type and one entry per real place.
    ///
    /// Straight-line distance decides the order here; the walking figures come
    /// later, from ORS. That is the same split as before — this only changes
    /// WHICH candidates are worth paying a matrix for.
    internal static NearbyPoi[] Select(
        IEnumerable<NearbyPoi> found, double lat, double lng)
    {
        var ordered = found
            .DistinctBy(p => p.OsmId)
            .OrderBy(p => Haversine(lat, lng, p.Lat, p.Lng))
            // A tram stop is two OSM nodes, one per direction: "Emperador
            // Carlos V" appears at 1686 m and again at 1705 m. Distinct ids,
            // one place, and to an owner reading a list they are a duplicate —
            // one that would also eat half of that type's quota. The nearest
            // of the pair survives, which is the one already at the front.
            .DistinctBy(p => (p.Type, p.Name.Trim().ToLowerInvariant()))
            .ToArray();

        var taken = new List<NearbyPoi>(MaxPois);
        var perType = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var p in ordered)
        {
            if (taken.Count == MaxPois) break;
            perType.TryGetValue(p.Type, out var used);
            if (used >= NearbyGroups.QuotaFor(p.Type)) continue;
            perType[p.Type] = used + 1;
            taken.Add(p);
        }

        // No fill pass. An earlier version handed the leftover slots to the
        // next-nearest places regardless of type, and measuring it showed
        // exactly why that is wrong: for Pedro II el Católico 3 the quotas
        // seated the tram and the station, then the fill put the list back to
        // 17 bus stops out of 30. A quota is a decision about how much of one
        // type is worth reading; topping the list back up with the densest
        // type is that decision being made and then undone in the same method.
        //
        // A thin neighbourhood therefore returns fewer than MaxPois, which is
        // the honest answer: there is no more.
        return [.. taken];
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

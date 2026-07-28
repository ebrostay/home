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

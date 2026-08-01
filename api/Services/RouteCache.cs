using System.Net;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using Ebrostay.Api.Models;

namespace Ebrostay.Api.Services;

/// The lazy write-through, and the ONLY place the ANONYMOUS route endpoint
/// (`PropertyNearbyRoute`) chooses a route's origin and destination.
///
/// That single fact is the security property for that endpoint: both come
/// from the stored document, so an anonymous caller cannot make us route
/// arbitrary points at our expense. There is no code path here that reads
/// coordinates from a request.
///
/// Two endpoints in NearbyFunctions.cs deliberately call
/// `OrsClient.RouteAsync` directly with a destination from the request, and
/// therefore do NOT go through this class: `HostNearbyPreviewRoute` (owner
/// auth) and `PropertyPlaceRoute` (anonymous, "your places", ADR-039 — origin
/// still from the stored document, destination bounds-checked, nothing
/// stored). Do not read this comment as "nothing else in the codebase calls
/// RouteAsync with request coordinates" — that is false. What stays true is
/// the narrower claim above, about THIS class and the endpoint it serves.
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
        catch (CosmosException e)
        {
            // A cache miss and an unreadable cache must behave the same: fall
            // through to a live fetch rather than failing the request over a
            // transient Cosmos error. The write path below already treats a
            // failed cache WRITE this way; a failed cache READ deserves no
            // less.
            log.LogWarning(e, "route cache read failed for {Id}", id);
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

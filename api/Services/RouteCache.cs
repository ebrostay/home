using System.Net;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
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

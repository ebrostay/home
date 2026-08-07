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
    /// Same flag `OrsClient` reads. Checked here too, and BEFORE any ORS call,
    /// so `ComputeBandAsync` under fixtures never calls ORS even once (not
    /// even into OrsClient's own fixture path) — three independently-fixtured
    /// routes are not guaranteed to share a tail, and `RouteSplitter` needs
    /// them to. One canned band shape, no cleverness.
    private static bool Fixtures =>
        Environment.GetEnvironmentVariable("ORS_FIXTURES") == "1";

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

    /// The band lookup `PropertyNearbyRoute` (anonymous) reads through, cached
    /// like `GetAsync` above. Null means "no such entry id" — same as today —
    /// checked BEFORE the cache or ORS are touched, so an unknown id 404s
    /// without spending anything.
    public async Task<BandRouteDoc?> GetBandAsync(
        PropertyDoc property, string entryId, string profile, CancellationToken ct)
    {
        var entry = property.Nearby.FirstOrDefault(e => e.Id == entryId);
        if (entry is null) return null;

        var id = $"band-{entryId}-{profile}";
        var key = new PartitionKey(property.Id);

        try
        {
            var hit = await routes.ReadItemAsync<BandRouteDoc>(id, key,
                cancellationToken: ct);
            return hit.Resource;
        }
        catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            // Cold. Fetch it once, for everyone.
        }
        catch (CosmosException e)
        {
            // A cache miss and an unreadable cache must behave the same — see
            // the identical comment on GetAsync above.
            log.LogWarning(e, "band route cache read failed for {Id}", id);
        }

        var computed = await ComputeBandAsync(
            property, new GeoPoint(entry.Lat, entry.Lng), profile, ct);
        var doc = computed with { Id = id };

        try
        {
            await routes.UpsertItemAsync(doc, key, cancellationToken: ct);
        }
        catch (CosmosException e)
        {
            // A failed cache write must NOT fail the request. It only means
            // the next click fetches again.
            log.LogWarning(e, "band route cache write failed for {Id}", id);
        }

        return doc;
    }

    /// The fan-and-trunk merge (ADR-041 point 5), shared by `GetBandAsync`
    /// above (cached, anonymous entry lookup) and `PropertyPlaceRoute`
    /// (uncached, anonymous — a guest's own saved destination, never stored
    /// server-side per its ADR-039 comment). `Id` on the returned doc is "":
    /// only `GetBandAsync` needs a real one, and it stamps its own on top with
    /// `with { Id = id }` before ever persisting it.
    ///
    /// THREE ORS calls per uncached band route (two boundary + one door) when
    /// this runs for real. `OrsBudget` already caps the day's total and fails
    /// closed; for `PropertyPlaceRoute` specifically, the browser-side cache
    /// (`app/lib/places.ts`) is what keeps ordinary usage flat, not this.
    public async Task<BandRouteDoc> ComputeBandAsync(
        PropertyDoc property, GeoPoint to, string profile, CancellationToken ct)
    {
        if (Fixtures)
        {
            log.LogWarning(
                "ORS_FIXTURES=1: serving canned band route data, not calling ORS. " +
                "This must never be set outside local development.");
            var trunkPoints = Polyline5.Decode(OrsClient.FixtureRoutePolyline);
            var stub = Polyline5.Encode([.. trunkPoints.Take(2)]);
            return new BandRouteDoc("", property.Id, profile,
                OrsClient.FixtureRoutePolyline, stub, stub,
                4, 6, 340, 400, DateTimeOffset.UtcNow.ToString("o"));
        }

        // Three routes. The DOOR route is called with simplify: true (the
        // default) — its geometry is discarded unread; only its
        // seconds/metres survive, inside the merged range. It must never
        // reach RouteSplitter or the response.
        var band = property.Band!; // caller guarantees non-null (404s otherwise)
        var a = await ors.RouteAsync(
            new GeoPoint(band.SampleA.Lat, band.SampleA.Lng), to, profile, ct,
            simplify: false);
        var b = await ors.RouteAsync(
            new GeoPoint(band.SampleB.Lat, band.SampleB.Lng), to, profile, ct,
            simplify: false);
        var door = await ors.RouteAsync(
            new GeoPoint(property.Lat, property.Lng), to, profile, ct);

        var (trunk, stubA, stubB) = RouteSplitter.Split(
            Polyline5.Decode(a.Polyline), Polyline5.Decode(b.Polyline));

        int[] secs = [a.Seconds, b.Seconds, door.Seconds];
        int[] metres = [a.Metres, b.Metres, door.Metres];

        return new BandRouteDoc("", property.Id, profile,
            Polyline5.Encode(trunk), Polyline5.Encode(stubA), Polyline5.Encode(stubB),
            (int)Math.Floor(secs.Min() / 60.0), (int)Math.Ceiling(secs.Max() / 60.0),
            metres.Min() / 10 * 10, (metres.Max() + 9) / 10 * 10,
            DateTimeOffset.UtcNow.ToString("o"));
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

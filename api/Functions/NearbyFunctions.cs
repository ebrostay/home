using System.Globalization;
using System.Net;
using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Ebrostay.Api.Functions;

// The "what's nearby" surface (spec, ADR-028): the vocabulary the editor
// draws from, the owner's candidate search and route preview, and the public,
// anonymous route lookup a guest's map renders.
//
// The public, ANONYMOUS endpoint (`PropertyNearbyRoute`) is the
// security-critical one. It takes a propertyId, an entryId and a profile —
// never coordinates — and `RouteCache` is the ONLY place that turns those ids
// into a `from`/`to` pair for that endpoint, always read from the stored
// document. That is what stops an anonymous caller from routing arbitrary
// points at our expense on a paid ORS account.
//
// `HostNearbyPreviewRoute` below is the deliberate, narrower exception: it
// calls `OrsClient.RouteAsync` directly with owner-supplied coordinates, but
// it is owner-authenticated and bounds-checked to the Zaragoza box — a
// different trust boundary, not a hole in the claim above.
public class NearbyFunctions(
    Database database,
    ProfileService profiles,
    NearbyLookup lookup,
    OrsClient ors,
    RouteCache cache,
    ILogger<NearbyFunctions> logger)
{
    private Container Properties => database.GetContainer("properties");

    // GET /api/nearby/vocabulary
    // Anonymous and heavily cached: it is static configuration, holds no
    // secrets and names no listing. It exists so NearbyGroups.cs is the ONE
    // definition of the type list — the client keeps no copy.
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
    // Owner-authenticated. Rejects coordinates outside Zaragoza and unknown
    // groups — that bound is what stops this being a general-purpose router.
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
    // ANONYMOUS. Takes ids, never coordinates — see the class comment. Origin
    // and destination are chosen inside RouteCache, only from the stored
    // property document.
    [Function("PropertyNearbyRoute")]
    public async Task<IActionResult> Route(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get",
            Route = "properties/{id}/nearby/{entryId}/route")]
        HttpRequest req, string id, string entryId)
    {
        var profile = req.Query["profile"].ToString();
        if (string.IsNullOrEmpty(profile)) profile = "foot";
        if (!NearbyGroups.Profiles.Contains(profile)) return BadRequest("bad_profile");

        var (doc, loadError) = await LoadPublishedAsync(id, req.HttpContext.RequestAborted);
        if (loadError is not null) return loadError;
        if (doc is null) return new NotFoundResult();

        try
        {
            var route = await cache.GetAsync(doc, entryId, profile,
                req.HttpContext.RequestAborted);
            // An unknown entry id 404s WITHOUT having touched ORS — RouteCache
            // checks the document before it checks the cache or calls ORS.
            if (route is null) return new NotFoundResult();

            req.HttpContext.Response.Headers.CacheControl = "public, max-age=86400";
            return new OkObjectResult(new
            {
                polyline = route.Polyline,
                metres = route.Metres,
                seconds = route.Seconds,
            });
        }
        catch (OrsUnavailableException)
        {
            // ANONYMOUS caller: never echo the real reason (`budget`,
            // `ors_429`, …) here — that would tell an unauthenticated prober
            // whether our ORS quota is exhausted. The client branches on the
            // HTTP status, not the body, so one opaque code costs nothing.
            // The two owner-authenticated endpoints above are trusted callers
            // and keep returning the real reason.
            return new ObjectResult(new { error = "ors_unavailable" }) { StatusCode = 503 };
        }
    }

    // ------------------------------------------------------------------
    // Shared plumbing
    // ------------------------------------------------------------------

    private static bool TryPoint(HttpRequest req, out double lat, out double lng,
        string latKey = "lat", string lngKey = "lng") =>
        double.TryParse(req.Query[latKey], NumberStyles.Float,
            CultureInfo.InvariantCulture, out lat)
        & double.TryParse(req.Query[lngKey], NumberStyles.Float,
            CultureInfo.InvariantCulture, out lng);

    // The public route surface is open to a paused listing too — a guest who
    // already has the link (or a map tile that was fetched moments before the
    // owner paused it) should not see routes break. A draft or rejected
    // listing has never been public and stays invisible here, same as
    // PropertiesFunctions.Get.
    //
    // Returns (null, null) for "no such public listing" — a 404, same as an
    // unknown id — and (null, error) only for an actual Cosmos failure, so an
    // outage is never reported to an anonymous caller as if the listing does
    // not exist.
    private async Task<(PropertyDoc? Doc, IActionResult? Error)> LoadPublishedAsync(
        string id, CancellationToken ct)
    {
        try
        {
            var response = await Properties.ReadItemAsync<PropertyDoc>(
                id, new PartitionKey(id), cancellationToken: ct);
            var doc = response.Resource;
            return doc.Status is "published" or "paused" ? (doc, null) : (null, null);
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return (null, null);
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error reading property {Id}", id);
            return (null, new StatusCodeResult(StatusCodes.Status502BadGateway));
        }
    }

    private static BadRequestObjectResult BadRequest(string error) =>
        new(new { error });
}

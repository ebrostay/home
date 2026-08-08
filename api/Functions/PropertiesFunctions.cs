using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Ebrostay.Api.Functions;

public class PropertiesFunctions(
    Database database,
    PlatformSettings platform,
    ILogger<PropertiesFunctions> logger)
{
    private Container Properties => database.GetContainer("properties");

    // Public list: published and closed, summary projection. The container holds a
    // few dozen docs, so a parameterized cross-partition query + in-code
    // projection is the pragmatic call (skill: query-parameterize; the
    // SELECT-projection optimization matters at RU scales we are far from).
    [Function("PropertiesList")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "properties")] HttpRequest req)
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE ARRAY_CONTAINS(@statuses, c.status)")
            .WithParameter("@statuses", PublicStatus.Public);

        var now = DateTimeOffset.UtcNow;
        var results = new List<PropertySummary>();
        // Fetched as JObject and converted document-by-document
        // (`PropertyDocParser.TryParse`), NOT handed straight to
        // `GetItemQueryIterator<PropertyDoc>`: that overload deserializes an
        // entire page in one `ReadNextAsync` call, so one malformed document
        // (a legacy plain-string `copy` — ADR-032) would fail every document
        // sharing its page — and this container holds only a few dozen docs,
        // so "a page" here likely means the whole result. Chosen deliberately
        // over letting the request fail outright: a 500 across every
        // published listing because one stale document can't deserialize is
        // a worse outage than that one listing being absent from the list,
        // and the absence is not silent — `TryParse` logs it as an ERROR with
        // the document's id, so it surfaces in monitoring rather than only
        // being noticed by a guest who can't find a listing that should be
        // there.
        using var feed = Properties.GetItemQueryIterator<JObject>(query);
        while (feed.HasMoreResults)
        {
            foreach (var raw in await feed.ReadNextAsync())
            {
                var doc = PropertyDocParser.TryParse(raw, logger, "public listings");
                if (doc is null) continue;
                results.Add(PublicProjection.ToSummary(doc, now));
            }
        }

        return new OkObjectResult(results);
    }

    // Public detail: point read on id (= partition key; skill: query-point-reads).
    [Function("PropertyGet")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "properties/{id}")] HttpRequest req,
        string id)
    {
        try
        {
            var response = await Properties.ReadItemAsync<PropertyDoc>(
                id, new PartitionKey(id));
            var doc = response.Resource;

            // No band derivation here. This used to hold the guest's page open
            // while three Overpass queries ran — measured 32.7 s on the first
            // read of `movera0` (2026-08-08), during which the page showed only
            // its skeleton and therefore no map at all. Worse, a derivation
            // that failed stored nothing, so EVERY read of that listing paid
            // the same 30 s and still showed no map.
            //
            // A missing band is now simply the degraded projection ADR-041
            // already specifies: rounded summary point, no public map. It is
            // the reviewer's job to get a band before this listing is
            // published at all (`AdminValidation.CheckApprove`), so a
            // published listing reaching here without one is a gap to see in
            // the admin panel, not one to paper over on the guest's time.
            var detail = PublicProjection.ToDetail(
                doc, DateTimeOffset.UtcNow, platform.CleaningFeeEur);

            if (PublicStatus.IsPublic(doc.Status)) return new OkObjectResult(detail);

            // Owner preview (ADR-029). The one exception to "published docs
            // only": the owner of THIS listing gets the guest's page back,
            // marked, so they can see what review is holding — or what a
            // paused listing would look like reopened.
            //
            // Everyone else gets the same flat 404 as before, and that is
            // deliberate: not 401, not 403. A stranger walking ids must not be
            // able to tell an unpublished listing from one that never existed,
            // and an authentication challenge on a public URL would tell them.
            //
            // The ownership test is `ListingVisibility`'s, shared with the
            // route endpoints in NearbyFunctions.cs: this exception used to
            // live here alone, and the routes under this very page 404'd
            // because of it.
            if (!ListingVisibility.IsOwnedBy(doc, ClientPrincipal.Parse(req)))
                return new NotFoundResult();

            // This body is owner-only on a URL that is otherwise public and
            // cacheable. Nothing between here and the browser may keep it.
            req.HttpContext.Response.Headers.CacheControl = "no-store";
            return new OkObjectResult(detail with { PreviewStatus = doc.Status });
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundResult();
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error reading property {Id}", id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }
    }
}

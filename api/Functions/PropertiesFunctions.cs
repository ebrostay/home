using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Ebrostay.Api.Functions;

public class PropertiesFunctions(
    Database database,
    PlatformSettings platform,
    ILogger<PropertiesFunctions> logger)
{
    private Container Properties => database.GetContainer("properties");

    // Public list: published only, summary projection. The container holds a
    // few dozen docs, so a parameterized cross-partition query + in-code
    // projection is the pragmatic call (skill: query-parameterize; the
    // SELECT-projection optimization matters at RU scales we are far from).
    [Function("PropertiesList")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "properties")] HttpRequest req)
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.status = @status")
            .WithParameter("@status", "published");

        var now = DateTimeOffset.UtcNow;
        var results = new List<PropertySummary>();
        using var feed = Properties.GetItemQueryIterator<PropertyDoc>(query);
        while (feed.HasMoreResults)
        {
            foreach (var doc in await feed.ReadNextAsync())
                results.Add(PublicProjection.ToSummary(doc, now));
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

            var detail = PublicProjection.ToDetail(
                doc, DateTimeOffset.UtcNow, platform.CleaningFeeEur);

            if (doc.Status == "published") return new OkObjectResult(detail);

            // Owner preview (ADR-029). The one exception to "published docs
            // only": the owner of THIS listing gets the guest's page back,
            // marked, so they can see what review is holding — or what a
            // paused listing would look like reopened.
            //
            // Everyone else gets the same flat 404 as before, and that is
            // deliberate: not 401, not 403. A stranger walking ids must not be
            // able to tell an unpublished listing from one that never existed,
            // and an authentication challenge on a public URL would tell them.
            var principal = ClientPrincipal.Parse(req);
            if (principal is null
                || !principal.IsAuthenticated
                || !string.Equals(doc.HostId, principal.UserId, StringComparison.Ordinal))
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

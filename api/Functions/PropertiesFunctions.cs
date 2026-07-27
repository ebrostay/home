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

            if (doc.Status != "published")
                return new NotFoundResult(); // non-public states are invisible here

            return new OkObjectResult(
                PublicProjection.ToDetail(
                    doc, DateTimeOffset.UtcNow, platform.CleaningFeeEur));
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

using System.Net;
using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Ebrostay.Api.Functions;

// The owner surface (spec-v2 §4.4). Ownership is decided HERE, from the
// SWA-forwarded principal — never from a query string, and never from the SWA
// route rule alone, which only proves the caller is signed in as somebody.
public class HostFunctions(
    Database database,
    ProfileService profiles,
    ILogger<HostFunctions> logger)
{
    private Container Properties => database.GetContainer("properties");
    private Container BookingRequests => database.GetContainer("bookingRequests");

    // One row per booking request that is still waiting on the owner.
    private record RequestRow(string? PropertyId, string? CreatedAt);

    [Function("HostPropertiesList")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "host/properties")]
        HttpRequest req)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var now = DateTimeOffset.UtcNow;
        var docs = new List<PropertyDoc>();
        try
        {
            var query = new QueryDefinition("SELECT * FROM c WHERE c.hostId = @hostId")
                .WithParameter("@hostId", profile!.Id);
            using var feed = Properties.GetItemQueryIterator<PropertyDoc>(query);
            while (feed.HasMoreResults)
                docs.AddRange(await feed.ReadNextAsync());
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error listing host properties");
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        var pending = await PendingRequestsAsync(docs.Select(d => d.Id).ToArray());

        var result = docs
            .Select(d =>
            {
                pending.TryGetValue(d.Id, out var p);
                return HostProjection.ToHostProperty(d, now, p.Count, p.Oldest);
            })
            // Newest activity first: the listing the owner just touched, or the
            // one review just came back on, is the one they came here for.
            .OrderByDescending(p => p.UpdatedAt, StringComparer.Ordinal)
            .ToArray();

        return new OkObjectResult(result);
    }

    // Requests still waiting on the owner, per property. The container may not
    // exist yet in a fresh environment, and an empty log is the normal case —
    // neither is an error, both mean "nothing waiting".
    private async Task<Dictionary<string, (int Count, string? Oldest)>>
        PendingRequestsAsync(string[] propertyIds)
    {
        var byProperty = new Dictionary<string, (int Count, string? Oldest)>();
        if (propertyIds.Length == 0) return byProperty;

        try
        {
            var query = new QueryDefinition(
                    "SELECT c.propertyId, c.createdAt FROM c " +
                    "WHERE c.status = @status AND ARRAY_CONTAINS(@ids, c.propertyId)")
                .WithParameter("@status", "new")
                .WithParameter("@ids", propertyIds);

            using var feed = BookingRequests.GetItemQueryIterator<RequestRow>(query);
            while (feed.HasMoreResults)
            {
                foreach (var row in await feed.ReadNextAsync())
                {
                    if (string.IsNullOrEmpty(row.PropertyId)) continue;
                    byProperty.TryGetValue(row.PropertyId, out var acc);
                    var oldest = acc.Oldest is null || string.CompareOrdinal(
                        row.CreatedAt, acc.Oldest) < 0
                        ? row.CreatedAt ?? acc.Oldest
                        : acc.Oldest;
                    byProperty[row.PropertyId] = (acc.Count + 1, oldest);
                }
            }
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            logger.LogInformation("bookingRequests container absent — no pending requests");
        }
        catch (CosmosException ex)
        {
            // A degraded request count must not cost the owner the whole page.
            logger.LogError(ex, "Cosmos error counting booking requests");
        }

        return byProperty;
    }
}

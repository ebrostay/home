using System.Net;
using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Ebrostay.Api.Functions;

// Owner-initiated account closure (design 2026-08-08). The admin's half —
// deciding how to proceed, and any hard delete — is deliberately unbuilt and
// deferred to its own ADR: §3.7 keeps records and never deletes them.
public class AccountFunctions(
    Database database,
    ProfileService profiles,
    ILogger<AccountFunctions> logger)
{
    private Container Profiles => database.GetContainer("profiles");
    private Container Properties => database.GetContainer("properties");

    [Function("AccountClosureRequest")]
    public Task<IActionResult> Request(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "account/closure")]
        HttpRequest req) => Apply(req, requesting: true);

    // DELETE, not another POST: cancelling removes the request, and the same
    // resource answering both verbs is why neither needs a body.
    [Function("AccountClosureCancel")]
    public Task<IActionResult> Cancel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "account/closure")]
        HttpRequest req) => Apply(req, requesting: false);

    // RequireActiveAsync, NOT RequireWritableAsync: cancelling is a write that
    // a closing account must be able to make. Guarding it with the writable
    // check would let someone request a closure they could never reverse.
    private async Task<IActionResult> Apply(HttpRequest req, bool requesting)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        List<PropertyDoc> listings;
        try
        {
            listings = [];
            var query = new QueryDefinition("SELECT * FROM c WHERE c.hostId = @host")
                .WithParameter("@host", profile!.Id);
            using var feed = Properties.GetItemQueryIterator<PropertyDoc>(query);
            while (feed.HasMoreResults) listings.AddRange(await feed.ReadNextAsync());
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error loading listings for {Host}", profile!.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        var writes = requesting
            ? AccountClosure.ApplyRequest(listings)
            : AccountClosure.ApplyCancel(listings);

        // Listing-first, profile-last. The two are not one transaction, so the
        // order decides what a crash leaves behind: with the flag written last,
        // an interrupted run leaves an account that is still open with some
        // listings already moved — recoverable by pressing the button again,
        // because the map is idempotent. The other order would leave an account
        // that is closing with listings still public, which nothing retries.
        foreach (var doc in writes)
        {
            try
            {
                await Properties.ReplaceItemAsync(doc, doc.Id, new PartitionKey(doc.Id));
            }
            catch (CosmosException ex)
            {
                logger.LogError(ex, "Cosmos error closing listing {Id}", doc.Id);
                return new StatusCodeResult(StatusCodes.Status502BadGateway);
            }
        }

        profile!.DeletionRequestedAt = requesting
            ? DateTimeOffset.UtcNow.ToString("o")
            : null;

        try
        {
            await Profiles.ReplaceItemAsync(profile, profile.Id, new PartitionKey(profile.Id));
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error writing closure flag for {Id}", profile.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        return new OkObjectResult(new AccountClosureState(profile.DeletionRequestedAt));
    }
}

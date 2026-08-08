using System.Net;
using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

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

        var listings = new List<(PropertyDoc Doc, string? ETag)>();
        // Documents this endpoint could not deserialize. Skipping them is
        // deliberate (see the comment on the query below), but the count has to
        // travel back: a skipped `published` listing is one that stays in
        // search while the owner is told their account is closing and is
        // write-blocked from pausing it themselves. `TryParse` has already
        // logged each one at ERROR with its id.
        var unreadable = 0;
        try
        {
            var query = new QueryDefinition("SELECT * FROM c WHERE c.hostId = @host")
                .WithParameter("@host", profile!.Id);
            // Fetched as JObject and converted document-by-document
            // (`PropertyDocParser.TryParse`), same as `HostFunctions.List` —
            // NOT handed straight to `GetItemQueryIterator<PropertyDoc>`,
            // which deserializes an entire page in one `ReadNextAsync` call.
            // An owner with one stale legacy document (ADR-032's plain-string
            // `copy`) would otherwise never be able to close their account:
            // the one listing this endpoint cannot parse must not cost them
            // every other one they own. `_etag` travels on the raw JObject —
            // system properties are included by `SELECT *` — so the parsed
            // listing keeps the version it was read at.
            using var feed = Properties.GetItemQueryIterator<JObject>(query);
            while (feed.HasMoreResults)
            {
                foreach (var raw in await feed.ReadNextAsync())
                {
                    var doc = PropertyDocParser.TryParse(raw, logger, "account closure listings");
                    if (doc is null) unreadable++;
                    else listings.Add((doc, raw["_etag"]?.ToString()));
                }
            }
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error loading listings for {Host}", profile!.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        var etags = listings.ToDictionary(l => l.Doc.Id, l => l.ETag, StringComparer.Ordinal);
        var writes = requesting
            ? AccountClosure.ApplyRequest(listings.Select(l => l.Doc))
            : AccountClosure.ApplyCancel(listings.Select(l => l.Doc));

        // Listing-first, profile-last. The two are not one transaction, so the
        // order decides what a crash leaves behind: with the flag written last,
        // an interrupted run leaves an account that is still open with some
        // listings already moved — recoverable by pressing the button again,
        // because the map is idempotent. The other order would leave an account
        // that is closing with listings still public, which nothing retries.
        foreach (var doc in writes)
        {
            doc.UpdatedAt = DateTimeOffset.UtcNow.ToString("o");
            try
            {
                await Properties.ReplaceItemAsync(
                    doc, doc.Id, new PartitionKey(doc.Id),
                    new ItemRequestOptions { IfMatchEtag = etags.GetValueOrDefault(doc.Id) });
            }
            catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.PreconditionFailed)
            {
                // A concurrent owner edit moved this listing between the read
                // above and this write — the account is not yet write-blocked
                // while the fan-out runs, since the profile flag is written
                // last. Reported as a failure rather than skipped: the whole
                // operation is idempotent (Task 2's map), so the caller
                // retrying is safe and picks up exactly what is still left to
                // move, but silently continuing past a stale write here would
                // report success on a request that did not fully apply.
                logger.LogError(ex, "Stale write closing listing {Id}", doc.Id);
                return new StatusCodeResult(StatusCodes.Status502BadGateway);
            }
            catch (CosmosException ex)
            {
                logger.LogError(ex, "Cosmos error closing listing {Id}", doc.Id);
                return new StatusCodeResult(StatusCodes.Status502BadGateway);
            }
        }

        // The profile is re-read HERE rather than reused from the guard, and
        // written with its `_etag`. The read at the top of this function
        // happened before a cross-partition query and one write per listing —
        // seconds, for an owner with a portfolio — and replacing the document
        // with that in-memory copy puts EVERY field back to what it was before
        // the fan-out began. An admin who pressed *Deactivate* one second in
        // would watch `IsDeactivated` silently revert, with both parties told
        // they had succeeded.
        //
        // A fresh read plus `IfMatchEtag`, rather than carrying the guard's own
        // etag down, because the window has to be narrow: `BootstrapAsync`
        // touches `lastSeenAt` on EVERY authenticated request, so an etag held
        // across the whole fan-out would be broken by the browser merely
        // polling /api/me, and the owner would be told their closure failed
        // when nothing was wrong. Narrow, it still closes the real race — a
        // write landing between this read and this replace — and answers it
        // with the `stale_write` 409 the rest of the codebase uses.
        ProfileDoc current;
        string? profileEtag;
        try
        {
            var read = await Profiles.ReadItemAsync<ProfileDoc>(
                profile!.Id, new PartitionKey(profile.Id));
            current = read.Resource;
            profileEtag = read.ETag;
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error re-reading profile {Id}", profile!.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        current.DeletionRequestedAt = requesting
            ? DateTimeOffset.UtcNow.ToString("o")
            : null;

        try
        {
            await Profiles.ReplaceItemAsync(
                current, current.Id, new PartitionKey(current.Id),
                new ItemRequestOptions { IfMatchEtag = profileEtag });
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.PreconditionFailed)
        {
            // Same reasoning as the listing writes above: reported rather than
            // retried in place, because the whole operation is idempotent and
            // the caller pressing the button again picks up exactly what is
            // still left to move.
            logger.LogError(ex, "Stale write on the closure flag for {Id}", current.Id);
            return new ConflictObjectResult(new { error = "stale_write" });
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error writing closure flag for {Id}", current.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        return new OkObjectResult(
            new AccountClosureState(current.DeletionRequestedAt, unreadable));
    }
}

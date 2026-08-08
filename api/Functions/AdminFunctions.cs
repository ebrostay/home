using System.Net;
using System.Text.Json;
using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Ebrostay.Api.Functions;

// The admin surface (spec §4.5, design docs/superpowers/specs/2026-08-08).
//
// ROUTES ARE `staff/…`, NOT `admin/…`, and that is not a preference. The
// Functions host reserves the `admin/` route prefix for its own management
// API (`/admin/host/status`, `/admin/functions/{name}`), and it checks the
// route TEMPLATE, not the final path — so `routePrefix: "api"` does not save
// you. Every function in this file registered as `admin/…` was refused at
// startup with "The specified route conflicts with one or more built in
// routes" and answered 404 forever after, with nothing in the request log to
// say why. Found by running the host on 2026-08-08.
//
// The PAGES are still `/{locale}/admin/…` — that is SWA static routing and
// has no such reservation.
//
// Authorization is decided HERE, from the SWA-forwarded principal, in
// `profiles.RequireAdminAsync` — never from the `/es/admin/*` route rule,
// which only hides a page (§3.5). Three invited admins hold the role and the
// SWA platform is the only place it is stored (§3.2/§3.3), so no write to
// Cosmos can mint one.
//
// Every write here touches a home somebody else owns, so every write logs the
// acting admin. That log is the audit trail in this first version — a
// queryable audit container is a data-model decision nobody has asked a
// question of yet.
public class AdminFunctions(
    Database database,
    ProfileService profiles,
    PlatformSettings platform,
    StreetBandService bands,
    ILogger<AdminFunctions> logger)
{
    private Container Properties => database.GetContainer("properties");
    private Container Profiles => database.GetContainer("profiles");

    // ------------------------------------------------------------------
    // Reading
    // ------------------------------------------------------------------

    // The queue: what is waiting, oldest first. A waiting line, not a feed —
    // the listing that has been waiting longest is the one with an owner
    // wondering whether anybody works here.
    [Function("AdminReviewQueue")]
    public async Task<IActionResult> ReviewQueue(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "staff/review-queue")]
        HttpRequest req)
    {
        var (_, error) = await profiles.RequireAdminAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var (docs, readError) = await ListingsAsync(
            "SELECT * FROM c WHERE c.status = 'pending_review'", "review queue");
        if (readError is not null) return readError;

        var names = await HostNamesAsync(docs);

        return new OkObjectResult(docs
            .Select(d => AdminProjection.ToQueueItem(d, Name(names, d.HostId)))
            .OrderBy(q => q.SubmittedAt, StringComparer.Ordinal)
            .ToArray());
    }

    // Every listing in every status. Filtering, searching and sorting are the
    // client's, exactly as on the public search page: the whole set is small,
    // one fetch beats five round trips, and a reviewer flipping between
    // "rejected" and "everything" should not wait on the network to do it.
    [Function("AdminPropertiesList")]
    public async Task<IActionResult> PropertiesList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "staff/properties")]
        HttpRequest req)
    {
        var (_, error) = await profiles.RequireAdminAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var (docs, readError) = await ListingsAsync("SELECT * FROM c", "admin properties");
        if (readError is not null) return readError;

        var names = await HostNamesAsync(docs);

        return new OkObjectResult(docs
            .Select(d => AdminProjection.ToRow(d, Name(names, d.HostId)))
            .OrderByDescending(r => r.UpdatedAt, StringComparer.Ordinal)
            .ToArray());
    }

    // One listing, as the reviewer reads it: the owner's own projections, plus
    // the three things only an admin may see — who owns it, what the camera
    // wrote on each photo (ADR-019 amendment), and which outside suggestions
    // the owner has already declined (§2.2.4).
    [Function("AdminPropertyGet")]
    public async Task<IActionResult> PropertyGet(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "staff/properties/{id}")]
        HttpRequest req,
        string id)
    {
        var (_, error) = await profiles.RequireAdminAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var (doc, _, loadError) = await LoadAsync(id);
        if (loadError is not null) return loadError;

        var owner = await OwnerAsync(doc!.HostId);

        return new OkObjectResult(new AdminPropertyDetail(
            HostProjection.ToHostProperty(doc, DateTimeOffset.UtcNow, 0, null),
            HostProjection.ToPricing(doc, platform.CleaningFeeEur),
            HostProjection.ToListing(doc),
            AdminProjection.ToBandReview(doc),
            doc.DeclinedSuggestions,
            owner,
            AdminProjection.ToPhotos(doc),
            doc.CreatedAt));
    }

    // The people. `profiles` is small — three admins, the owners who have
    // signed in, and nothing else — so this reads it whole rather than paging
    // a list nobody scrolls.
    [Function("AdminUsersList")]
    public async Task<IActionResult> UsersList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "staff/users")]
        HttpRequest req)
    {
        var (_, error) = await profiles.RequireAdminAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        List<ProfileDoc> docs;
        try
        {
            docs = [];
            using var feed = Profiles.GetItemQueryIterator<ProfileDoc>(
                new QueryDefinition("SELECT * FROM c"));
            while (feed.HasMoreResults) docs.AddRange(await feed.ReadNextAsync());
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error listing profiles");
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        // Counted in memory from one projection query rather than asked per
        // user: a GROUP BY here would still be cross-partition, and the
        // alternative is one round trip per person on the page.
        var counts = new Dictionary<string, (int All, int Published)>(StringComparer.Ordinal);
        try
        {
            using var feed = Properties.GetItemQueryIterator<HostStatusRow>(
                new QueryDefinition("SELECT c.hostId, c.status FROM c"));
            while (feed.HasMoreResults)
            {
                foreach (var row in await feed.ReadNextAsync())
                {
                    if (string.IsNullOrEmpty(row.HostId)) continue;
                    counts.TryGetValue(row.HostId, out var acc);
                    counts[row.HostId] = (
                        acc.All + 1,
                        acc.Published + (row.Status == "published" ? 1 : 0));
                }
            }
        }
        catch (CosmosException ex)
        {
            // A missing listing count is worth less than the page it would
            // otherwise take down — the same call the portfolio makes.
            logger.LogError(ex, "Cosmos error counting listings per host");
        }

        return new OkObjectResult(docs
            .Select(p =>
            {
                counts.TryGetValue(p.Id, out var c);
                return new AdminUser(
                    p.Id, p.Provider, p.Name, p.CreatedAt, p.LastSeenAt,
                    p.IsDeactivated, c.All, c.Published, p.DeletionRequestedAt);
            })
            // Newest first: the people who have just arrived are the ones
            // anybody is looking for.
            .OrderByDescending(u => u.CreatedAt, StringComparer.Ordinal)
            .ToArray());
    }

    // ------------------------------------------------------------------
    // Deriving the band
    // ------------------------------------------------------------------

    // The one place in the product that calls Overpass on a request path, and
    // the only one where that is defensible: a reviewer is sitting in front of
    // this listing waiting for exactly this answer, and if it fails they can
    // press the button again.
    //
    // It used to run on the owner's PUT and on every guest GET instead —
    // measured 32.7 s for three queries on 2026-08-08, with `504` on two
    // probes in three, against a 45 s SWA cap that would have taken the
    // owner's whole save with it. Bounded now by StreetBandService's own 20 s
    // deadline, and de-duplicated by its SingleFlight, so a double-click costs
    // three queries and not six.
    [Function("AdminPropertyBandDerive")]
    public async Task<IActionResult> BandDerive(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "staff/properties/{id}/band")]
        HttpRequest req,
        string id)
    {
        var principal = ClientPrincipal.Parse(req);
        var (profile, error) = await profiles.RequireAdminAsync(principal);
        if (error is not null) return error;

        var (doc, etag, loadError) = await LoadAsync(id);
        if (loadError is not null) return loadError;

        var band = await bands.DeriveAsync(
            doc!.Id, doc.Lat, doc.Lng, req.HttpContext.RequestAborted);

        // Stamped whether or not it worked. A failed attempt is the fact the
        // panel needs most: it is the difference between "nobody has tried"
        // and "Overpass was down a minute ago, give it a moment".
        doc.BandAttemptedAt = DateTimeOffset.UtcNow.ToString("o");

        if (band is not null)
        {
            doc.Band = band;
            // A new band is a new judgement. Re-deriving after someone ticked
            // the old one must not carry that tick forward — they confirmed a
            // different line down a possibly different street.
            doc.BandApprovedAt = null;
            doc.BandApprovedBy = null;
        }

        logger.LogInformation(
            "admin {AdminId} derived band for {PropertyId}: {Outcome}",
            profile!.Id, doc.Id, band is null ? "failed" : "ok");

        return await SaveAsync(doc, etag, () => new OkObjectResult(
            AdminProjection.ToBandReview(doc)));
    }

    // ------------------------------------------------------------------
    // Deciding
    // ------------------------------------------------------------------

    // Approve — the act nothing else in the product can perform. Separate from
    // the status setter because it is the one transition with a precondition
    // about where the listing came from.
    [Function("AdminPropertyApprove")]
    public async Task<IActionResult> Approve(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "staff/properties/{id}/approve")]
        HttpRequest req,
        string id)
    {
        var principal = ClientPrincipal.Parse(req);
        var (profile, error) = await profiles.RequireAdminAsync(principal);
        if (error is not null) return error;

        // The body carries the reviewer's band tick. Absent or malformed is
        // treated as "not confirmed" rather than as a bad request: an old
        // client that posts nothing must fail closed on this precondition, not
        // publish a listing whose band no person has read.
        var approval = await ReadJsonAsync<AdminApproval>(req);

        var (doc, etag, loadError) = await LoadAsync(id);
        if (loadError is not null) return loadError;

        var invalid = AdminValidation.CheckApprove(
            doc!, approval?.BandConfirmed ?? false);
        if (invalid is not null) return Conflict(invalid);

        doc!.Status = "published";
        // The note answered "why was this rejected". It has been.
        doc.ReviewNote = null;
        // Who read the band, and when. Held on the document rather than only
        // in the log line below because the panel shows it back on the next
        // visit: a reviewer returning to a listing should see that the band
        // was confirmed without going to Application Insights to find out.
        doc.BandApprovedAt = DateTimeOffset.UtcNow.ToString("o");
        doc.BandApprovedBy = profile!.Id;
        // `Reference` is deliberately NOT minted here. PropertyDoc says it is
        // "assigned when the listing becomes real", and nothing in the
        // codebase assigns it — approval is the obvious place, but the scheme
        // (consecutive? derived? unique how?) is a decision nobody has taken,
        // and inventing one inside a review click would freeze it. Logged as
        // an open gap rather than closed with a guess.

        logger.LogInformation(
            "admin {AdminId} approved {PropertyId} owned by {HostId}",
            profile!.Id, doc.Id, doc.HostId);

        return await SaveAsync(doc, etag, () => new OkObjectResult(
            AdminProjection.ToRow(doc, null)));
    }

    // Reject — and take down, which is the same act from a different starting
    // status. Both leave the owner a note, and the note is the whole content
    // of the decision: it is what their portfolio shows them and the only
    // thing that says what to change.
    [Function("AdminPropertyReject")]
    public async Task<IActionResult> Reject(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "staff/properties/{id}/reject")]
        HttpRequest req,
        string id)
    {
        var principal = ClientPrincipal.Parse(req);
        var (profile, error) = await profiles.RequireAdminAsync(principal);
        if (error is not null) return error;

        var body = await ReadJsonAsync<AdminRejection>(req);
        if (body is null) return BadRequest("bad_request");

        var (doc, etag, loadError) = await LoadAsync(id);
        if (loadError is not null) return loadError;

        var invalid = AdminValidation.CheckReject(body.Note, doc!);
        if (invalid is not null)
            return invalid == "not_reviewable" ? Conflict(invalid) : BadRequest(invalid);

        var wasPublished = doc!.Status == "published";
        doc.Status = "rejected";
        doc.ReviewNote = body.Note!.Trim();

        logger.LogInformation(
            "admin {AdminId} rejected {PropertyId} owned by {HostId} (was {Was})",
            profile!.Id, doc.Id, doc.HostId, wasPublished ? "published" : doc.Status);

        return await SaveAsync(doc, etag, () => new OkObjectResult(
            AdminProjection.ToRow(doc, null)));
    }

    // Pause a live listing, or put a paused one back. ADR-024's rule, from the
    // other side of the desk: reopening is not a re-review, because pausing
    // changed nothing about what the listing claims.
    [Function("AdminPropertyStatus")]
    public async Task<IActionResult> Status(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "staff/properties/{id}/status")]
        HttpRequest req,
        string id)
    {
        var principal = ClientPrincipal.Parse(req);
        var (profile, error) = await profiles.RequireAdminAsync(principal);
        if (error is not null) return error;

        var body = await ReadJsonAsync<AdminStatusUpdate>(req);
        if (body is null) return BadRequest("bad_request");

        var (doc, etag, loadError) = await LoadAsync(id);
        if (loadError is not null) return loadError;

        var invalid = AdminValidation.CheckStatus(body.Status, doc!);
        if (invalid is not null)
            return invalid == "status_invalid" ? BadRequest(invalid) : Conflict(invalid);

        doc!.Status = body.Status!;

        logger.LogInformation(
            "admin {AdminId} set {PropertyId} to {Status} (owner {HostId})",
            profile!.Id, doc.Id, doc.Status, doc.HostId);

        return await SaveAsync(doc, etag, () => new OkObjectResult(
            AdminProjection.ToRow(doc, null)));
    }

    // Deactivation (§3.7): v1's self-service 100-year ban, inverted into an
    // admin control. The record is kept — never deleted.
    [Function("AdminUserDeactivation")]
    public async Task<IActionResult> Deactivation(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "staff/users/{id}/deactivation")]
        HttpRequest req,
        string id)
    {
        var principal = ClientPrincipal.Parse(req);
        var (profile, error) = await profiles.RequireAdminAsync(principal);
        if (error is not null) return error;

        var body = await ReadJsonAsync<AdminDeactivation>(req);
        if (body is null) return BadRequest("bad_request");

        // Nothing here could undo it: every authenticated function refuses a
        // deactivated principal before it reads a role (§3.7), so an admin who
        // deactivated themselves would need another admin — or the portal — to
        // get back in. Refused rather than warned about.
        if (string.Equals(id, profile!.Id, StringComparison.Ordinal) && body.IsDeactivated)
            return new ObjectResult(new { error = "cannot_deactivate_self" })
            {
                StatusCode = StatusCodes.Status403Forbidden,
            };

        ProfileDoc target;
        string? etag;
        try
        {
            var read = await Profiles.ReadItemAsync<ProfileDoc>(id, new PartitionKey(id));
            target = read.Resource;
            etag = read.ETag;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return new NotFoundResult();
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error reading profile {Id}", id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        target.IsDeactivated = body.IsDeactivated;

        logger.LogInformation(
            "admin {AdminId} set {UserId} deactivated={Flag}",
            profile.Id, target.Id, body.IsDeactivated);

        try
        {
            await Profiles.ReplaceItemAsync(
                target, target.Id, new PartitionKey(target.Id),
                new ItemRequestOptions { IfMatchEtag = etag });
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.PreconditionFailed)
        {
            return new ConflictObjectResult(new { error = "stale_write" });
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error saving profile {Id}", target.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        return new OkObjectResult(new AdminUser(
            target.Id, target.Provider, target.Name, target.CreatedAt,
            target.LastSeenAt, target.IsDeactivated, 0, 0,
            target.DeletionRequestedAt));
    }

    // ------------------------------------------------------------------
    // Shared plumbing
    // ------------------------------------------------------------------

    private record HostStatusRow(string? HostId, string? Status);

    // Document-by-document parsing, same as the host and public lists: one
    // stale document must not cost a reviewer every other listing in the
    // queue. The gap is logged instead.
    private async Task<(List<PropertyDoc> Docs, IActionResult? Error)> ListingsAsync(
        string sql, string context)
    {
        var docs = new List<PropertyDoc>();
        try
        {
            using var feed = Properties.GetItemQueryIterator<JObject>(new QueryDefinition(sql));
            while (feed.HasMoreResults)
            {
                foreach (var raw in await feed.ReadNextAsync())
                {
                    var doc = PropertyDocParser.TryParse(raw, logger, context);
                    if (doc is not null) docs.Add(doc);
                }
            }
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error reading {Context}", context);
            return (docs, new StatusCodeResult(StatusCodes.Status502BadGateway));
        }

        return (docs, null);
    }

    // NOT `LoadOwnedAsync`: an admin reads any listing, and a listing that is
    // genuinely absent is still a 404.
    private async Task<(PropertyDoc? Doc, string? ETag, IActionResult? Error)> LoadAsync(
        string id)
    {
        try
        {
            var response = await Properties.ReadItemAsync<JObject>(id, new PartitionKey(id));
            var doc = PropertyDocParser.TryParse(response.Resource, logger, "admin property");
            // A document this API cannot read is not a 500 for the reviewer:
            // it is one listing they cannot open, logged by the parser.
            return doc is null
                ? (null, null, new StatusCodeResult(StatusCodes.Status502BadGateway))
                : (doc, response.ETag, null);
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return (null, null, new NotFoundResult());
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error reading property {Id}", id);
            return (null, null, new StatusCodeResult(StatusCodes.Status502BadGateway));
        }
    }

    private async Task<IActionResult> SaveAsync(
        PropertyDoc doc, string? etag, Func<IActionResult> ok)
    {
        doc.UpdatedAt = DateTimeOffset.UtcNow.ToString("o");
        try
        {
            await Properties.ReplaceItemAsync(
                doc, doc.Id, new PartitionKey(doc.Id),
                new ItemRequestOptions { IfMatchEtag = etag });
            return ok();
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.PreconditionFailed)
        {
            // Two reviewers on the same listing, or the owner saving while it
            // is being read. A reload for the client, never a silent overwrite.
            return new ConflictObjectResult(new { error = "stale_write" });
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error saving property {Id}", doc.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }
    }

    // The owners of a page of listings, in one read. A queue of twelve
    // listings from four owners is four names, and asking per row would be
    // twelve round trips for them.
    private async Task<Dictionary<string, string>> HostNamesAsync(List<PropertyDoc> docs)
    {
        var names = new Dictionary<string, string>(StringComparer.Ordinal);
        var ids = docs
            .Select(d => d.HostId)
            .Where(h => !string.IsNullOrEmpty(h))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (ids.Length == 0) return names;

        try
        {
            var query = new QueryDefinition(
                    "SELECT c.id, c.name FROM c WHERE ARRAY_CONTAINS(@ids, c.id)")
                .WithParameter("@ids", ids);
            using var feed = Profiles.GetItemQueryIterator<ProfileDoc>(query);
            while (feed.HasMoreResults)
                foreach (var p in await feed.ReadNextAsync())
                    if (!string.IsNullOrEmpty(p.Id)) names[p.Id] = p.Name;
        }
        catch (CosmosException ex)
        {
            // A row whose owner has no name still shows the listing. The name
            // is context; the queue is the job.
            logger.LogError(ex, "Cosmos error reading host names");
        }

        return names;
    }

    private static string? Name(Dictionary<string, string> names, string? hostId) =>
        hostId is not null && names.TryGetValue(hostId, out var name) ? name : null;

    private async Task<AdminOwner> OwnerAsync(string? hostId)
    {
        if (string.IsNullOrEmpty(hostId)) return new AdminOwner(null, null, null, false);
        try
        {
            var read = await Profiles.ReadItemAsync<ProfileDoc>(
                hostId, new PartitionKey(hostId));
            var p = read.Resource;
            return new AdminOwner(p.Id, p.Name, p.Provider, p.IsDeactivated);
        }
        catch (CosmosException ex)
        {
            // A listing whose owner profile is missing — a seeded document, or
            // a purged account — is still a listing a reviewer must be able to
            // read. The id travels either way.
            logger.LogWarning(ex, "Could not read owner profile {HostId}", hostId);
            return new AdminOwner(hostId, null, null, false);
        }
    }

    private static async Task<T?> ReadJsonAsync<T>(HttpRequest req) where T : class
    {
        try
        {
            return await req.ReadFromJsonAsync<T>();
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            return null;
        }
    }

    private static BadRequestObjectResult BadRequest(string error) => new(new { error });

    private static ConflictObjectResult Conflict(string error) => new(new { error });
}

using System.Net;
using System.Text.Json;
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
    PlatformSettings platform,
    ILogger<HostFunctions> logger)
{
    private Container Properties => database.GetContainer("properties");
    private Container BookingRequests => database.GetContainer("bookingRequests");

    // One row per booking request that is still waiting on the owner.
    private record RequestRow(string? PropertyId, string? CreatedAt);

    // The request log as the owner is allowed to see it — no tenant identity,
    // by design (§4.3: Ebrostay owns every tenant conversation).
    private record RequestDoc(
        string Id, string? StartDate, string? EndDate, int Months,
        string? Status, string? Channel, string? CreatedAt);

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

    // ------------------------------------------------------------------
    // One listing — the "Manage property" surface (spec-v2 §4.4).
    // ------------------------------------------------------------------

    [Function("HostPropertyGet")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "host/properties/{id}")]
        HttpRequest req,
        string id)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var (doc, _, loadError) = await LoadOwnedAsync(id, profile!.Id);
        if (loadError is not null) return loadError;

        var requests = await RequestLogAsync(id);
        return new OkObjectResult(new HostPropertyDetail(
            HostProjection.ToHostProperty(doc!, DateTimeOffset.UtcNow, requests.Count(
                r => r.Status == "new"), null),
            HostProjection.ToPricing(doc!, platform.CleaningFeeEur),
            requests));
    }

    // ADR-025: price, deposit, bills and the stay floor apply immediately —
    // `Status` is not assigned anywhere below, so a published listing stays
    // published and a draft stays a draft.
    [Function("HostPricingUpdate")]
    public async Task<IActionResult> UpdatePricing(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "host/properties/{id}/pricing")]
        HttpRequest req,
        string id)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var update = await ReadJsonAsync<PricingUpdate>(req);
        if (update is null) return BadRequest("bad_request");

        var (doc, etag, loadError) = await LoadOwnedAsync(id, profile!.Id);
        if (loadError is not null) return loadError;

        var invalid = HostValidation.CheckPricing(update, doc!.MaxStayMonths);
        if (invalid is not null) return BadRequest(invalid);

        doc.PriceNumber = update.PriceNumber;
        // Kept in step with the number rather than authored separately: the
        // label and the figure are one price, and v1 let them drift.
        doc.PriceLabel = $"{update.PriceNumber} EUR";
        doc.UpfrontRentEur = update.PriceNumber;
        doc.DepositAmount = update.DepositAmount;
        doc.BillsPolicy = update.BillsPolicy ?? "excluded";
        // A cap only means anything under the capped policy; carrying a stale
        // one forward would show a ceiling on a listing that has none.
        doc.UtilitiesCapEur = doc.BillsPolicy == "capped" ? update.UtilitiesCapEur : null;
        doc.MinStayMonths = update.MinStayMonths;
        doc.CleaningBy = update.CleaningBy ?? "platform";
        // Same rule as the bills cap: an amount only survives while the
        // policy it belongs to does.
        doc.CleaningFeeEur = doc.CleaningBy == "host" ? update.CleaningFeeEur : null;
        doc.TurnoverDays = update.TurnoverDays ?? PropertyDoc.DefaultTurnoverDays;

        return await SaveAsync(doc, etag, () => new OkObjectResult(HostProjection.ToPricing(doc, platform.CleaningFeeEur)));
    }

    // The owner's calendar. The payload replaces every `confirmed` block and
    // leaves holds alone: a hold belongs to the booking flow, and an owner
    // saving their calendar must not be able to release one.
    [Function("HostAvailabilityUpdate")]
    public async Task<IActionResult> UpdateAvailability(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "host/properties/{id}/availability")]
        HttpRequest req,
        string id)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var update = await ReadJsonAsync<AvailabilityUpdate>(req);
        if (update?.Blocks is null) return BadRequest("bad_request");

        var (doc, etag, loadError) = await LoadOwnedAsync(id, profile!.Id);
        if (loadError is not null) return loadError;

        var now = DateTimeOffset.UtcNow;
        // Expired holds are already available to everyone else (§2.2.3), so
        // they must not block the owner either — dropping them here is the
        // same rule the projection applies, not a cleanup.
        var holds = doc!.Availability
            .Where(r => r.Status == "hold" && HoldAlive(r, now))
            .ToArray();

        var invalid = HostValidation.CheckAvailability(update.Blocks, holds);
        if (invalid is not null) return BadRequest(invalid);

        doc.Availability =
        [
            .. holds,
            .. update.Blocks.Select(b => new AvailabilityRange(
                b.Start!, b.End!, "confirmed",
                string.IsNullOrWhiteSpace(b.Note) ? null : b.Note.Trim(), null,
                // Preserved, not accepted from the client: the per-stay
                // override is the admin's, and an owner saving their calendar
                // must not be able to set or silently drop one.
                OverrideFor(doc, b.Start!, b.End!))),
        ];

        return await SaveAsync(doc, etag, () => new OkObjectResult(
            HostProjection.ToHostProperty(doc, now, 0, null).Availability));
    }

    // The owner's payload replaces their blocks wholesale, so an unchanged
    // block has to carry its admin-set override back in by hand. Matched on the
    // dates: a block with the same span IS the same block, and one whose dates
    // moved is a different stay whose staffing was never agreed.
    private static int? OverrideFor(PropertyDoc doc, string start, string end) =>
        doc.Availability
            .FirstOrDefault(r => r.Start == start && r.End == end && r.Status != "hold")
            ?.TurnoverDaysOverride;

    private static bool HoldAlive(AvailabilityRange r, DateTimeOffset now) =>
        r.HoldExpiresAt is not null &&
        DateTimeOffset.TryParse(r.HoldExpiresAt, out var expires) && expires > now;

    // ------------------------------------------------------------------
    // Shared plumbing
    // ------------------------------------------------------------------

    // Ownership is a 404, not a 403: a listing the caller does not own should
    // not confirm its own existence to them.
    private async Task<(PropertyDoc? Doc, string? ETag, IActionResult? Error)>
        LoadOwnedAsync(string id, string hostId)
    {
        try
        {
            var response = await Properties.ReadItemAsync<PropertyDoc>(id, new PartitionKey(id));
            return response.Resource.HostId == hostId
                ? (response.Resource, response.ETag, null)
                : (null, null, new NotFoundResult());
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

    // Conditional replace (§2.2.3): read → validate → write only if the
    // document has not moved underneath us. A 412 means someone else saved
    // first, which is a reload for the client, never a silent overwrite.
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
            return new ConflictObjectResult(new { error = "stale_write" });
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error saving property {Id}", doc.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
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

    private static BadRequestObjectResult BadRequest(string error) =>
        new(new { error });

    // The booking-interest log for one listing — single-partition, since
    // `bookingRequests` partitions on /propertyId for exactly this query.
    private async Task<HostRequestRow[]> RequestLogAsync(string propertyId)
    {
        try
        {
            var query = new QueryDefinition(
                    "SELECT c.id, c.startDate, c.endDate, c.months, c.status, " +
                    "c.channel, c.createdAt FROM c WHERE c.propertyId = @id")
                .WithParameter("@id", propertyId);

            var rows = new List<HostRequestRow>();
            using var feed = BookingRequests.GetItemQueryIterator<RequestDoc>(
                query,
                requestOptions: new QueryRequestOptions
                {
                    PartitionKey = new PartitionKey(propertyId),
                });

            while (feed.HasMoreResults)
            {
                foreach (var d in await feed.ReadNextAsync())
                    rows.Add(new HostRequestRow(
                        d.Id, d.StartDate, d.EndDate, d.Months,
                        d.Status ?? "new", d.Channel, d.CreatedAt));
            }

            // Newest first: the log is read as "what came in lately".
            return [.. rows.OrderByDescending(r => r.CreatedAt, StringComparer.Ordinal)];
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            logger.LogInformation("bookingRequests container absent — empty request log");
            return [];
        }
        catch (CosmosException ex)
        {
            // Same call as the portfolio count: a missing log is worth less
            // than the page it would otherwise take down.
            logger.LogError(ex, "Cosmos error reading request log for {Id}", propertyId);
            return [];
        }
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

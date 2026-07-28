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
    PhotoStore photos,
    PhotoPipeline pipeline,
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
            HostProjection.ToListing(doc!),
            doc!.DeclinedSuggestions,
            requests));
    }

    // The listing editor (spec-v2 §4.4). The other side of the ADR-025 split:
    // everything here is a claim about the home, so an approved listing goes
    // back in the review queue when it is saved.
    [Function("HostDetailsUpdate")]
    public async Task<IActionResult> UpdateDetails(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "host/properties/{id}")]
        HttpRequest req,
        string id)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var update = await ReadJsonAsync<DetailsUpdate>(req);
        if (update is null) return BadRequest("bad_request");

        var (doc, etag, loadError) = await LoadOwnedAsync(id, profile!.Id);
        if (loadError is not null) return loadError;

        var invalid = HostValidation.CheckDetails(update, doc!);
        if (invalid is not null) return BadRequest(invalid);

        doc!.Name = update.Name!.Trim();
        doc.Type = update.Type!;
        doc.Address = Clean(update.Address);
        doc.Postcode = Clean(update.Postcode);
        doc.CadastralRef = Clean(update.CadastralRef)?.ToUpperInvariant();
        doc.Lat = update.Lat;
        doc.Lng = update.Lng;
        doc.Area = ToBilingual(update.Area);
        doc.Copy = ToBilingual(update.Copy);
        doc.CopyEnApproved = update.CopyEnApproved;
        doc.Details = ToBilingual(update.Details);
        doc.Beds = ToBilingual(update.Beds);
        doc.Guests = update.Guests;
        doc.Bedrooms = update.Bedrooms;
        doc.Bathrooms = update.Bathrooms;
        doc.SizeM2 = update.SizeM2;
        doc.FloorNumber = update.FloorNumber;
        doc.EnergyRating = Clean(update.EnergyRating)?.ToUpperInvariant();
        doc.Amenities = update.Amenities ?? [];
        doc.PetsAllowed = update.PetsAllowed;
        doc.SmokingAllowed = update.SmokingAllowed;
        doc.CouplesAllowed = update.CouplesAllowed;
        doc.SelfCheckin = update.SelfCheckin;
        // Position comes from the array's order, not from a number the client
        // sends: an index the client owns can arrive with gaps or repeats, and
        // the gallery would silently reorder itself.
        //
        // Everything else about a photo is carried over from the stored entry
        // rather than accepted: the derived URLs and the capture coordinates
        // are the pipeline's output and the reviewer's evidence, and this
        // payload's job is to reorder, re-flag and drop.
        // Grouped rather than ToDictionary: a document that somehow carried the
        // same URL twice would throw, and turn every future save of that
        // listing into a 500 the owner cannot get out of.
        var kept = doc.Photos
            .GroupBy(p => p.Url, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);
        var dropped = doc.Photos
            .Where(p => !(update.Photos ?? []).Any(w => w.Url == p.Url))
            .ToArray();

        doc.Photos =
        [
            .. (update.Photos ?? []).Select((p, i) =>
                kept[p.Url!] with { IsFloorplan = p.IsFloorplan, SortOrder = i }),
        ];

        // §2.2.1: an approved listing re-enters the queue and leaves public
        // search until a reviewer sees it again. A draft stays a draft and a
        // rejected listing stays rejected — resubmitting is its own act, not
        // a side effect of typing.
        if (doc.Status is "published" or "paused")
        {
            doc.Status = "pending_review";
            doc.ReviewNote = null;
        }

        var saved = await SaveAsync(doc, etag, () => new OkObjectResult(
            new HostListingSaved(
                HostProjection.ToHostProperty(doc, DateTimeOffset.UtcNow, 0, null),
                HostProjection.ToListing(doc))));

        // Only after the document is safely written. Deleting first would lose
        // the blobs of a save that then failed its ETag check, leaving a
        // listing pointing at photos that no longer exist. The other order
        // leaves orphans if this half fails, and an orphan costs storage where
        // the alternative costs the owner their photos.
        if (saved is OkObjectResult)
            await DropBlobsAsync(dropped, req.HttpContext.RequestAborted);

        return saved;
    }

    // Every URL a photo entry owns. A dropped photo takes all three sizes with
    // it — deleting only the master would leave two thirds of the bytes behind
    // and none of them reachable.
    private async Task DropBlobsAsync(PropertyPhoto[] gone, CancellationToken token)
    {
        foreach (var url in gone.SelectMany(p => new[] { p.Url, p.CardUrl, p.DetailUrl })
                     .Where(u => !string.IsNullOrEmpty(u)))
        {
            try
            {
                await photos.DeleteAsync(url!, token);
            }
            catch (Exception ex)
            {
                // Cleanup, not part of the write. The edit already succeeded.
                logger.LogWarning(ex, "Could not delete blob {Url}", url);
            }
        }
    }

    // Close the listing to new requests, or reopen it. ADR-024: reopening is
    // not a re-review — the listing was approved and pausing changed nothing
    // about what it claims.
    [Function("HostStatusUpdate")]
    public async Task<IActionResult> UpdateStatus(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "host/properties/{id}/status")]
        HttpRequest req,
        string id)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var update = await ReadJsonAsync<StatusUpdate>(req);
        if (update is null) return BadRequest("bad_request");

        var (doc, etag, loadError) = await LoadOwnedAsync(id, profile!.Id);
        if (loadError is not null) return loadError;

        var invalid = HostValidation.CheckStatus(update.Status, doc!.Status);
        if (invalid is not null) return BadRequest(invalid);

        doc.Status = update.Status!;

        return await SaveAsync(doc, etag, () => new OkObjectResult(
            HostProjection.ToHostProperty(doc, DateTimeOffset.UtcNow, 0, null)));
    }

    // Adding a photo — the path ADR-019 describes and §2.2.2 depends on.
    //
    // One file per request. Batching would make a partial failure ambiguous
    // (which of the six landed?) and the owner-visible unit is one photo
    // anyway: the client uploads a queue and reports each result.
    //
    // The whole security argument lives in `PhotoPipeline`. What matters here
    // is that nothing reaches the container that has not been through it, and
    // that the blob name comes from us — a client filename is path traversal
    // and cross-listing overwrite in one.
    [Function("HostPhotoUpload")]
    public async Task<IActionResult> UploadPhoto(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "host/properties/{id}/photos")]
        HttpRequest req,
        string id)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var (doc, etag, loadError) = await LoadOwnedAsync(id, profile!.Id);
        if (loadError is not null) return loadError;

        if (doc!.Photos.Length >= HostValidation.MaxPhotos)
            return BadRequest("too_many_photos");

        var token = req.HttpContext.RequestAborted;
        byte[] bytes;
        bool isFloorplan;
        try
        {
            if (!req.HasFormContentType) return BadRequest("bad_request");
            var form = await req.ReadFormAsync(token);
            var file = form.Files.GetFile("photo");
            if (file is null || file.Length == 0) return BadRequest("photo_empty");
            // Checked before reading, so an oversized upload is refused rather
            // than buffered. The pipeline checks again on the real length —
            // Content-Length is the client's claim, not a measurement.
            if (file.Length > PhotoPipeline.MaxBytes) return BadRequest("photo_too_large");

            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer, token);
            bytes = buffer.ToArray();
            isFloorplan = form["isFloorplan"] == "true";
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException)
        {
            return BadRequest("bad_request");
        }

        PhotoPipeline.Result processed;
        try
        {
            processed = pipeline.Process(bytes);
        }
        catch (PhotoPipeline.RejectedException ex)
        {
            return BadRequest(ex.Code);
        }
        catch (Exception ex)
        {
            // A decoder that fell over on a file that passed every check is
            // still a refusal, not a 500: the owner's next move is the same
            // either way, and the detail belongs in our logs, not their screen.
            logger.LogError(ex, "Photo processing failed for {Id}", id);
            return BadRequest("photo_unreadable");
        }

        // Server-generated, always. One id shared by the three sizes so they
        // are recognisably one photo in the container.
        var key = Guid.NewGuid().ToString("n");
        var urls = new Dictionary<string, string>(StringComparer.Ordinal);
        try
        {
            foreach (var variant in processed.Variants)
                urls[variant.Suffix] = await photos.PutAsync(
                    $"{id}/{key}-{variant.Suffix}.webp", variant.Bytes, token);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Blob upload failed for {Id}", id);
            // Whatever landed before the failure is orphaned. Cheaper to leave
            // than to risk a cleanup pass deleting a blob another request just
            // wrote under a name we are no longer sure about.
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        doc.Photos =
        [
            .. doc.Photos,
            new PropertyPhoto(
                urls["full"], isFloorplan,
                // Last, so a new photo joins the end of the gallery rather
                // than displacing the cover the owner chose.
                doc.Photos.Length == 0 ? 0 : doc.Photos.Max(p => p.SortOrder) + 1,
                urls["card"], urls["detail"],
                processed.Capture.Lat, processed.Capture.Lng, processed.Capture.At),
        ];

        // Note what is NOT here: no status change. Adding a photo to a draft
        // leaves it a draft, and the content save that follows is what carries
        // a published listing back into review (ADR-025). Uploading is not the
        // claim; publishing the listing that shows it is.
        return await SaveAsync(doc, etag, () => new OkObjectResult(
            HostProjection.ToListing(doc).Photos));
    }

    // Suggestions the owner has looked at and decided against (§2.2.4). Its own
    // endpoint, and deliberately so: this is not a content edit, and riding the
    // details payload would send a published listing back to the review queue
    // for the act of dismissing a banner (ADR-027 decision 5). `Status` is not
    // assigned anywhere below.
    [Function("HostDeclinedUpdate")]
    public async Task<IActionResult> UpdateDeclined(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "host/properties/{id}/declined")]
        HttpRequest req,
        string id)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var update = await ReadJsonAsync<DeclinedUpdate>(req);
        if (update?.Declined is null) return BadRequest("bad_request");

        var (doc, etag, loadError) = await LoadOwnedAsync(id, profile!.Id);
        if (loadError is not null) return loadError;

        var invalid = HostValidation.CheckDeclined(update.Declined);
        if (invalid is not null) return BadRequest(invalid);

        var today = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd");
        doc!.DeclinedSuggestions =
        [
            .. update.Declined.Select(d => new DeclinedSuggestion(
                d.Field!, d.Source!, d.Value!.Trim(), d.For!.Trim(),
                // Server-stamped, and preserved rather than restamped when the
                // entry is unchanged: the payload replaces the list wholesale,
                // so without this every dismissal would redate every other one
                // and the reviewer's "decided on" column would say nothing.
                DateOf(doc, d) ?? today)),
        ];

        return await SaveAsync(doc, etag, () =>
            new OkObjectResult(doc.DeclinedSuggestions));
    }

    // The same entry, still about the same answer to the same question, keeps
    // the date it was first declined on. A changed value is a NEW decision —
    // the owner has looked at something different — so it takes today's.
    private static string? DateOf(PropertyDoc doc, DeclinedWrite d) =>
        doc.DeclinedSuggestions.FirstOrDefault(e =>
            e.Field == d.Field && e.Source == d.Source &&
            e.Value == d.Value?.Trim() && e.For == d.For?.Trim())?.At;

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    // An empty string is not a translation. Storing one would let a listing
    // count as bilingual while showing a blank paragraph in English.
    private static Bilingual? ToBilingual(BilingualWrite? b)
    {
        var es = Clean(b?.Es);
        var en = Clean(b?.En);
        return es is null && en is null ? null : new Bilingual(es, en);
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

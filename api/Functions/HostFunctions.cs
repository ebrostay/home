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
    OrsClient ors,
    RouteCache cache,
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
    // Bringing a listing into existence (ADR-030).
    //
    // Empty on purpose: the payload is nothing at all. The wizard's first step
    // is the address, and it saves through the same content endpoint the editor
    // uses — so a create that also accepted content would be a second way to
    // write the same fields, validated in a second place. What this does is
    // mint an owned, empty `draft` and hand back the identical
    // `HostPropertyDetail` the editor loads, which is what lets the wizard
    // compose the editor's own field components against real state from its
    // second step onwards.
    // ------------------------------------------------------------------

    [Function("HostPropertyCreate")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "host/properties")]
        HttpRequest req)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        int open;
        try
        {
            // Cross-partition, and deliberately so: it counts a hostId across a
            // container partitioned on /id. It runs once per listing an owner
            // ever creates, against a handful of documents, and the alternative
            // — a per-host partition, or a counter document to maintain — would
            // reshape the container for a query nobody makes twice a year.
            var query = new QueryDefinition(
                    "SELECT VALUE COUNT(1) FROM c WHERE c.hostId = @hostId AND c.status = 'draft'")
                .WithParameter("@hostId", profile!.Id);
            using var feed = Properties.GetItemQueryIterator<int>(query);
            open = feed.HasMoreResults ? (await feed.ReadNextAsync()).FirstOrDefault() : 0;
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error counting drafts");
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        if (open >= HostValidation.MaxOpenDrafts) return BadRequest("too_many_drafts");

        var now = DateTimeOffset.UtcNow.ToString("o");
        var doc = new PropertyDoc
        {
            Id = Guid.NewGuid().ToString("n"),
            HostId = profile!.Id,
            Status = "draft",
            CreatedAt = now,
            UpdatedAt = now,
            // Reference stays null. It is the number an owner quotes at us in a
            // support thread, and a draft nobody has looked at has nothing to
            // quote — the portfolio and the editor both already render the
            // no-reference case. It is assigned when the listing becomes real.
        };

        try
        {
            await Properties.CreateItemAsync(doc, new PartitionKey(doc.Id));
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error creating draft property");
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        // 201 with the body a GET would return: the wizard then holds exactly
        // what the editor holds, and there is one shape of owner state.
        return new ObjectResult(new HostPropertyDetail(
            HostProjection.ToHostProperty(doc, DateTimeOffset.UtcNow, 0, null),
            HostProjection.ToPricing(doc, platform.CleaningFeeEur),
            HostProjection.ToListing(doc),
            doc.DeclinedSuggestions,
            []))
        {
            StatusCode = StatusCodes.Status201Created,
        };
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

        // The pin is the origin of every nearby distance, so this has to be
        // read BEFORE doc.Lat/doc.Lng are overwritten below — comparing the
        // stored pin against the incoming one after the assignment would
        // always see them equal.
        var pinMoved = Math.Abs(doc!.Lat - update.Lat) > 0.000001
            || Math.Abs(doc.Lng - update.Lng) > 0.000001;

        // Not `update.Name!`: since ADR-030 a draft may legitimately arrive
        // with no name at all, and the null-forgiving that was safe while
        // `name_required` rejected every such payload would now be a 500.
        doc!.Name = update.Name?.Trim() ?? "";
        doc.Type = update.Type!;
        doc.Address = Clean(update.Address);
        doc.Postcode = Clean(update.Postcode);
        doc.CadastralRef = Clean(update.CadastralRef)?.ToUpperInvariant();
        doc.Lat = update.Lat;
        doc.Lng = update.Lng;
        doc.Area = ToBilingual(update.Area);
        // No ToBilingual-style repair for the document (D8: RichText REJECTS,
        // never repairs) — CheckDetails has already walked and validated it,
        // so this is a straight carry-over, not a sanitize.
        doc.Copy = update.Copy;
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
                kept[p.Url!] with
                {
                    IsFloorplan = p.IsFloorplan,
                    HiddenFromGallery = p.HiddenFromGallery,
                    SortOrder = i,
                }),
        ];

        // Reach figures are NEVER taken from the payload. Entries are matched by
        // id against the stored document and their measured figures carried
        // over — the same posture as photos, where everything but order and
        // flags comes from the stored entry.
        //
        // The pin is the origin of every one of these distances, so when it
        // moves they are ALL wrong, even though no entry itself changed. That
        // is the case a naive "unchanged → keep" rule gets exactly backwards —
        // `pinMoved` (captured above, before doc.Lat/Lng were overwritten) is
        // what stops that.
        // Grouped rather than ToDictionary, same defensive reason as the
        // photos' `kept` a few lines above: a document that somehow carried
        // the same id twice must not throw and brick every future save of
        // this listing. Validation refuses a payload that would CREATE a
        // duplicate (see nearby_duplicate_id below); this is what stops an
        // already-corrupted document from being unrecoverable.
        var storedNearby = doc.Nearby
            .GroupBy(n => n.Id, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);
        var writes = update.Nearby ?? [];
        var merged = new List<NearbyEntry>(writes.Length);
        var needsMeasuring = new List<int>();
        // Every id that changed between the incoming payload and the id this
        // entry is actually stored under — in practice, `NearbyEditor.tsx`'s
        // client temp id (`local-<ts>-<rand>`) for an entry added in this
        // same save, mapped to the fresh server id just below. A `copy`
        // document saved in the SAME request can already hold a `placeRef`
        // to that temp id (add a place, mention it, save), so this map is
        // what lets that reference be rewritten to something that still
        // resolves once the entry itself is stored under its real id.
        var idRemap = new Dictionary<string, string>(StringComparer.Ordinal);

        for (var i = 0; i < writes.Length; i++)
        {
            var w = writes[i];
            // A client-supplied id only ever MATCHES an existing entry on this
            // same document — it can never create a new entry under an id of
            // the caller's choosing, and an id belonging to another property
            // simply will not be found in this doc's own dictionary.
            var known = w.Id is not null && storedNearby.TryGetValue(w.Id, out var prev)
                ? prev : null;

            var moved = known is not null
                && (Math.Abs(known.Lat - w.Lat) > 0.000001
                    || Math.Abs(known.Lng - w.Lng) > 0.000001);

            var entry = new NearbyEntry(
                // Server-generated: a client-supplied id would let a caller
                // point the route cache at an entry it does not own.
                Id: known?.Id ?? Guid.NewGuid().ToString("n"),
                Group: w.Group!,
                Type: w.Type,
                CustomType: ToBilingual(w.CustomType),
                Name: w.Name!.Trim(),
                Lat: w.Lat,
                Lng: w.Lng,
                Reach: known is not null && !moved && !pinMoved
                    ? known.Reach
                    : new Dictionary<string, NearbyReach>(),
                OsmId: known?.OsmId,
                MeasuredAt: known is not null && !moved && !pinMoved ? known.MeasuredAt : null,
                // Carried over under the SAME reuse test as Reach/MeasuredAt:
                // the flag was earned by a measurement, and only that
                // measurement being reused (not re-run) justifies keeping it.
                // Defaulting this to false would silently clear a real flag
                // on any save that happens not to touch this entry.
                NeedsCheck: known is not null && !moved && !pinMoved && known.NeedsCheck);

            // `known is null` means this write did not match a stored entry —
            // it is new to this save — and `entry.Id` was just generated
            // above. An entry that DID match keeps its own id (`entry.Id ==
            // known.Id`) and needs no remap; a write with no id at all (the
            // editor's own "brand new, never yet saved" case) has nothing a
            // `copy` document could have referenced, so there is nothing to
            // record either.
            if (known is null && w.Id is not null)
                idRemap[w.Id] = entry.Id;

            merged.Add(entry);
            if (entry.Reach.Count == 0) needsMeasuring.Add(i);
        }

        if (needsMeasuring.Count > 0)
        {
            var origin = new GeoPoint(update.Lat, update.Lng);
            var points = needsMeasuring
                .Select(i => new GeoPoint(merged[i].Lat, merged[i].Lng))
                .ToArray();

            Dictionary<string, NearbyReach?[]> measured;
            try
            {
                measured = new Dictionary<string, NearbyReach?[]>();
                foreach (var prof in NearbyGroups.Profiles)
                    measured[prof] = await ors.MatrixAsync(
                        origin, points, prof, req.HttpContext.RequestAborted);
            }
            catch (OrsUnavailableException)
            {
                // Before anything is written: an entry with no figures must
                // never be saved.
                return new ObjectResult(new { error = "ors_unavailable" }) { StatusCode = 503 };
            }

            for (var k = 0; k < needsMeasuring.Count; k++)
            {
                var i = needsMeasuring[k];
                // A profile ORS could not route keeps no entry, so the public
                // page hides that entry under that toggle instead of showing a
                // blank figure.
                var reach = NearbyGroups.Profiles
                    .Where(x => measured[x][k] is not null)
                    .ToDictionary(x => x, x => measured[x][k]!);
                // Unroutable by EVERY profile means the owner picked somewhere
                // we cannot describe honestly. Refuse it rather than store an
                // entry with no figures.
                if (reach.Count == 0) return BadRequest("nearby_unroutable");
                // Beyond its group's radius the SELECTION is now wrong, not
                // just the number — so it is flagged rather than silently kept
                // or dropped.
                var far = reach.TryGetValue("foot", out var onFoot)
                    // The entry's OWN reach, not its group's: a tram stop is
                    // searched for across 2.5 km on purpose, so measuring it
                    // against transport's 800 m would flag every tram stop
                    // ever saved as "farther since the pin moved".
                    && onFoot.Metres > NearbyGroups.RadiusMetres(
                        merged[i].Group, merged[i].Type) * 1.5;
                merged[i] = merged[i] with
                {
                    Reach = reach,
                    MeasuredAt = DateTimeOffset.UtcNow.ToString("o"),
                    NeedsCheck = far,
                };
            }
        }

        doc.Nearby = [.. merged];

        // Rewrite `placeRef`/`placeCard` ids through the map above, now that
        // it is complete — AFTER the rebuild, on the document `CheckDetails`
        // already validated against the INCOMING ids, never before. This is
        // not a D8 "repair" of invalid content: `doc.Copy` already passed
        // validation; this only updates an identifier the server itself just
        // minted so the reference keeps resolving, and touches no prose.
        if (idRemap.Count > 0 && doc.Copy is not null)
            doc.Copy = new BilingualDoc(
                HostValidation.RemapPlaceIds(doc.Copy.Es, idRemap),
                HostValidation.RemapPlaceIds(doc.Copy.En, idRemap));

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

        // Same ordering reason as the blobs above: only drop the cached routes
        // once the new pin is safely written. Every cached route was measured
        // from the OLD pin, so once it has moved they are all stale, even for
        // entries that did not themselves change.
        if (saved is OkObjectResult && pinMoved)
            await cache.DropAsync(doc.Id, req.HttpContext.RequestAborted);

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

        var invalid = HostValidation.CheckStatus(update.Status, doc!);
        if (invalid is not null) return BadRequest(invalid);

        // A resubmitted listing carries no reviewer's note. The note answers
        // "why was this rejected", and the owner has just changed the thing it
        // was about — leaving it would have the portfolio explain a rejection
        // that no longer applies to what is in the queue.
        if (update.Status == "pending_review") doc!.ReviewNote = null;

        doc!.Status = update.Status!;

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
        bool hiddenFromGallery;
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
            hiddenFromGallery = form["hiddenFromGallery"] == "true";
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
                Url: urls["full"],
                IsFloorplan: isFloorplan,
                // Last, so a new photo joins the end of the gallery rather
                // than displacing the cover the owner chose.
                SortOrder: doc.Photos.Length == 0 ? 0 : doc.Photos.Max(p => p.SortOrder) + 1,
                // The caller's own intent, exactly like `isFloorplan` above —
                // a description-editor upload wants this true by default
                // (the photo exists only to be referenced from the text), and
                // PhotoManager's gallery upload always sends false.
                HiddenFromGallery: hiddenFromGallery,
                CardUrl: urls["card"],
                DetailUrl: urls["detail"],
                CapturedLat: processed.Capture.Lat,
                CapturedLng: processed.Capture.Lng,
                CapturedAt: processed.Capture.At),
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
                OverrideFor(doc, b.Start!, b.End!),
                // Kind is decided HERE, never sent: a span already on the
                // document keeps what it was, and a span the owner is writing
                // for the first time is their own use — the only thing this
                // endpoint can express (ADR-031). Stays arrive by seed or by
                // Ebrostay, already labelled null, and keep their turnaround
                // through the same match that carries the override.
                KindFor(doc, b.Start!, b.End!))),
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

    // Same span-match as OverrideFor, but here "no match" and "match with no
    // kind" are DIFFERENT answers — a null kind is a stay and must stay one,
    // while an unmatched span is a block the owner just wrote and is their
    // own use. Collapsing the two with `?.` would relabel every stay as
    // own-use on the first calendar save and silently drop its turnaround.
    private static string? KindFor(PropertyDoc doc, string start, string end)
    {
        var stored = doc.Availability
            .FirstOrDefault(r => r.Start == start && r.End == end && r.Status != "hold");
        return stored is null ? "own_use" : stored.Kind;
    }

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

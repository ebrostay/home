using System.Globalization;
using System.Text.RegularExpressions;
using Ebrostay.Api.Services;

namespace Ebrostay.Api.Models;

// What the owner may send from "Manage property", and the rules that make each
// payload safe to apply. Validation lives here rather than in the function so
// the rules read as one list and the function reads as one flow.
//
// ADR-025 draws the line these two payloads sit on: pricing and availability
// apply immediately and leave `status` alone; content edits (copy, photos,
// address, capacity) go through the editor and re-enter review. Neither DTO
// below can express a content change or a status change, so the boundary is
// structural — it cannot be bypassed by a well-formed request.

public record PricingUpdate(
    int PriceNumber,
    int? DepositAmount,
    string? BillsPolicy,
    int? UtilitiesCapEur,
    int MinStayMonths,
    string? CleaningBy,
    int? CleaningFeeEur,
    int? TurnoverDays);

/// One owner-authored block. `end` is EXCLUSIVE (§2.2.3). No status field:
/// everything the owner writes here is `confirmed` — holds belong to the
/// booking flow and are preserved untouched across a write.
public record AvailabilityWrite(string? Start, string? End, string? Note);

public record AvailabilityUpdate(AvailabilityWrite[]? Blocks);

public record BilingualWrite(string? Es, string? En);

/// A photo the owner is keeping. There is no `url` the owner can invent: the
/// validator rejects any URL not already on the document, so this payload can
/// reorder, re-flag and drop photos but never introduce one. Uploading is a
/// separate, still-unbuilt path (ADR-019, ADR-027).
public record PhotoWrite(string? Url, bool IsFloorplan, bool HiddenFromGallery = false);

/// What a client may say about a nearby entry. Note what is ABSENT: reach
/// figures. They are measured server-side and never accepted (ADR-028
/// Decision 8), the same posture as photo URLs in ADR-027 Decision 3.
public record NearbyWrite(
    string? Id,
    string? Group,
    string? Type,
    BilingualWrite? CustomType,
    string? Name,
    double Lat,
    double Lng);

/// The content half of a listing (ADR-025). Everything here is a claim about
/// the home, so saving it sends an approved listing back to the queue — which
/// is the whole reason it is a different payload from PricingUpdate rather
/// than a wider one. Note what it cannot express: no `status`, no `hostId`,
/// no price, no availability. The boundary is structural.
public record DetailsUpdate(
    string? Name,
    string? Type,
    string? Address,
    string? Postcode,
    string? CadastralRef,
    double Lat,
    double Lng,
    BilingualWrite? Area,
    BilingualDoc? Description,
    bool DescriptionEnApproved,
    BilingualWrite? Details,
    BilingualWrite? Beds,
    int Guests,
    int Bedrooms,
    int Bathrooms,
    int SizeM2,
    int? FloorNumber,
    string? EnergyRating,
    string[]? Amenities,
    /// The baseline amenities answered no — see `PropertyDoc.AmenitiesAbsent`.
    /// Nullable and treated as empty exactly like `Amenities`: this is a
    /// whole-document write, so an omitted array clears the field rather than
    /// leaving it alone.
    string[]? AmenitiesAbsent,
    bool PetsAllowed,
    bool SmokingAllowed,
    bool CouplesAllowed,
    bool SelfCheckin,
    PhotoWrite[]? Photos,
    NearbyWrite[]? Nearby,
    /// Fields an import filled that the owner has not yet edited (ADR-033).
    /// Null on every listing that was never imported.
    string[]? Imported,
    /// Which of the six sources, for the step banner's eyebrow.
    string? ImportSource);

/// The only status move an owner may make on their own (ADR-024): closing a
/// listing to new requests, and reopening it. Publishing is an admin act and
/// is not expressible here.
public record StatusUpdate(string? Status);

/// One suggestion the owner has declined. `At` is absent: the date is stamped
/// by the server, because a client-authored "I decided this in 2019" is worth
/// nothing and the field is read by a human reviewer.
public record DeclinedWrite(string? Field, string? Source, string? Value, string? For);

/// The whole list, replaced wholesale — the same shape as AvailabilityUpdate,
/// for the same reason: a partial write needs an identity for each row, and the
/// list is small enough that sending it entire is simpler than inventing one.
///
/// Note what this payload cannot express: no status, no price, no content. An
/// owner dismissing a banner must not be able to move their listing, and under
/// ADR-027 decision 2 *any* content save would send a published listing back to
/// review — which is exactly why this is not part of DetailsUpdate.
public record DeclinedUpdate(DeclinedWrite[]? Declined);

public static class HostValidation
{
    /// A listing carries a small, bounded calendar (§2.2.3 "tens, not
    /// thousands"). The cap is what keeps that true when the writer is a form.
    public const int MaxBlocks = 60;

    public const int MaxPrice = 50_000;
    public const int MaxDeposit = 100_000;
    public const int MaxCap = 2_000;
    public const int MaxCleaningFee = 1_000;
    /// A month of turnaround is not a turnaround, it is a listing that should
    /// be paused instead.
    public const int MaxTurnoverDays = 30;
    private const int MaxNoteLength = 120;

    public const int MaxNameLength = 120;
    public const int MaxAddressLength = 200;
    public const int MaxAreaLength = 120;
    public const int MaxDescriptionLength = 4_000;
    public const int MaxDetailsLength = 2_000;
    /// Caps for the description document walked by `RichText` below. Mirror
    /// `RICH_LIMITS` in `app/lib/rich-text.ts` exactly — the two are the same
    /// rule stated twice, and a drift between them is either a lost save or a
    /// hole, never a harmless difference.
    public const int MaxDescriptionNodes = 400;
    public const int MaxDescriptionDepth = 5;
    public const int MaxCaptionLength = 200;
    public const int MaxBedsLength = 400;
    public const int MaxAmenities = 40;
    public const int MaxPhotos = 40;
    public const int MaxGuests = 32;
    public const int MaxRooms = 20;
    public const int MaxSizeM2 = 2_000;
    /// Sótano 2 up to a tower's 60th. Wider than Zaragoza needs, narrow enough
    /// that a typo of 500 is caught.
    public const int MinFloor = -2;
    public const int MaxFloor = 60;

    /// Bounded per group and in total (ADR-028 Decision 6): six of one kind is
    /// already more than a visitor reads, and 24 keeps the whole feature "tens,
    /// not thousands" like the calendar above.
    public const int MaxNearby = 24;
    public const int MaxNearbyPerGroup = 6;
    public const int MaxNearbyNameLength = 80;
    public const int MaxNearbyCustomTypeLength = 40;

    /// Four fields, two sources — eight combinations, and identity is the pair,
    /// so a correct client never exceeds eight. The cap is what keeps that true
    /// when the writer is not a correct client.
    public const int MaxDeclined = 12;
    public const int MaxDeclinedValueLength = 64;

    private static readonly string[] DeclinableFields = ["pin", "postcode", "area", "size"];
    private static readonly string[] SuggestionSources = ["osm", "catastro"];

    private static readonly string[] BillsPolicies = ["included", "capped", "excluded"];
    private static readonly string[] CleaningParties = ["host", "platform"];
    private static readonly string[] PropertyTypes = ["apartment", "room", "home"];
    private static readonly string[] EnergyRatings = ["A", "B", "C", "D", "E", "F", "G"];
    /// The only statuses an owner may set themselves. `published` is reachable
    /// only through Reopen below, and only from `paused` (ADR-024);
    /// `pending_review` only by submitting a finished draft (ADR-030). Nothing
    /// here lets an owner publish their own listing.
    private static readonly string[] OwnerStatuses = ["paused", "published", "pending_review"];

    /// Open drafts one owner may hold at once. Not a business rule about how
    /// many homes anyone may list — it is the ceiling on how many EMPTY
    /// documents a single "Add a property" button can create, since the wizard
    /// writes one the moment an address is entered and an owner who opens and
    /// abandons it leaves one behind. Finishing a draft frees the slot.
    public const int MaxOpenDrafts = 8;

    private static readonly string[] DescriptionMarks = ["bold", "italic"];

    /// What each node may contain. An empty array is an ATOM — no children at
    /// all — which is why a photo reference can never hold text.
    private static readonly Dictionary<string, string[]> DescriptionModel = new(StringComparer.Ordinal)
    {
        ["doc"] = ["paragraph", "heading", "bulletList", "orderedList", "callout", "photoFigure", "placeCard"],
        ["paragraph"] = ["text", "photoRef", "placeRef"],
        ["heading"] = ["text"],
        ["bulletList"] = ["listItem"],
        ["orderedList"] = ["listItem"],
        // Paragraphs only, so lists cannot nest.
        ["listItem"] = ["paragraph"],
        ["callout"] = ["paragraph"],
        ["photoFigure"] = [],
        ["placeCard"] = [],
        ["text"] = [],
        ["photoRef"] = [],
        ["placeRef"] = [],
    };

    /// Walks a description document, returning an error code or null.
    ///
    /// REJECTS, never repairs (design D8): silent repair would delete an
    /// owner's words with no explanation, and the editor makes every rejection
    /// here unreachable — so one means a bug or a tampered payload.
    ///
    /// `photoUrls` and `entryIds` MUST come from the INCOMING payload, not the
    /// stored document (D9). One save can both delete a photo and reference
    /// it; validating against the stored arrays would let a dangling reference
    /// through while DropBlobsAsync deletes the blob underneath it.
    ///
    /// Depth and node count are checked DURING the walk, so a nesting bomb is
    /// refused as soon as the walk reaches it rather than after the tree is
    /// fully validated. (System.Text.Json still has to deserialize the whole
    /// body first — its own MaxDepth of 64 is the backstop for a JSON literal
    /// deep enough to matter before this walk ever starts.)
    public static string? RichText(RichNode? doc, IReadOnlySet<string> photoUrls, IReadOnlySet<string> entryIds)
    {
        if (doc is null) return null;
        if (doc.Type != "doc") return "description_bad_root";

        var budget = MaxDescriptionNodes;
        var text = 0;

        string? Walk(RichNode n, int depth)
        {
            if (depth > MaxDescriptionDepth) return "description_too_deep";
            if (--budget < 0) return "description_too_many_nodes";
            if (n.Type is null || !DescriptionModel.TryGetValue(n.Type, out var allowed)) return "description_bad_node";

            var isAtom = allowed.Length == 0;
            if (isAtom && n.Content is { Length: > 0 }) return "description_bad_node";
            if (n.Type != "text" && n.Text is not null) return "description_bad_node";
            if (n.Type == "text") text += n.Text?.Length ?? 0;

            // `m?.Type is null` also catches a null array element (`"marks":[null]`
            // deserializes to a null RichMark) — without it that shape throws
            // instead of failing closed with a 400.
            foreach (var m in n.Marks ?? [])
                if (m?.Type is null || !DescriptionMarks.Contains(m.Type, StringComparer.Ordinal)) return "description_bad_mark";

            if (n.Type == "heading" && n.Attrs?.Level != 3) return "description_bad_heading";
            if ((n.Attrs?.Caption?.Length ?? 0) > MaxCaptionLength) return "description_bad_caption";

            // IsNullOrEmpty, not `is null`: an owner cannot construct a photo
            // whose url is genuinely the empty string, but a payload that
            // claims one must still be refused rather than falling through to
            // a set lookup that happens to agree.
            if (n.Type is "photoRef" or "photoFigure")
                if (string.IsNullOrEmpty(n.Attrs?.Url) || !photoUrls.Contains(n.Attrs.Url)) return "description_photo_unknown";
            if (n.Type is "placeRef" or "placeCard")
                if (string.IsNullOrEmpty(n.Attrs?.EntryId) || !entryIds.Contains(n.Attrs.EntryId)) return "description_place_unknown";

            // `child?.Type is null` also catches a null array element
            // (`"content":[null]`) for the same reason as the marks guard above.
            foreach (var child in n.Content ?? [])
            {
                if (child?.Type is null || !allowed.Contains(child.Type, StringComparer.Ordinal)) return "description_bad_node";
                var err = Walk(child, depth + 1);
                if (err is not null) return err;
            }
            return null;
        }

        var result = Walk(doc, 1);
        if (result is not null) return result;
        // Text only — references and captions are NOT charged, because their
        // labels live on other records and renaming one must not change the
        // length of a description nobody touched.
        return text > MaxDescriptionLength ? "description_too_long" : null;
    }

    /// Rewrites every `placeRef`/`placeCard` `entryId` through `remap`,
    /// leaving every other node, attribute and mark untouched. Called by
    /// `HostFunctions.UpdateDetails` AFTER `RichText` above has already
    /// validated the incoming document against the incoming (possibly
    /// client-temp) nearby ids, and AFTER the nearby array has been rebuilt
    /// and its new ids are known — `remap` carries only the ids that
    /// actually changed (a client temp id → the server-generated final id);
    /// an id that already matched a stored entry needs no entry and is left
    /// as-is by the `TryGetValue` fallthrough below.
    ///
    /// NOT a D8 violation, even though D8 says the validator "rejects, never
    /// repairs". D8 protects the owner's WORDS: silently repairing invalid
    /// prose would delete something the owner wrote with no explanation.
    /// This rewrites an identifier the SERVER ITSELF minted a moment
    /// earlier — the reference keeps pointing at the exact entry the owner
    /// chose, and not one character of prose changes. Content the owner
    /// wrote is never touched or reinterpreted here.
    ///
    /// `RichNode` is an immutable record, so this returns a rewritten tree
    /// rather than mutating one; `doc` itself is never modified.
    public static RichNode? RemapPlaceIds(RichNode? doc, IReadOnlyDictionary<string, string> remap)
    {
        if (doc is null || remap.Count == 0) return doc;

        RichNode Rewrite(RichNode n)
        {
            var content = n.Content?.Select(Rewrite).ToArray();
            var attrs = n.Attrs;
            if (n.Type is "placeRef" or "placeCard" &&
                attrs?.EntryId is { } id && remap.TryGetValue(id, out var finalId))
                attrs = attrs with { EntryId = finalId };

            return n with { Content = content, Attrs = attrs };
        }

        return Rewrite(doc);
    }

    /// Returns an error code, or null when the payload is applicable. Codes are
    /// stable strings the client maps to bilingual copy — never prose.
    public static string? CheckPricing(PricingUpdate u, int maxStayMonths)
    {
        if (u.PriceNumber < 1 || u.PriceNumber > MaxPrice) return "price_out_of_range";
        if (u.DepositAmount is < 0 or > MaxDeposit) return "deposit_out_of_range";

        var policy = u.BillsPolicy ?? "excluded";
        if (!BillsPolicies.Contains(policy)) return "bills_policy_invalid";
        // A cap is the whole content of the "capped" policy: without a number
        // the listing would promise a ceiling it does not name.
        if (policy == "capped" && u.UtilitiesCapEur is not (> 0 and <= MaxCap))
            return "cap_required";

        if (u.MinStayMonths < 1 || u.MinStayMonths > maxStayMonths)
            return "min_stay_out_of_range";

        var cleaning = u.CleaningBy ?? "platform";
        if (!CleaningParties.Contains(cleaning)) return "cleaning_by_invalid";
        // Only meaningful when the owner is the one doing the turnaround. The
        // platform's rate is policy, and a listing cannot quote its own.
        if (cleaning == "host" && u.CleaningFeeEur is not (>= 0 and <= MaxCleaningFee))
            return "cleaning_fee_out_of_range";

        if (u.TurnoverDays is < 0 or > MaxTurnoverDays) return "turnover_out_of_range";

        return null;
    }

    /// The content payload. Same contract as CheckPricing: a stable code, or
    /// null when the payload is applicable.
    ///
    /// `doc` is passed in because one rule cannot be checked from the payload
    /// alone — see the photo loop.
    public static string? CheckDetails(DetailsUpdate u, PropertyDoc doc)
    {
        var name = u.Name?.Trim();
        // A draft may be nameless, and only a draft (ADR-030). The wizard asks
        // for the address before it asks what to call the home, so its first
        // save carries no name — and refusing that would make the product's
        // "saved as you go" promise false for exactly one step. This is the
        // completeness/safety line the two check sets already draw: an empty
        // name makes a listing INCOMPLETE, which `HostProjection.Sections`
        // counts and submit-for-review enforces; it does not make the payload
        // unsafe. Length is capped either way, because that one is about bytes.
        if (string.IsNullOrEmpty(name) && doc.Status != "draft") return "name_required";
        if (name is { Length: > MaxNameLength }) return "name_too_long";

        if (!PropertyTypes.Contains(u.Type ?? "")) return "type_invalid";

        if (u.Address is { Length: > MaxAddressLength }) return "address_too_long";
        // Optional, but a postcode that is present has one shape in Spain.
        if (!string.IsNullOrWhiteSpace(u.Postcode) &&
            !Regex.IsMatch(u.Postcode.Trim(), "^[0-9]{5}$")) return "postcode_invalid";
        if (!string.IsNullOrWhiteSpace(u.CadastralRef) &&
            !Regex.IsMatch(u.CadastralRef.Trim(), "^[A-Za-z0-9]{14,20}$"))
            return "cadastre_invalid";

        // A pin at 0,0 is in the Gulf of Guinea, and every listing carrying it
        // would cluster there on the map.
        if (u.Lat is < -90 or > 90 || u.Lng is < -180 or > 180) return "coords_invalid";

        if (u.Guests is < 0 or > MaxGuests ||
            u.Bedrooms is < 0 or > MaxRooms ||
            u.Bathrooms is < 0 or > MaxRooms ||
            u.SizeM2 is < 0 or > MaxSizeM2) return "capacity_out_of_range";
        if (u.FloorNumber is < MinFloor or > MaxFloor) return "floor_out_of_range";

        if (!string.IsNullOrWhiteSpace(u.EnergyRating) &&
            !EnergyRatings.Contains(u.EnergyRating.Trim().ToUpperInvariant()))
            return "energy_invalid";

        if (TooLong(u.Area, MaxAreaLength) ||
            TooLong(u.Details, MaxDetailsLength) ||
            TooLong(u.Beds, MaxBedsLength)) return "text_too_long";

        var amenities = u.Amenities ?? [];
        if (amenities.Length > MaxAmenities) return "too_many_amenities";
        // The vocabulary itself lives with the translations, not here — the
        // server only insists on the shape, so shipping a new amenity never
        // needs an API deploy, and a free-text string never reaches the
        // public projection.
        if (amenities.Any(a => !Regex.IsMatch(a ?? "", "^[a-z0-9-]{1,32}$")))
            return "amenity_invalid";
        if (amenities.Distinct(StringComparer.Ordinal).Count() != amenities.Length)
            return "amenity_duplicate";

        // The absences answer the same vocabulary and so take the same three
        // checks — the shape rule is what keeps free text out of the public
        // projection, and it does not stop mattering because the answer was no.
        var absent = u.AmenitiesAbsent ?? [];
        if (absent.Length > MaxAmenities) return "too_many_amenities";
        if (absent.Any(a => !Regex.IsMatch(a ?? "", "^[a-z0-9-]{1,32}$")))
            return "amenity_invalid";
        if (absent.Distinct(StringComparer.Ordinal).Count() != absent.Length)
            return "amenity_duplicate";
        // A home cannot both have and lack the same thing. Nothing in the UI
        // can produce this — the picker's three states are exclusive — so it
        // only ever means a hand-built payload, and letting it through would
        // leave a document whose two arrays contradict each other and whose
        // public page disagrees with the owner's editor.
        if (absent.Intersect(amenities, StringComparer.Ordinal).Any())
            return "amenity_contradiction";

        var photos = u.Photos ?? [];
        if (photos.Length > MaxPhotos) return "too_many_photos";
        var known = doc.Photos.Select(p => p.Url).ToHashSet(StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var p in photos)
        {
            // The load-bearing one. This payload is how a listing's gallery is
            // reordered and trimmed, and every URL in it renders in a public
            // <img>. Accepting an arbitrary URL would let an owner point their
            // listing at any host on the internet — so a photo must already be
            // on the document. New photos arrive by upload, which is a
            // different path and does not exist yet (ADR-019).
            if (p.Url is null || !known.Contains(p.Url)) return "photo_unknown";
            if (!seen.Add(p.Url)) return "photo_duplicate";
        }

        var nearby = u.Nearby ?? [];
        if (nearby.Length > MaxNearby) return "nearby_too_many";

        // Group validity has to be checked before anything groups BY group —
        // otherwise seven entries with a bad or missing group would fail
        // "too many in a group" instead of the more fundamental "not even a
        // real group" they actually have.
        foreach (var n in nearby)
            if (n.Group is null || !NearbyGroups.All.Contains(n.Group)) return "nearby_bad_group";

        foreach (var g in nearby.GroupBy(n => n.Group))
            if (g.Count() > MaxNearbyPerGroup) return "nearby_group_full";

        // Identity is the id — same posture as CheckDeclined's `(field,
        // source)` pair below. Two writes claiming the same existing id
        // would both resolve to the same stored entry in the merge and get
        // saved back under one shared id, corrupting the document (the next
        // save's id lookup would throw). Refused here rather than silently
        // deduplicated.
        var seenIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var n in nearby)
            if (n.Id is not null && !seenIds.Add(n.Id)) return "nearby_duplicate_id";

        foreach (var n in nearby)
        {
            if (string.IsNullOrWhiteSpace(n.Name) || n.Name.Length > MaxNearbyNameLength)
                return "nearby_bad_name";
            if (!NearbyGroups.InZaragoza(n.Lat, n.Lng)) return "nearby_out_of_area";

            if (n.Type is not null)
            {
                // `n.Group` is non-null here — the loop above already refused
                // any entry whose group was null or unknown.
                if (!NearbyGroups.IsKnownType(n.Group!, n.Type)) return "nearby_bad_type";
            }
            else
            {
                // The escape hatch: Spanish required, English optional and falling
                // back to it, mirroring descriptionEnApproved rather than inventing a new
                // state.
                var es = n.CustomType?.Es?.Trim();
                if (string.IsNullOrEmpty(es) || es.Length > MaxNearbyCustomTypeLength)
                    return "nearby_bad_custom";
                if ((n.CustomType?.En?.Trim()?.Length ?? 0) > MaxNearbyCustomTypeLength)
                    return "nearby_bad_custom";
            }
        }

        // Built from the INCOMING payload, not the document (D9): one save can
        // both delete a photo and reference it; validating against the stored
        // arrays would let a dangling reference through while DropBlobsAsync
        // deletes the blob underneath it. Placed after the photo and nearby
        // loops above so both sets are already validated, not just parsed.
        var photoUrls = photos.Select(p => p.Url!).ToHashSet(StringComparer.Ordinal);
        // NearbyEntry.Id is server-generated (HostFunctions.UpdateDetails
        // assigns a fresh Guid to any write whose Id does not already match a
        // stored entry, AFTER this validator runs) — so an entry newly added
        // in this same save carries a null Id here. A placeRef literally
        // cannot reference an entry that has no id yet, so only the ids the
        // payload actually carries are valid reference targets.
        var entryIds = nearby
            .Where(n => n.Id is not null)
            .Select(n => n.Id!)
            .ToHashSet(StringComparer.Ordinal);

        var descriptionError = RichText(u.Description?.Es, photoUrls, entryIds)
                     ?? RichText(u.Description?.En, photoUrls, entryIds);
        if (descriptionError is not null) return descriptionError;

        var importedError = CheckImported(u.Imported, u.ImportSource);
        if (importedError is not null) return importedError;

        return null;
    }

    /// Owners close, reopen and submit; only an admin publishes. Reopening is
    /// allowed from `paused` alone — a draft that could publish itself would be
    /// a listing that never met a reviewer.
    ///
    /// Submitting (ADR-030) takes the whole document rather than its status,
    /// because "may this be submitted" is a question about what is IN the
    /// listing, not about which state it is in. The completeness test is
    /// `HostProjection`'s, the same eleven checks the portfolio's draft
    /// progress bar counts — so a bar reading 11/11 and a submit that bounces
    /// cannot both happen.
    public static string? CheckStatus(string? next, PropertyDoc doc)
    {
        var current = doc.Status;
        if (!OwnerStatuses.Contains(next ?? "")) return "status_invalid";
        if (next == "published" && current != "paused") return "status_not_allowed";
        if (next == "paused" && current is not ("published" or "paused"))
            return "status_not_allowed";
        if (next == "pending_review")
        {
            // Resubmitting a rejected listing is the same act as submitting a
            // draft; a listing already in the queue, published or paused has
            // nothing to submit.
            if (current is not ("draft" or "rejected")) return "status_not_allowed";
            if (HostProjection.SectionsDone(doc) < HostProjection.SectionsTotal)
                return "listing_incomplete";
        }
        return null;
    }

    private static bool TooLong(BilingualWrite? b, int max) =>
        b?.Es is { } es && es.Length > max || b?.En is { } en && en.Length > max;

    /// Declined suggestions (§2.2.4). Both vocabularies are closed, and
    /// `(field, source)` is the identity — a list carrying the same pair twice
    /// has no defined meaning, so it is refused rather than deduplicated.
    ///
    /// What is deliberately NOT checked is whether `For` matches the document.
    /// It cannot be: an owner may retype the address and decline the geocoder's
    /// answer about the new one before saving either, so the question a
    /// suggestion belongs to is routinely one the stored document has not seen
    /// yet. An entry keyed to a question that never arrives is inert — the
    /// editor ignores any whose `For` is not the current one.
    public static string? CheckDeclined(DeclinedWrite[] declined)
    {
        if (declined.Length > MaxDeclined) return "too_many_declined";

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var d in declined)
        {
            if (!DeclinableFields.Contains(d.Field ?? "") ||
                !SuggestionSources.Contains(d.Source ?? "")) return "declined_invalid";

            if (string.IsNullOrWhiteSpace(d.Value) ||
                d.Value.Length > MaxDeclinedValueLength) return "declined_invalid";
            // `For` is an address or a cadastral reference; the address bound is
            // the wider of the two and the one that matters.
            if (string.IsNullOrWhiteSpace(d.For) ||
                d.For.Length > MaxAddressLength) return "declined_invalid";

            if (!seen.Add($"{d.Field}|{d.Source}")) return "declined_duplicate";
        }

        return null;
    }

    /// The marks an owner has not yet cleared (ADR-033 Decision 8). Stored, not
    /// derived: a field the owner typed and a field we filled look identical in
    /// the data, so "is it non-empty" cannot answer this.
    public static string? CheckImported(string[]? imported, string? source)
    {
        // The cap is on what ARRIVED, before filtering: it bounds the payload,
        // and a caller sending ten thousand junk keys should be refused rather
        // than quietly filtered down to nothing.
        if (imported is not null && imported.Length > ImportKeys.MaxKeys)
            return "imported_too_many";

        var known = KnownImported(imported);

        if (known is null || known.Length == 0)
            // No marks and no source is an ordinary listing. A source with no
            // marks is an import the owner has fully reviewed — also fine.
            return source is null || ImportSources.IsKnown(source)
                ? null
                : "import_source_invalid";

        if (!ImportSources.IsKnown(source)) return "import_source_invalid";
        return null;
    }

    /// The marks worth storing. An unrecognised key is DROPPED here rather
    /// than rejected by the check above, and the asymmetry with the callback
    /// (`ImportValidation.CheckCallback`, which still refuses one) is the
    /// point:
    ///
    /// The callback is where the vocabulary is ASSERTED — an external pipeline
    /// naming a field it filled. A key we do not know there means the pipeline
    /// and this API disagree about what exists, and it must fail loudly before
    /// anything is written.
    ///
    /// The owner's PUT only ECHOES marks this API itself wrote and handed back
    /// on the GET. So an unknown key here cannot be a client inventing a claim
    /// — it can only be a vocabulary that shrank underneath a stored document.
    /// That is not hypothetical: ADR-034 renamed `copy` to `description` and
    /// accepted a re-seed as the cost, which covered the sample homes but not
    /// owners' in-flight drafts. Every draft imported before that rename came
    /// back carrying `copy`, and rejecting it made the listing permanently
    /// unsaveable — the owner retypes a description, hits Continue, and loses
    /// the lot to a 400 naming a field they have never heard of, with no path
    /// out of it from the UI.
    ///
    /// Dropping costs nothing an owner wrote. A mark is review state — "nobody
    /// has looked at this value yet" — and a mark naming a field that no longer
    /// exists is already inert: it maps to no step, renders no glyph and gates
    /// nothing. This is not the repair D8 refuses for rich text, where repair
    /// would silently delete an owner's words; here there are no words, and the
    /// stale mark clears itself on the first save.
    public static string[]? KnownImported(string[]? imported) =>
        // Null and empty are DIFFERENT: null is "never imported", empty is
        // "imported and fully reviewed". Filtering must not collapse them.
        imported is null ? null : imported.Where(ImportKeys.All.Contains).ToArray();

    /// Blocks must be well-formed, non-overlapping among themselves, and must
    /// not collide with a hold the booking flow is still holding. The overlap
    /// predicate is the one from §2.2.3 — half-open, strict `<` on both sides.
    public static string? CheckAvailability(
        AvailabilityWrite[] blocks, IEnumerable<AvailabilityRange> survivingHolds)
    {
        if (blocks.Length > MaxBlocks) return "too_many_blocks";

        foreach (var b in blocks)
        {
            if (!IsIsoDay(b.Start) || !IsIsoDay(b.End)) return "date_invalid";
            // Ordinal string comparison IS date comparison for ISO days, which
            // is why the whole system stores them this way.
            if (string.CompareOrdinal(b.End, b.Start) <= 0) return "date_range_empty";
            if (b.Note is not null && b.Note.Length > MaxNoteLength) return "note_too_long";
        }

        for (var i = 0; i < blocks.Length; i++)
        {
            for (var j = i + 1; j < blocks.Length; j++)
                if (Overlaps(blocks[i].Start!, blocks[i].End!, blocks[j].Start!, blocks[j].End!))
                    return "blocks_overlap";

            foreach (var hold in survivingHolds)
                if (Overlaps(blocks[i].Start!, blocks[i].End!, hold.Start, hold.End))
                    return "hold_conflict";
        }

        return null;
    }

    public static bool Overlaps(string aStart, string aEnd, string bStart, string bEnd) =>
        string.CompareOrdinal(aStart, bEnd) < 0 && string.CompareOrdinal(bStart, aEnd) < 0;

    private static bool IsIsoDay(string? value) =>
        value is { Length: 10 } &&
        DateOnly.TryParseExact(
            value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
}

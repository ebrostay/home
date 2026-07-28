using System.Globalization;
using System.Text.RegularExpressions;

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
public record PhotoWrite(string? Url, bool IsFloorplan);

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
    BilingualWrite? Copy,
    bool CopyEnApproved,
    BilingualWrite? Details,
    BilingualWrite? Beds,
    int Guests,
    int Bedrooms,
    int Bathrooms,
    int SizeM2,
    int? FloorNumber,
    string? EnergyRating,
    string[]? Amenities,
    bool PetsAllowed,
    bool SmokingAllowed,
    bool CouplesAllowed,
    bool SelfCheckin,
    PhotoWrite[]? Photos);

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
    public const int MaxCopyLength = 4_000;
    public const int MaxDetailsLength = 2_000;
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
    /// The only status an owner may set themselves. `published` is reachable
    /// only through Reopen below, and only from `paused` (ADR-024).
    private static readonly string[] OwnerStatuses = ["paused", "published"];

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
        if (string.IsNullOrEmpty(name)) return "name_required";
        if (name.Length > MaxNameLength) return "name_too_long";

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
            TooLong(u.Copy, MaxCopyLength) ||
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

        return null;
    }

    /// Owners close and reopen; only an admin publishes. Reopening is allowed
    /// from `paused` alone — a draft that could publish itself would be a
    /// listing that never met a reviewer.
    public static string? CheckStatus(string? next, string current)
    {
        if (!OwnerStatuses.Contains(next ?? "")) return "status_invalid";
        if (next == "published" && current != "paused") return "status_not_allowed";
        if (next == "paused" && current is not ("published" or "paused"))
            return "status_not_allowed";
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

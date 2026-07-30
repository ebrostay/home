namespace Ebrostay.Api.Models;

// What crosses the wire into the import endpoints (ADR-033 Decision 6).
//
// THE ENGLISH IS UNREPRESENTABLE HERE. `ImportListingPatch` has an `AreaEs`
// and no `AreaEn`, a `DescriptionEs` and no `DescriptionEn`. System.Text.Json silently drops
// any JSON property it has no member for, so a pipeline that returns a
// machine-read English paragraph does not get its value rejected — it gets it
// discarded, structurally, with no allowlist to maintain. Same idiom as
// RichMark, which cannot carry an href because there is nowhere for one to
// live. §10.5: an approval gate the owner clicks through is worse than no
// English.

public record ImportStart(string? Url);

/// A partial listing. Every member is nullable and absent means "the portal
/// did not say" — which is NOT the same as "the portal said empty".
public record ImportListingPatch(
    string? Address = null,
    string? Postcode = null,
    string? CadastralRef = null,
    double? Lat = null,
    double? Lng = null,
    string? AreaEs = null,
    string? DescriptionEs = null,
    string? DetailsEs = null,
    string? BedsEs = null,
    string? Name = null,
    string? Type = null,
    int? Guests = null,
    int? Bedrooms = null,
    int? Bathrooms = null,
    int? SizeM2 = null,
    int? FloorNumber = null,
    string? EnergyRating = null,
    string[]? Amenities = null,
    bool? PetsAllowed = null,
    bool? SmokingAllowed = null,
    bool? CouplesAllowed = null,
    bool? SelfCheckin = null);

public record ImportPricingPatch(
    int? PriceNumber = null,
    int? DepositAmount = null,
    string? BillsPolicy = null,
    int? UtilitiesCapEur = null,
    int? MinStayMonths = null);

/// `Imported` is authoritative and travels with the payload. It is never
/// derived from "which fields are non-null" — see the Global Constraints.
public record ImportResult(
    ImportListingPatch Listing,
    ImportPricingPatch Pricing,
    string[] Imported);

public record ImportCallback(string? Stage, ImportResult? Result, ImportError? Error);

public static class ImportValidation
{
    private static readonly string[] BillsPolicies = ["included", "capped", "excluded"];
    private static readonly string[] PropertyTypes = ["apartment", "room", "home"];
    private static readonly string[] EnergyRatings = ["A", "B", "C", "D", "E", "F", "G"];

    public static string? CheckCallback(ImportCallback callback)
    {
        var stage = callback.Stage ?? "";
        if (!ImportStage.All.Contains(stage)) return "stage_invalid";
        if (stage == ImportStage.Done && callback.Result is null) return "result_required";
        if (stage == ImportStage.Failed && callback.Error is null) return "error_required";

        if (callback.Error is not null && !ImportError.Codes.Contains(callback.Error.Code))
            return "error_code_invalid";

        if (callback.Result is { } result)
        {
            // Every member of ImportResult is a non-nullable reference type,
            // but that is a compile-time promise only: System.Text.Json will
            // happily deserialize `{"result":{}}` by leaving Listing/Pricing/
            // Imported null, and the pipeline is a third party — a bad day
            // there must be a 400, not a NullReferenceException here.
            if (result.Listing is null || result.Pricing is null || result.Imported is null)
                return "result_invalid";
            if (result.Imported.Length > ImportKeys.MaxKeys) return "imported_too_many";
            if (result.Imported.Any(k => !ImportKeys.All.Contains(k)))
                return "imported_unknown_field";
        }
        return null;
    }

    /// Drop anything implausible, and drop its MARK with it. Not clamped to
    /// the ceiling: a value we invented would arrive wearing a glyph that says
    /// we read it off the owner's own listing, which is the one thing the
    /// glyph must never lie about.
    public static ImportResult Clamp(ImportResult result)
    {
        var dropped = new HashSet<string>(StringComparer.Ordinal);

        int? Bounded(int? value, int min, int max, string key)
        {
            if (value is null) return null;
            if (value < min || value > max) { dropped.Add(key); return null; }
            return value;
        }

        string? Text(string? value, int max, string key)
        {
            if (value is null) return null;
            var trimmed = value.Trim();
            if (trimmed.Length == 0 || trimmed.Length > max) { dropped.Add(key); return null; }
            return trimmed;
        }

        string? OneOf(string? value, string[] allowed, string key)
        {
            if (value is null) return null;
            if (!allowed.Contains(value)) { dropped.Add(key); return null; }
            return value;
        }

        // Defensive against a caller that skipped CheckCallback (the normal
        // Callback flow never does): a sub-object System.Text.Json left null
        // must not crash a `with` expression here either.
        var l = result.Listing ?? new ImportListingPatch();
        var lat = l.Lat; var lng = l.Lng;
        if (lat is not null && (lat < -90 || lat > 90)) { lat = null; dropped.Add("pin"); }
        if (lng is not null && (lng < -180 || lng > 180)) { lng = null; dropped.Add("pin"); }

        var amenities = l.Amenities;
        if (amenities is not null && amenities.Length > HostValidation.MaxAmenities)
        {
            amenities = null; dropped.Add("amenities");
        }

        var postcode = l.Postcode;
        if (postcode is not null && !System.Text.RegularExpressions.Regex.IsMatch(
                postcode, "^[0-9]{5}$"))
        {
            postcode = null; dropped.Add("postcode");
        }

        var listing = l with
        {
            Address = Text(l.Address, HostValidation.MaxAddressLength, "address"),
            Postcode = postcode,
            CadastralRef = Text(l.CadastralRef, 40, "cadastralRef"),
            Lat = lat,
            Lng = lng,
            AreaEs = Text(l.AreaEs, HostValidation.MaxAreaLength, "area"),
            DescriptionEs = Text(l.DescriptionEs, HostValidation.MaxDescriptionLength, "description"),
            DetailsEs = Text(l.DetailsEs, HostValidation.MaxDetailsLength, "details"),
            BedsEs = Text(l.BedsEs, HostValidation.MaxBedsLength, "beds"),
            Name = Text(l.Name, HostValidation.MaxNameLength, "name"),
            Type = OneOf(l.Type, PropertyTypes, "type"),
            Guests = Bounded(l.Guests, 1, HostValidation.MaxGuests, "guests"),
            Bedrooms = Bounded(l.Bedrooms, 1, HostValidation.MaxRooms, "bedrooms"),
            Bathrooms = Bounded(l.Bathrooms, 1, HostValidation.MaxRooms, "bathrooms"),
            SizeM2 = Bounded(l.SizeM2, 1, HostValidation.MaxSizeM2, "sizeM2"),
            FloorNumber = Bounded(l.FloorNumber, HostValidation.MinFloor,
                                  HostValidation.MaxFloor, "floorNumber"),
            EnergyRating = OneOf(l.EnergyRating, EnergyRatings, "energyRating"),
            Amenities = amenities,
        };

        var p = result.Pricing ?? new ImportPricingPatch();
        var pricing = p with
        {
            PriceNumber = Bounded(p.PriceNumber, 1, HostValidation.MaxPrice, "price"),
            DepositAmount = Bounded(p.DepositAmount, 1, HostValidation.MaxDeposit, "depositAmount"),
            BillsPolicy = OneOf(p.BillsPolicy, BillsPolicies, "billsPolicy"),
            UtilitiesCapEur = Bounded(p.UtilitiesCapEur, 1, HostValidation.MaxCap, "utilitiesCapEur"),
            MinStayMonths = Bounded(p.MinStayMonths, 1, 11, "minStayMonths"),
        };

        return new ImportResult(listing, pricing,
            (result.Imported ?? []).Where(k => !dropped.Contains(k)).ToArray());
    }
}

/// Plain text from an extractor → the closed description schema (ADR-032).
/// Mirrors `paragraphDoc` in app/lib/rich-text.ts, except that it splits on
/// blank lines: a portal description is several paragraphs and collapsing them
/// into one would be an edit, not a transfer.
public static class RichTextBuilder
{
    public static RichNode ParagraphDoc(string? text)
    {
        var paragraphs = (text ?? "")
            .Replace("\r\n", "\n")
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .Select(p => new RichNode("paragraph",
                [new RichNode("text", null, p, null, null)], null, null, null))
            .ToArray();

        return new RichNode("doc", paragraphs, null, null, null);
    }
}

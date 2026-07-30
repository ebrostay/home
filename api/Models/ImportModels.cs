namespace Ebrostay.Api.Models;

// The AI-assisted import (ADR-033). Nothing here does I/O.

/// One source we will read, and how its host is recognised. `AnyTld` exists
/// for the two international sites: Airbnb and Booking answer on dozens of
/// TLDs and an owner will paste whichever one their browser gave them.
public record ImportSourceDef(string Key, string[] Domains, bool AnyTld);

public static class ImportSources
{
    /// The closed list. Named on screen BEFORE anything is pasted, because an
    /// unmapped page puts values in the wrong fields and a wrong field the
    /// owner did not notice is worse than an empty form.
    public static readonly ImportSourceDef[] All =
    [
        new("idealista",  ["idealista.com"],  false),
        new("fotocasa",   ["fotocasa.es"],    false),
        new("habitaclia", ["habitaclia.com"], false),
        new("pisos",      ["pisos.com"],      false),
        new("airbnb",     ["airbnb"],         true),
        new("booking",    ["booking"],        true),
    ];

    public static bool IsKnown(string? key) =>
        key is not null && All.Any(s => s.Key == key);
}

/// Every field an import may claim to have filled. The client's copy is
/// `IMPORT_KEYS` in app/lib/import.ts and the two must stay equal — this list
/// is what the mark renderer iterates and what the callback validates, so a
/// drift is either an unmarked field or a rejected callback.
///
/// Grouped controls carry ONE key for the group, not one per option: `type`,
/// `energyRating`, `amenities`, `billsPolicy`, `minStayMonths` and each house
/// rule. A portal's feature list mapping to nine of fifteen amenities is still
/// one answer to one question.
public static class ImportKeys
{
    public static readonly HashSet<string> All = new(StringComparer.Ordinal)
    {
        "address", "postcode", "pin", "area", "cadastralRef",
        "name", "type", "sizeM2", "bedrooms", "bathrooms", "guests",
        "floorNumber", "energyRating",
        "copy", "details", "beds",
        "amenities",
        "price", "billsPolicy", "utilitiesCapEur", "depositAmount", "minStayMonths",
        "petsAllowed", "smokingAllowed", "couplesAllowed", "selfCheckin",
    };

    /// 26 keys exist; the cap is what keeps that true when the writer is not a
    /// correct client. Same reasoning as MaxDeclined in HostValidation.
    public const int MaxKeys = 32;
}

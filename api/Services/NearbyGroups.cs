using System.Globalization;

namespace Ebrostay.Api.Services;

/// The closed vocabulary, and the ONLY place a group's search radius lives.
///
/// Radius is per group because "nearby" is not one distance: a bus stop is
/// nearby at 800 m and a hospital at 10 km, and a single radius is wrong at
/// both ends (ADR-028 Decision 6).
///
/// `app/lib/nearby.ts` mirrors the group and type names for the editor's select.
/// THIS copy is authoritative — a client cannot be trusted to constrain itself.
public static class NearbyGroups
{
    public static readonly IReadOnlyList<string> All =
        ["transport", "groceries", "food", "outdoors", "health"];

    public static readonly IReadOnlyList<string> Profiles = ["foot", "car"];

    public static string OrsProfile(string profile) => profile switch
    {
        "foot" => "foot-walking",
        "car" => "driving-car",
        _ => throw new ArgumentOutOfRangeException(nameof(profile)),
    };

    public static int RadiusMetres(string group) => group switch
    {
        "transport" => 800,
        "groceries" => 1000,
        "food" => 1000,
        "outdoors" => 2000,
        "health" => 10000,
        _ => throw new ArgumentOutOfRangeException(nameof(group)),
    };

    /// The OSM tag pairs each group searches for. Returned as PAIRS rather than
    /// as an assembled query string: the caller has to interleave an
    /// `(around:…)` clause after every selector, and doing that by string
    /// surgery on an assembled query is the kind of thing that works until
    /// someone adds a selector containing the separator.
    public static (string Key, string Value)[] OverpassTags(string group) => group switch
    {
        "transport" =>
        [
            ("railway", "tram_stop"), ("highway", "bus_stop"),
            ("railway", "station"), ("amenity", "bicycle_rental"),
            ("amenity", "taxi"),
        ],
        "groceries" =>
        [
            ("shop", "supermarket"), ("amenity", "marketplace"),
            ("shop", "bakery"), ("shop", "convenience"), ("shop", "mall"),
        ],
        "food" =>
        [
            ("amenity", "restaurant"), ("amenity", "cafe"),
            ("amenity", "bar"), ("amenity", "pub"),
        ],
        "outdoors" =>
        [
            ("leisure", "park"), ("leisure", "sports_centre"),
            ("leisure", "swimming_pool"), ("leisure", "playground"),
        ],
        "health" =>
        [
            ("amenity", "pharmacy"), ("amenity", "clinic"),
            ("amenity", "hospital"), ("amenity", "dentist"),
            ("amenity", "veterinary"),
        ],
        _ => throw new ArgumentOutOfRangeException(nameof(group)),
    };

    /// OSM tag → our vocabulary key. Returns null for anything unmapped, which
    /// the lookup drops rather than guessing at.
    public static string? TypeOf(string key, string value) => (key, value) switch
    {
        ("railway", "tram_stop") => "tram",
        ("highway", "bus_stop") => "bus",
        ("railway", "station") => "rail",
        ("amenity", "bicycle_rental") => "bikeshare",
        ("amenity", "taxi") => "taxi",
        ("shop", "supermarket") => "supermarket",
        ("amenity", "marketplace") => "market",
        ("shop", "bakery") => "bakery",
        ("shop", "convenience") => "convenience",
        ("shop", "mall") => "mall",
        ("amenity", "restaurant") => "restaurant",
        ("amenity", "cafe") => "cafe",
        ("amenity", "bar") => "bar",
        ("amenity", "pub") => "bar",
        ("leisure", "park") => "park",
        ("leisure", "sports_centre") => "sports",
        ("leisure", "swimming_pool") => "pool",
        ("leisure", "playground") => "playground",
        ("amenity", "pharmacy") => "pharmacy",
        ("amenity", "clinic") => "clinic",
        ("amenity", "hospital") => "hospital",
        ("amenity", "dentist") => "dentist",
        ("amenity", "veterinary") => "vet",
        _ => null,
    };

    /// Type vocabulary by group. Note: "tapas" (food), "river" (outdoors), and
    /// "metro" (transport) are owner-selectable types — no OSM tag produces them,
    /// so they only appear when an owner manually adds a place. All others map
    /// through `TypeOf` from Overpass results.
    private static readonly Dictionary<string, string[]> TypesByGroup = new()
    {
        ["transport"] = ["tram", "bus", "rail", "metro", "bikeshare", "taxi"],
        ["groceries"] = ["supermarket", "market", "bakery", "convenience", "mall"],
        ["food"] = ["restaurant", "tapas", "cafe", "bar"],
        ["outdoors"] = ["park", "river", "sports", "pool", "playground"],
        ["health"] = ["pharmacy", "clinic", "hospital", "dentist", "vet"],
    };

    public static bool IsKnownType(string group, string type) =>
        TypesByGroup.TryGetValue(group, out var types) && types.Contains(type);

    /// The vocabulary served to the editor. THIS is the single definition of
    /// the type list — the client has none of its own, so drift is impossible
    /// by construction rather than by discipline.
    public static IReadOnlyDictionary<string, string[]> Vocabulary => TypesByGroup;

    /// Invariants that used to be guarded by client-side tests. With the list
    /// server-only and no C# test project, a startup check is what is left —
    /// this constructor is lazy-initialized on first access and throws on the
    /// first request that touches the nearby feature, turning a bad edit into an
    /// immediate, loud failure rather than silently wrong data.
    static NearbyGroups()
    {
        var seen = new HashSet<string>();
        foreach (var group in All)
        {
            if (!TypesByGroup.TryGetValue(group, out var types) || types.Length == 0)
                throw new InvalidOperationException($"NearbyGroups.cs: nearby group '{group}' has no types");
            foreach (var t in types)
                if (!seen.Add(t))
                    throw new InvalidOperationException($"NearbyGroups.cs: nearby type '{t}' is in two groups");
        }
    }

    /// Every listing is in Zaragoza. This bound is what stops the owner
    /// endpoint being a general-purpose router at our expense.
    public static bool InZaragoza(double lat, double lng) =>
        lat is >= 41.50 and <= 41.80 && lng is >= -1.10 and <= -0.65;

    /// Cache cell for the Overpass answer — 3 decimal places, about 110 m.
    public static string Cell(double lat, double lng, string group) =>
        string.Create(CultureInfo.InvariantCulture, $"{lat:F3}|{lng:F3}|{group}");
}

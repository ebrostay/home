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

    /// The group's default reach — what "nearby" means for most of its types.
    ///
    /// `food` is 600, not the 1000 it was: four selectors over a dense centre
    /// is the query the public Overpass endpoint most often drops (504, "the
    /// server is probably too busy"), and a restaurant a kilometre away is not
    /// walkable-nearby in any useful sense. Shrinking the area is the only
    /// lever that reduces the work Overpass has to do — `out body N` truncates
    /// output, after the search is already paid for.
    public static int RadiusMetres(string group) => group switch
    {
        "transport" => 800,
        "groceries" => 1000,
        "food" => 600,
        "outdoors" => 2000,
        "health" => 10000,
        _ => throw new ArgumentOutOfRangeException(nameof(group)),
    };

    /// Per-type overrides, because "nearby" is not one distance WITHIN a group
    /// either. A bus stop 800 m away is a fact about the street; the tram and
    /// the train are facts about the city, and a guest deciding where to live
    /// wants to know the tram is 1.7 km away far more than they want a
    /// twenty-fourth bus stop.
    ///
    /// Measured, not guessed: for Pedro II el Católico 3 the nearest tram is
    /// Fernando el Católico at 1705 m and the nearest station Delicias at
    /// 595 m; for Movera 7, Miraflores at 1172 m and Emperador Carlos V at
    /// 1686 m. At a flat 800 m neither listing could show either.
    private static readonly Dictionary<string, int> RadiusByType = new()
    {
        ["tram"] = 2500,
        ["rail"] = 3000,
    };

    /// The reach that applies to one entry: its type's, or its group's.
    ///
    /// This is also what decides `needsCheck` after a pin move, which is why
    /// it must be the per-type figure — measuring a deliberately-distant tram
    /// stop against the group's 800 m would flag every one of them the moment
    /// it was saved.
    public static int RadiusMetres(string group, string? type) =>
        type is not null && RadiusByType.TryGetValue(type, out var r)
            ? r
            : RadiusMetres(group);

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
            ("leisure", "fitness_centre"),
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

    /// Features OSM maps as AREAS, which a node-only query therefore cannot
    /// see at all. Measured, not assumed: within 2 km of Pedro II el Católico
    /// 3 there are 38 named parks and 92 swimming pools, and every single one
    /// is a way — the outdoors group had never returned a park in its life.
    ///
    /// The inverse matters just as much, which is why this is a list rather
    /// than a blanket `nwr`. The food group at 600 m returns the identical 91
    /// elements either way, but takes ~1.3 s as `node` and ~7.5 s as `nwr` —
    /// six times the work, on the group the public endpoint already drops
    /// most often, for nothing.
    private static readonly HashSet<(string, string)> AreaMapped =
    [
        ("leisure", "park"), ("leisure", "swimming_pool"),
        ("leisure", "sports_centre"), ("leisure", "playground"),
        ("shop", "mall"), ("amenity", "marketplace"), ("amenity", "hospital"),
    ];

    /// Each selector with the radius it is searched at and the element types
    /// worth searching. The Overpass query interleaves an `(around:)` clause
    /// after every selector anyway, so per-selector settings cost nothing
    /// structurally — it is the same query with different words in it.
    public static (string Key, string Value, int Radius, string Element)[]
        OverpassSelectors(string group) =>
        [.. OverpassTags(group).Select(t => (
            t.Key,
            t.Value,
            RadiusMetres(group, TypeOf(t.Key, t.Value)),
            AreaMapped.Contains((t.Key, t.Value)) ? "nwr" : "node"))];

    /// How many of one type survive into the answer. Without this, nearest-N
    /// is a popularity contest whatever is densest always wins: within 800 m
    /// of Pedro II el Católico 3 there are 38 bus stops, 11 bike shares, 5
    /// taxi ranks and one railway station — and the nearest 20 were 15 bus
    /// stops, 4 bike shares and a taxi rank. The station, 595 m away and well
    /// inside the radius, placed about 24th.
    ///
    /// Hard caps: nothing tops the list back up afterwards (see
    /// `OverpassClient.Select`). Sized so "show all" is still worth pressing —
    /// the editor shows three of each type until the owner asks for the rest.
    public static int QuotaFor(string type) => type switch
    {
        "bus" => 8,
        "tram" => 4,
        "rail" => 4,
        "bikeshare" => 4,
        "taxi" => 3,
        _ => 8,
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
        // The tag an actual gym carries. `sports_centre` is the multi-sport
        // complex; without this one, a gym was invisible in every group.
        ("leisure", "fitness_centre") => "gym",
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
        ["outdoors"] = ["park", "river", "sports", "gym", "pool", "playground"],
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

    /// Bumped whenever a change here would produce a DIFFERENT answer for the
    /// same coordinates: a radius, a selector, a quota. Cached cells live for
    /// 30 days (`nearbyCandidates.defaultTtl`), so without this a widened
    /// tram radius would reach an already-visited neighbourhood a month late,
    /// and only the neighbourhoods nobody had opened would get the fix.
    ///
    /// v2: per-type radii (tram 2500, rail 3000), per-type quotas, food 1000
    ///     → 600, and leisure=fitness_centre added to outdoors.
    /// v3: quotas became hard caps — the fill pass that topped a short list
    ///     back up with the densest type is gone, so the same cell yields a
    ///     different (shorter, more varied) answer than v2 did.
    /// v4: nwr + out center — parks and pools are OSM ways, so a node-only
    ///     query had never returned one.
    /// v5: nwr only where OSM maps the feature as an area (parks, pools);
    ///     node elsewhere, since asking for ways where there are none cost
    ///     the food group 6x its latency for zero extra results.
    private const int CellVersion = 5;

    /// Cache cell for the Overpass answer — 3 decimal places, about 110 m.
    public static string Cell(double lat, double lng, string group) =>
        string.Create(CultureInfo.InvariantCulture,
            $"v{CellVersion}|{lat:F3}|{lng:F3}|{group}");
}

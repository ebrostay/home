namespace Ebrostay.Api.Models;

/// How far a place is, by one means of travel. Metres and whole minutes,
/// measured — never supplied by a client (ADR-028 Decision 8).
public record NearbyReach(int Metres, int Minutes);

/// One place a listing chooses to mention. Embedded on the property because it
/// is read with the property ~100% of the time and changes only on owner save.
/// Bounded by validation at 6 per group and 24 in total.
public record NearbyEntry(
    string Id,
    string Group,
    string? Type,
    Bilingual? CustomType,
    string Name,
    double Lat,
    double Lng,
    Dictionary<string, NearbyReach> Reach,
    string? OsmId,
    string? MeasuredAt,
    bool NeedsCheck);

/// Route geometry, in its OWN container rather than embedded: it is written by
/// an anonymous lazy path while the property document is written by the owner's
/// save, so embedding would let a guest's click clobber a save.
public record NearbyRouteDoc(
    string Id,            // "{entryId}-{profile}"
    string PropertyId,    // partition key
    string Profile,
    string Polyline,      // encoded polyline5, overview=simplified
    int Metres,
    int Seconds,          // provenance only — the entry's Reach is displayed
    string FetchedAt);

/// Cached Overpass answer for one rounded cell + group. POIs do not move, so
/// this is cacheable; the ORS matrix is NOT cached, because it must run against
/// the true pin or the distances stop being honest.
public record NearbyCandidatesDoc(
    string Id,            // == Cell
    string Cell,          // partition key: "41.648|-0.889|transport"
    NearbyPoi[] Pois,
    string FetchedAt);

public record NearbyPoi(string OsmId, string Name, string Type, double Lat, double Lng);

/// One document per day. The cross-instance limiter: SWA managed functions run
/// on Consumption and scale out, so an in-process counter is per-instance and
/// therefore no limit at all.
public record OrsBudgetDoc(string Id, int Calls, int Ttl);

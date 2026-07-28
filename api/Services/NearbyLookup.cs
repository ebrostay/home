using Ebrostay.Api.Models;

namespace Ebrostay.Api.Services;

public record NearbyCandidate(
    string OsmId, string Name, string Type, double Lat, double Lng,
    Dictionary<string, NearbyReach> Reach);

/// Composes the POI search with the walking/driving figures.
///
/// One matrix request per profile covers every candidate at once, which is why
/// a category open costs two requests rather than one per candidate.
public sealed class NearbyLookup(OverpassClient overpass, OrsClient ors)
{
    public async Task<NearbyCandidate[]> CandidatesAsync(
        double lat, double lng, string group, CancellationToken ct)
    {
        var pois = await overpass.FindAsync(lat, lng, group, ct);
        if (pois.Length == 0) return [];

        var origin = new GeoPoint(lat, lng);
        var points = pois.Select(p => new GeoPoint(p.Lat, p.Lng)).ToArray();

        var byProfile = new Dictionary<string, NearbyReach?[]>();
        foreach (var profile in NearbyGroups.Profiles)
            byProfile[profile] = await ors.MatrixAsync(origin, points, profile, ct);

        // Profiles that came back null for a POI are simply absent from its Reach.
        // The client's reachFor() already returns null for a missing profile, so a
        // place reachable on foot but not by car renders correctly under the toggle
        // (the reverse — car but no foot figure — is dropped below, since we can't
        // rank or show a place we have no walking figure for at all).
        var candidates = pois.Select((p, i) => new NearbyCandidate(
            p.OsmId, p.Name, p.Type, p.Lat, p.Lng,
            NearbyGroups.Profiles
                .Where(x => byProfile[x][i] is not null)
                .ToDictionary(x => x, x => byProfile[x][i]!)))
            // No walking figure means we cannot rank it or show it as nearby.
            .Where(c => c.Reach.ContainsKey("foot"));

        // Ranked by walking time: the owner is choosing what is genuinely
        // nearby, and walking is the honest proxy for that whatever a guest
        // later toggles to.
        return [.. candidates.OrderBy(c => c.Reach["foot"].Minutes)];
    }
}

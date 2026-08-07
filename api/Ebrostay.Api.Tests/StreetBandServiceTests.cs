using Ebrostay.Api.Services;

namespace Ebrostay.Api.Tests;

public class StreetBandServiceTests
{
    private static (long, GeoPoint) N(long id, double lat, double lng) => (id, new GeoPoint(lat, lng));

    [Fact]
    public void Merges_two_ways_sharing_an_endpoint_node()
    {
        var chain = StreetBandService.MergeChains(
            [[N(1, 0, 0), N(2, 0, 1)], [N(2, 0, 1), N(3, 0, 2)]],
            new GeoPoint(0, 0.5));
        Assert.Equal([1L, 2L, 3L], chain.Select(x => x.Item1).ToList());
    }

    [Fact]
    public void Reverses_a_way_when_its_tail_matches()
    {
        var chain = StreetBandService.MergeChains(
            [[N(1, 0, 0), N(2, 0, 1)], [N(3, 0, 2), N(2, 0, 1)]],
            new GeoPoint(0, 0));
        Assert.Equal([1L, 2L, 3L], chain.Select(x => x.Item1).ToList());
    }

    [Fact]
    public void Disconnected_same_name_ways_keep_only_the_near_chain()
    {
        var chain = StreetBandService.MergeChains(
            [[N(1, 0, 0), N(2, 0, 1)], [N(8, 5, 5), N(9, 5, 6)]],
            new GeoPoint(0, 0));
        Assert.Equal([1L, 2L], chain.Select(x => x.Item1).ToList());
    }

    // Regression: a street split at a junction is two ways each drawn OUTWARD
    // from the shared node — both start with that node's id, neither's tail
    // matches it. The old head-node filter dropped way B outright because its
    // first id equalled the selected chain's head id, silently truncating the
    // merge to a single way.
    [Fact]
    public void Merges_two_ways_that_both_start_at_the_shared_junction_node()
    {
        var chain = StreetBandService.MergeChains(
            [[N(1, 0, 0), N(2, 0, 1)], [N(1, 0, 0), N(5, 0, -1)]],
            new GeoPoint(0, 0));

        var ids = chain.Select(x => x.Item1).ToList();
        Assert.Equal(new HashSet<long> { 1, 2, 5 }, ids.ToHashSet());
        Assert.True(
            ids.SequenceEqual([2L, 1L, 5L]) || ids.SequenceEqual([5L, 1L, 2L]),
            $"expected the shared node (1) between its two neighbours, got [{string.Join(",", ids)}]");
    }
}

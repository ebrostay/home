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
}

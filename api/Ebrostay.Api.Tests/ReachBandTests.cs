using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

public class ReachBandTests
{
    [Fact]
    public void Merges_min_and_max_over_all_samples()
        => Assert.Equal(new ReachBand(3, 7), ReachBands.Merge(
            new NearbyReach(400, 5), new NearbyReach(300, 3), new NearbyReach(500, 7)));

    [Fact]
    public void Door_outside_the_end_pair_still_bounds_the_band()
        => Assert.Equal(new ReachBand(5, 9), ReachBands.Merge(
            new NearbyReach(1, 5), new NearbyReach(1, 6), new NearbyReach(1, 9)));

    [Fact]
    public void Unroutable_samples_are_skipped_and_all_null_is_null()
    {
        Assert.Equal(new ReachBand(4, 4), ReachBands.Merge(null, new NearbyReach(1, 4), null));
        Assert.Null(ReachBands.Merge(null, null));
    }
}

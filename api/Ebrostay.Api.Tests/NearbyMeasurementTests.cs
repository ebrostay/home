using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

// `NearbyMeasurement.CanReuse` decides whether an owner save keeps a nearby
// entry's stored figures or re-measures it. The rule that brought this out of
// `HostFunctions.UpdateDetails` and under test (2026-08-08): an entry measured
// before the listing had a street band carries no ReachBands, and
// `PublicProjection.ToPublicReach` then publishes the DOOR's own flat minute
// figure — a door-exact scalar outside any range, which ADR-041 point 3 does
// not allow, and the reason such an entry showed a single minute where a
// guest's own saved place showed a range.
public class NearbyMeasurementTests
{
    private static NearbyEntry Entry(Dictionary<string, ReachBand>? bands) => new(
        Id: "e1", Group: "transport", Type: "tram", CustomType: null,
        Name: "Gran Vía", Lat: 41.6, Lng: -0.9,
        Reach: new Dictionary<string, NearbyReach> { ["foot"] = new(420, 6) },
        OsmId: null, MeasuredAt: "2026-07-22T12:00:00Z", NeedsCheck: false,
        ReachBands: bands);

    private static Dictionary<string, ReachBand> Bands() =>
        new() { ["foot"] = new ReachBand(5, 7) };

    [Fact]
    public void KeepsFiguresWhenNothingMovedAndTheEntryHasItsRange()
        => Assert.True(NearbyMeasurement.CanReuse(Entry(Bands()), false, false, true));

    [Fact]
    public void ReMeasuresAnEntryThatPredatesTheBand()
        => Assert.False(NearbyMeasurement.CanReuse(Entry(null), false, false, true));

    // No band on the listing means no samples to range over, so a missing
    // ReachBands is the only possible state — forcing a re-measure here would
    // spend an ORS call on every save and still produce nothing.
    [Fact]
    public void KeepsFiguresWhenTheListingHasNoBandAtAll()
        => Assert.True(NearbyMeasurement.CanReuse(Entry(null), false, false, false));

    [Fact]
    public void ReMeasuresWhenTheEntryItselfMoved()
        => Assert.False(NearbyMeasurement.CanReuse(Entry(Bands()), true, false, true));

    [Fact]
    public void ReMeasuresWhenTheHomesPinMoved()
        => Assert.False(NearbyMeasurement.CanReuse(Entry(Bands()), false, true, true));

    [Fact]
    public void MeasuresAnEntryThisSaveHasNeverSeen()
        => Assert.False(NearbyMeasurement.CanReuse(null, false, false, true));
}

using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Xunit;

namespace Ebrostay.Api.Tests;

// The rules that keep a slow, unreliable third party (Overpass) off the
// request path, and that stop a listing publishing with a band nobody read.
//
// Measured 2026-08-08 against `movera0`: three sequential Overpass queries,
// 8-9 s each, two of three probes `504`. SWA caps every /api request at 45 s
// (ADR-033 Decision 1), so an unbounded derivation on the owner's save could
// lose the whole save, not just the band. Hence the deadline, the single
// flight, and the reviewer gate below.
public class BandGatingTests
{
    // ---- single flight -------------------------------------------------
    //
    // The guard the owner asked for: the same listing must never have two
    // derivations in the air at once. A reviewer double-clicking Retry, or two
    // review tabs open on one listing, would otherwise spend three Overpass
    // calls twice for one answer.

    [Fact]
    public async Task ConcurrentCallsForOneKeyRunTheWorkOnce()
    {
        var flight = new SingleFlight<string, int>();
        var started = 0;
        var gate = new TaskCompletionSource();

        async Task<int> Work()
        {
            Interlocked.Increment(ref started);
            await gate.Task;
            return 7;
        }

        var a = flight.RunAsync("p1", Work);
        var b = flight.RunAsync("p1", Work);
        gate.SetResult();

        Assert.Equal(7, await a);
        Assert.Equal(7, await b);
        Assert.Equal(1, started);
    }

    [Fact]
    public async Task DifferentKeysRunIndependently()
    {
        var flight = new SingleFlight<string, int>();
        var started = 0;

        Task<int> Work()
        {
            Interlocked.Increment(ref started);
            return Task.FromResult(1);
        }

        await flight.RunAsync("p1", Work);
        await flight.RunAsync("p2", Work);

        Assert.Equal(2, started);
    }

    // Without this the guard would be a cache, not a flight: one derivation
    // per listing for the lifetime of the process, and the reviewer's Retry
    // would return the same failure for ever.
    [Fact]
    public async Task ASecondCallAfterTheFirstFinishesRunsAgain()
    {
        var flight = new SingleFlight<string, int>();
        var started = 0;

        Task<int> Work()
        {
            Interlocked.Increment(ref started);
            return Task.FromResult(1);
        }

        await flight.RunAsync("p1", Work);
        await flight.RunAsync("p1", Work);

        Assert.Equal(2, started);
    }

    // A throwing derivation must not wedge the key. Overpass 504s; the next
    // Retry has to be allowed to try.
    [Fact]
    public async Task AFailedRunReleasesTheKey()
    {
        var flight = new SingleFlight<string, int>();
        Func<Task<int>> boom = async () =>
        {
            await Task.Yield();
            throw new InvalidOperationException("boom");
        };

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => flight.RunAsync("p1", boom));

        Assert.Equal(5, await flight.RunAsync("p1", () => Task.FromResult(5)));
    }

    // ---- disclosure ----------------------------------------------------
    //
    // ADR-041 shows the street, never the door. A band is only a disclosure
    // unit if it is long enough that the home could be any of several on it —
    // a 15 m band over one building front IS the address.

    private static StreetBand Band(params (double Lat, double Lng)[] line) =>
        new([.. line.Select(p => new BandPoint(p.Lat, p.Lng))],
            line[0].Lat, line[0].Lng,
            new BandPoint(line[0].Lat, line[0].Lng),
            new BandPoint(line[^1].Lat, line[^1].Lng),
            "Calle de Prueba", "2026-08-08T00:00:00Z");

    [Fact]
    public void MeasuresTheBandAlongItsWholeLine()
    {
        // Three points ~111 m apart in latitude at this longitude.
        var metres = BandDisclosure.LengthMetres(
            Band((41.65, -0.9), (41.651, -0.9), (41.652, -0.9)));
        Assert.InRange(metres, 210, 235);
    }

    [Fact]
    public void AShortBandIsFlaggedAsIdentifyingTheHome() =>
        Assert.True(BandDisclosure.IdentifiesSingleHome(
            Band((41.65, -0.9), (41.65012, -0.9))));

    [Fact]
    public void ABandLongerThanTheThresholdIsNotFlagged() =>
        Assert.False(BandDisclosure.IdentifiesSingleHome(
            Band((41.65, -0.9), (41.651, -0.9))));

    // ---- the reviewer gate ---------------------------------------------

    private static PropertyDoc Listing(StreetBand? band) =>
        new() { Id = "p1", Status = "pending_review", HostId = "host-1", Band = band };

    private static StreetBand Good => Band((41.65, -0.9), (41.651, -0.9));

    [Fact]
    public void ApproveIsRefusedWhileTheBandIsMissing() =>
        Assert.Equal("band_missing",
            AdminValidation.CheckApprove(Listing(null), bandConfirmed: true));

    [Fact]
    public void ApproveIsRefusedUntilTheReviewerConfirmsTheBand() =>
        Assert.Equal("band_not_confirmed",
            AdminValidation.CheckApprove(Listing(Good), bandConfirmed: false));

    [Fact]
    public void ApproveIsAllowedWithABandTheReviewerConfirmed() =>
        Assert.Null(AdminValidation.CheckApprove(Listing(Good), bandConfirmed: true));

    // The submission check still comes first: a draft with a perfect band is
    // not a thing anyone asked us to publish.
    [Fact]
    public void ApproveStillNeedsASubmission() =>
        Assert.Equal("not_in_review", AdminValidation.CheckApprove(
            new PropertyDoc { Id = "p1", Status = "draft", Band = Good },
            bandConfirmed: true));

    // ---- what the reviewer is shown ------------------------------------

    [Fact]
    public void BandReviewSaysNothingIsDerivedYet()
    {
        var review = AdminProjection.ToBandReview(Listing(null));
        Assert.False(review.HasBand);
        Assert.False(review.CanApprove);
        Assert.Null(review.StreetName);
    }

    [Fact]
    public void BandReviewCarriesTheStreetAndItsLength()
    {
        var review = AdminProjection.ToBandReview(Listing(Good));
        Assert.True(review.HasBand);
        Assert.Equal("Calle de Prueba", review.StreetName);
        Assert.InRange(review.LengthMetres, 105, 118);
        Assert.False(review.IdentifiesSingleHome);
        Assert.True(review.CanApprove);
    }

    // The disclosure warning reaches the panel as its own flag, so the
    // reviewer sees "this band is 13 m long" as a warning rather than having
    // to read a number and know what 60 means.
    [Fact]
    public void BandReviewFlagsABandThatPointsAtOneDoor()
    {
        var review = AdminProjection.ToBandReview(
            Listing(Band((41.65, -0.9), (41.65012, -0.9))));
        Assert.True(review.HasBand);
        Assert.True(review.IdentifiesSingleHome);
        // Still approvable: the warning informs the judgement, it does not
        // make it. A short band over forty flats is fine and only a person
        // can know that.
        Assert.True(review.CanApprove);
    }

    // The routing samples are server-only (PropertyDoc), and this projection
    // is the one that goes to a browser. A regression here would hand the
    // reviewer's tab two points inset from the real door.
    [Fact]
    public void BandReviewNeverCarriesTheRoutingSamples()
    {
        var json = System.Text.Json.JsonSerializer.Serialize(
            AdminProjection.ToBandReview(Listing(Good)));
        Assert.DoesNotContain("ample", json);
    }
}

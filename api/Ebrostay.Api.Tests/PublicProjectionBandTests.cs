using Ebrostay.Api.Models;

namespace Ebrostay.Api.Tests;

public class PublicProjectionBandTests
{
    private static PropertyDoc Doc(StreetBand? band) => new()
    {
        Id = "p1", Status = "published", Name = "Pedro II el Católico — Universidad",
        Address = "Pedro II el Católico 3, Zaragoza",
        Lat = 41.65393, Lng = -0.90783, Band = band,
        Nearby = [new NearbyEntry("n1", "transport", "tram", null, "Gran Vía",
            41.6521, -0.90512,
            new() { ["foot"] = new NearbyReach(423, 6) }, null, null, false)
            with { ReachBands = new() { ["foot"] = new ReachBand(4, 6) } }],
    };

    private static StreetBand Band => new(
        [new(41.65476, -0.90779), new(41.6531, -0.90786)],
        41.65393, -0.907825,
        new(41.65467, -0.90779), new(41.65319, -0.90786),
        "Calle de Pedro II El Católico", "2026-08-07T00:00:00Z");

    [Fact]
    public void Summary_ships_the_midpoint_not_the_door()
    {
        var s = PublicProjection.ToSummary(Doc(Band), DateTimeOffset.UtcNow);
        Assert.Equal(41.65393, s.Lat, 6);      // midpoint happens to be close…
        Assert.Equal(-0.907825, s.Lng, 6);     // …but comes from Band.Mid*
    }

    [Fact]
    public void Summary_without_a_band_rounds_to_three_decimals()
    {
        var s = PublicProjection.ToSummary(Doc(null), DateTimeOffset.UtcNow);
        Assert.Equal(41.654, s.Lat, 6);
        Assert.Equal(-0.908, s.Lng, 6);
    }

    [Fact]
    public void Detail_carries_the_band_and_no_address_or_door()
    {
        var d = PublicProjection.ToDetail(Doc(Band), DateTimeOffset.UtcNow, 249);
        Assert.NotNull(d.Band);
        Assert.Equal(2, d.Band!.Length);
        Assert.Equal([41.65476, -0.90779], d.Band[0]); // [lat, lng] pairs on the wire
        // ADR-041 point 1: the street NAME is public (it names the drawn band);
        // the number never is.
        Assert.Equal("Calle de Pedro II El Católico", d.StreetName);
        // Address/Lat/Lng do not exist on the type anymore — this test is the
        // compile-time proof; nothing to assert at runtime.
    }

    [Fact]
    public void No_band_means_no_street_name_either()
    {
        var d = PublicProjection.ToDetail(Doc(null), DateTimeOffset.UtcNow, 249);
        Assert.Null(d.Band);
        Assert.Null(d.StreetName);
    }

    [Fact]
    public void Reach_projects_as_a_range_with_coarse_metres()
    {
        var d = PublicProjection.ToDetail(Doc(Band), DateTimeOffset.UtcNow, 249);
        var reach = d.Nearby[0].Reach["foot"];
        Assert.Equal(4, reach.MinMinutes);
        Assert.Equal(6, reach.MaxMinutes);
        Assert.Equal(400, reach.Metres); // 423 → nearest 50
    }

    [Fact]
    public void Legacy_entry_without_bands_degrades_to_a_flat_range()
    {
        var doc = Doc(Band);
        doc.Nearby = [doc.Nearby[0] with { ReachBands = null }];
        var d = PublicProjection.ToDetail(doc, DateTimeOffset.UtcNow, 249);
        Assert.Equal(new PublicReach(6, 6, 400), d.Nearby[0].Reach["foot"]);
    }
}

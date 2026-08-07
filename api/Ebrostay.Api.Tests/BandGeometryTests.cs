using Ebrostay.Api.Services;
using Xunit;

namespace Ebrostay.Api.Tests;

public class BandGeometryTests
{
    // A straight ~1113 m west→east line at the equator (1e-2 deg lng ≈ 1113 m).
    private static readonly GeoPoint[] Line =
        [new(0, 0), new(0, 0.005), new(0, 0.01)];

    [Fact]
    public void Length_measures_the_polyline()
        => Assert.InRange(BandGeometry.Length(Line), 1100, 1125);

    [Fact]
    public void MoveAlong_interpolates_and_clamps()
    {
        var p = BandGeometry.MoveAlong(Line, BandGeometry.Length(Line) / 2);
        Assert.Equal(0.005, p.Lng, 4);
        var end = BandGeometry.MoveAlong(Line, 1e9);
        Assert.Equal(0.01, end.Lng, 6);
    }

    [Fact]
    public void ProjectArc_finds_the_closest_point()
    {
        var arc = BandGeometry.ProjectArc(Line, new GeoPoint(0.0001, 0.0025));
        Assert.InRange(arc, 250, 310); // ≈ a quarter of the way along
    }

    [Fact]
    public void OffsetFraction_is_stable_and_never_centered()
    {
        var f = BandGeometry.OffsetFraction("pedro1");
        Assert.Equal(f, BandGeometry.OffsetFraction("pedro1"));
        Assert.True(f is (>= 0.15 and <= 0.42) or (>= 0.58 and <= 0.85));
        Assert.NotEqual(f, BandGeometry.OffsetFraction("pedro2"));
    }

    [Fact]
    public void Short_street_is_taken_whole()
    {
        var (from, to) = BandGeometry.CutSegment(190, 90, 0.3, []);
        Assert.Equal(0, from);
        Assert.Equal(190, to);
    }

    [Fact]
    public void Long_street_gets_an_offcenter_window_snapped_to_junctions()
    {
        double[] junctions = [200, 400, 600, 800];
        var (from, to) = BandGeometry.CutSegment(1000, 500, 0.3, junctions);
        // Ideal window: home at 30% of 250 m → [425, 675]; snapped outward to
        // junctions → [400, 800].
        Assert.Equal(400, from);
        Assert.Equal(800, to);
        Assert.True(from <= 500 && 500 <= to, "home must be inside the segment");
    }

    [Fact]
    public void Window_clamps_at_the_street_end()
    {
        var (from, to) = BandGeometry.CutSegment(1000, 980, 0.3, [700]);
        Assert.True(to <= 1000 && from < to && from <= 980);
    }
}

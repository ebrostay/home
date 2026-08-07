using Ebrostay.Api.Services;
using Xunit;

namespace Ebrostay.Api.Tests;

public class RouteSplitterTests
{
    [Fact]
    public void Splits_at_the_fork()
    {
        GeoPoint[] a = [new(0, 0), new(1, 1), new(2, 2), new(3, 3)];
        GeoPoint[] b = [new(0, 9), new(1, 8), new(2, 2), new(3, 3)];
        var (trunk, stubA, stubB) = RouteSplitter.Split(a, b);
        Assert.Equal([new(2, 2), new(3, 3)], trunk);
        Assert.Equal([new(0, 0), new(1, 1), new(2, 2)], stubA);
        Assert.Equal([new(0, 9), new(1, 8), new(2, 2)], stubB);
    }

    [Fact]
    public void Never_converging_routes_become_two_full_stubs()
    {
        GeoPoint[] a = [new(0, 0), new(1, 1)];
        GeoPoint[] b = [new(0, 9), new(1, 8)];
        var (trunk, stubA, stubB) = RouteSplitter.Split(a, b);
        Assert.Empty(trunk);
        Assert.Equal(a, stubA);
        Assert.Equal(b, stubB);
    }

    [Fact]
    public void Identical_routes_are_all_trunk()
    {
        GeoPoint[] a = [new(0, 0), new(1, 1)];
        var (trunk, stubA, stubB) = RouteSplitter.Split(a, a);
        Assert.Equal(a, trunk);
        Assert.Single(stubA); // just the fork point, draws nothing
        Assert.Single(stubB);
    }
}

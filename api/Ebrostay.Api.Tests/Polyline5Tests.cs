using Ebrostay.Api.Services;
using Xunit;

namespace Ebrostay.Api.Tests;

public class Polyline5Tests
{
    // Google's canonical reference vector — the same one app/lib/nearby.test.ts uses.
    private const string Reference = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

    [Fact]
    public void Decodes_the_reference_vector()
    {
        var pts = Polyline5.Decode(Reference);
        Assert.Equal(3, pts.Count);
        Assert.Equal(38.5, pts[0].Lat, 5);
        Assert.Equal(-120.2, pts[0].Lng, 5);
        Assert.Equal(40.7, pts[1].Lat, 5);
        Assert.Equal(-120.95, pts[1].Lng, 5);
        Assert.Equal(43.252, pts[2].Lat, 5);
        Assert.Equal(-126.453, pts[2].Lng, 5);
    }

    [Fact]
    public void Encode_roundtrips_decode()
    {
        var pts = Polyline5.Decode(Reference);
        Assert.Equal(Reference, Polyline5.Encode(pts));
    }

    [Fact]
    public void Empty_string_decodes_to_empty_list()
    {
        Assert.Empty(Polyline5.Decode(""));
        Assert.Equal("", Polyline5.Encode([]));
    }
}

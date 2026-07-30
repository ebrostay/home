using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

// Fix round 1 on Task 11 (2026-07-30): both cover-photo picks
// (`PublicProjection.ToSummary`, `HostProjection.ToHostProperty`) filtered
// only `!IsFloorplan`, so a photo the owner deliberately hid from the
// gallery (`HiddenFromGallery`) — sorted first — could still become the
// cover: the single most prominent image on a search card, and the owner's
// own portfolio-row thumbnail. Both now also filter `!HiddenFromGallery`.
// These pin that behaviour directly, so a future edit to either pick that
// drops the guard fails here instead of on a search results page.
public class CoverPhotoTests
{
    // A minimal, otherwise-empty listing: only the two photos this test
    // actually exercises are set, everything else is `PropertyDoc`'s own
    // default. Sort order deliberately puts the hidden photo FIRST — the
    // exact ordering that let it win before this fix.
    private static PropertyDoc ListingWithHiddenCoverCandidate() => new()
    {
        Id = "p1",
        Name = "Test listing",
        Photos =
        [
            new PropertyPhoto("hidden.jpg", IsFloorplan: false, SortOrder: 0, HiddenFromGallery: true),
            new PropertyPhoto("visible.jpg", IsFloorplan: false, SortOrder: 1, HiddenFromGallery: false),
        ],
    };

    [Fact]
    public void PublicSummaryCoverSkipsAHiddenPhotoSortedFirst()
    {
        var summary = PublicProjection.ToSummary(ListingWithHiddenCoverCandidate(), DateTimeOffset.UtcNow);

        Assert.Equal("visible.jpg", summary.CoverUrl);
    }

    [Fact]
    public void HostPropertyCoverSkipsAHiddenPhotoSortedFirst()
    {
        var host = HostProjection.ToHostProperty(
            ListingWithHiddenCoverCandidate(), DateTimeOffset.UtcNow, requestCount: 0, oldestRequestAt: null);

        Assert.Equal("visible.jpg", host.CoverUrl);
    }

    // A listing with no eligible cover at all (every photo hidden or a
    // floorplan) falls back to null on both sides, rather than throwing or
    // reaching for something it should not show.
    [Fact]
    public void PublicSummaryCoverIsNullWhenEveryPhotoIsIneligible()
    {
        var doc = new PropertyDoc
        {
            Id = "p2",
            Name = "All hidden",
            Photos =
            [
                new PropertyPhoto("floorplan.jpg", IsFloorplan: true, SortOrder: 0),
                new PropertyPhoto("hidden.jpg", IsFloorplan: false, SortOrder: 1, HiddenFromGallery: true),
            ],
        };

        var summary = PublicProjection.ToSummary(doc, DateTimeOffset.UtcNow);

        Assert.Null(summary.CoverUrl);
    }
}

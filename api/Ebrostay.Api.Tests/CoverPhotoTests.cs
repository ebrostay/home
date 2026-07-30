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

    // A fourth site of the same bug (final-review finding, 2026-07-30):
    // `HostProjection.Sections`' own "at least one photo" completeness check
    // filtered only `!IsFloorplan`, so a listing whose only non-floorplan
    // photo was hidden from the gallery read as complete, could be submitted,
    // and published with a null cover and an empty gallery — the client
    // (`completenessOf`/`blockersOf`/`attentionOf` in `app/lib/listing.ts`)
    // and the server must agree on this, since it is the same question asked
    // twice. Isolated from the other ten Sections checks by varying ONLY
    // `Photos` across three otherwise-identical documents, so this fails on
    // the bug regardless of what any other section happens to require.
    [Fact]
    public void SectionsDoneDoesNotCountAHiddenPhotoAsAPhoto()
    {
        PropertyDoc Bare(PropertyPhoto[] photos) => new() { Id = "p3", Name = "Bare", Photos = photos };

        var none = Bare([]);
        var hiddenOnly = Bare([new PropertyPhoto("hidden.jpg", IsFloorplan: false, SortOrder: 0, HiddenFromGallery: true)]);
        var visible = Bare([new PropertyPhoto("visible.jpg", IsFloorplan: false, SortOrder: 0, HiddenFromGallery: false)]);

        Assert.Equal(HostProjection.SectionsDone(none), HostProjection.SectionsDone(hiddenOnly));
        Assert.Equal(HostProjection.SectionsDone(hiddenOnly) + 1, HostProjection.SectionsDone(visible));
    }
}

using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

// Fix (2026-08-01): a listing in `pending_review` renders for its owner —
// `PropertiesFunctions.Get` grants the owner preview (ADR-029) — but every
// route under it 404'd, because `NearbyFunctions` decided visibility on the
// status alone and never looked at the principal. The guest page reports that
// 404 as "this place's route isn't available anymore", so the owner previewing
// their own listing saw a map whose every place claimed to be gone.
//
// The two surfaces had drifted apart, so the rule now lives in one pure place
// and both call it. These tests pin that rule; the Cosmos read around it is
// still untested, same as before.
public class ListingVisibilityTests
{
    private static PropertyDoc Listing(string status, string? hostId = "host-1") =>
        new() { Id = "p1", Status = status, HostId = hostId };

    private static ClientPrincipal User(string userId, bool authenticated = true) =>
        new()
        {
            UserId = userId,
            UserRoles = authenticated ? ["anonymous", "authenticated"] : ["anonymous"],
        };

    // ---- ownership ----------------------------------------------------

    [Fact]
    public void OwnerIsRecognised() =>
        Assert.True(ListingVisibility.IsOwnedBy(Listing("draft"), User("host-1")));

    [Fact]
    public void StrangerIsNotOwner() =>
        Assert.False(ListingVisibility.IsOwnedBy(Listing("draft"), User("host-2")));

    [Fact]
    public void AnonymousIsNotOwner() =>
        Assert.False(ListingVisibility.IsOwnedBy(Listing("draft"), null));

    // A principal SWA has not authenticated carries no identity we may act on,
    // even if its userId happens to match — same guard PropertiesFunctions.Get
    // has always made.
    [Fact]
    public void UnauthenticatedPrincipalIsNotOwner() =>
        Assert.False(ListingVisibility.IsOwnedBy(
            Listing("draft"), User("host-1", authenticated: false)));

    // A listing with no hostId is nobody's. Ordinal comparison, so a null
    // hostId must not match an empty-ish id either.
    [Fact]
    public void OwnerlessListingHasNoOwner() =>
        Assert.False(ListingVisibility.IsOwnedBy(Listing("draft", hostId: null), User("host-1")));

    // ---- the route surface --------------------------------------------

    [Theory]
    [InlineData("published")]
    [InlineData("paused")]
    public void PublicStatusesRouteForAnyone(string status) =>
        Assert.Equal(ListingView.Public, ListingVisibility.ForRoutes(Listing(status), null));

    // The bug: these three statuses have never been public, so they 404 for
    // everyone else — but the owner is previewing them and needs real routes.
    [Theory]
    [InlineData("draft")]
    [InlineData("pending_review")]
    [InlineData("rejected")]
    public void OwnerGetsRoutesOnAnUnpublishedListing(string status) =>
        Assert.Equal(ListingView.OwnerPreview,
            ListingVisibility.ForRoutes(Listing(status), User("host-1")));

    [Theory]
    [InlineData("draft")]
    [InlineData("pending_review")]
    [InlineData("rejected")]
    public void StrangerGetsNothingOnAnUnpublishedListing(string status) =>
        Assert.Equal(ListingView.Hidden,
            ListingVisibility.ForRoutes(Listing(status), User("host-2")));

    [Theory]
    [InlineData("draft")]
    [InlineData("pending_review")]
    [InlineData("rejected")]
    public void AnonymousGetsNothingOnAnUnpublishedListing(string status) =>
        Assert.Equal(ListingView.Hidden,
            ListingVisibility.ForRoutes(Listing(status), null));

    // A paused listing the OWNER is looking at stays `Public`, not
    // `OwnerPreview`: its routes were public a moment ago and are served from
    // the shared cache either way, so downgrading them to `no-store` for the
    // owner alone would buy nothing.
    [Fact]
    public void PausedStaysPublicEvenForItsOwner() =>
        Assert.Equal(ListingView.Public,
            ListingVisibility.ForRoutes(Listing("paused"), User("host-1")));

    // An unknown status is not a public one — the default must be closed.
    [Fact]
    public void UnknownStatusIsHidden() =>
        Assert.Equal(ListingView.Hidden,
            ListingVisibility.ForRoutes(Listing("archived"), null));
}

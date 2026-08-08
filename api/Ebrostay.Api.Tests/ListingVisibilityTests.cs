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
    [InlineData("closed")]
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

    // Same reasoning as paused: a closing owner still gets the shared-cache
    // `Public` view of their own listing's routes, not a `no-store`
    // `OwnerPreview` — there is nothing to preview, the routes are the same
    // ones every guest already sees.
    [Fact]
    public void ClosedStaysPublicEvenForItsOwner() =>
        Assert.Equal(ListingView.Public,
            ListingVisibility.ForRoutes(Listing("closed"), User("host-1")));

    // An unknown status is not a public one — the default must be closed.
    [Fact]
    public void UnknownStatusIsHidden() =>
        Assert.Equal(ListingView.Hidden,
            ListingVisibility.ForRoutes(Listing("archived"), null));
}

// `GET /api/host/properties/{id}` — the Manage page, and the last read a
// closing admin still held.
//
// The endpoint is a read, so it is guarded by `RequireActiveAsync`, which lets
// a closing account through on purpose (a closing OWNER has to reach their own
// portfolio). It then loaded through `MayWrite`, which admits an admin to
// ANYBODY's listing — so an admin who had asked to close their own account,
// refused by all nine /api/staff/* endpoints, could still open
// `/host/manage?id=<any id taken off a public URL>` and be served a stranger's
// exact address, cadastral reference, pin, pricing, reviewer note and
// booking-request log. §3.4, the decision log and the panel now on screen in
// both languages all say a closing admin loses reads too; these pin it.
//
// The asymmetry below is the deliberate one (ADR-042: your own things, yes;
// other people's, no), so it is tested in both directions rather than left to
// the prose.
public class ClosingAdminListingReadTests
{
    private static PropertyDoc Listing(string hostId = "host-1") =>
        new() { Id = "p1", Status = "published", HostId = hostId };

    private static ClientPrincipal User(string userId, bool admin = false) =>
        new()
        {
            UserId = userId,
            UserRoles = admin
                ? ["anonymous", "authenticated", "admin"]
                : ["anonymous", "authenticated"],
        };

    private const string Closing = "2026-08-08T10:00:00.0000000+00:00";

    private static ProfileDoc Profile(string id, string? requestedAt = null) =>
        new() { Id = id, DeletionRequestedAt = requestedAt };

    // ---- the admin's cross-account read -------------------------------

    [Fact]
    public void AnOpenAdminReadsAnybodysListing() =>
        Assert.True(ListingVisibility.MayRead(
            Listing(), User("admin-1", admin: true), Profile("admin-1")));

    [Fact]
    public void AClosingAdminDoesNotReadSomebodyElsesListing() =>
        Assert.False(ListingVisibility.MayRead(
            Listing(), User("admin-1", admin: true), Profile("admin-1", Closing)));

    // ---- the owner's own read, which must survive ---------------------

    [Fact]
    public void AnOwnerReadsTheirOwnListing() =>
        Assert.True(ListingVisibility.MayRead(
            Listing(), User("host-1"), Profile("host-1")));

    // The deliberate asymmetry, and the one this fix must not break: the
    // portfolio a closure is moving is exactly what its owner needs to see.
    [Fact]
    public void AClosingOwnerStillReadsTheirOwnListing() =>
        Assert.True(ListingVisibility.MayRead(
            Listing(), User("host-1"), Profile("host-1", Closing)));

    // An admin reading their OWN listing is the owner they are, so the closure
    // does not take it from them either — the ban is on other people's homes.
    [Fact]
    public void AClosingAdminStillReadsTheirOwnListing() =>
        Assert.True(ListingVisibility.MayRead(
            Listing(hostId: "admin-1"), User("admin-1", admin: true),
            Profile("admin-1", Closing)));

    // ---- everyone else, unchanged --------------------------------------

    [Fact]
    public void AStrangerReadsNothing() =>
        Assert.False(ListingVisibility.MayRead(
            Listing(), User("host-2"), Profile("host-2")));

    [Fact]
    public void AnAnonymousCallerReadsNothing() =>
        Assert.False(ListingVisibility.MayRead(Listing(), null, Profile("host-1")));
}

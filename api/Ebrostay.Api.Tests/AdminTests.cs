using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Ebrostay.Api.Tests;

// The admin surface's rules (spec §4.5, design 2026-08-08), pinned where they
// live — as pure functions, so the whole matrix runs without a Cosmos account.
//
// What this file CANNOT reach, and where that is covered instead:
//   • `ProfileService.RequireAdminAsync` refuses in four steps — 401 anon →
//     403 deactivated → 403 closing → 403 non-admin — and the middle two read
//     a profile document, so they are exercised against the emulator, not
//     here. `AdminGuardTests` below covers the first step (the only one that
//     answers before any I/O) and the rules behind the other two are pinned as
//     the pure predicates the guard consults. The ORDER is what matters, and
//     it is written as ONE call into `RequireWritableAsync` — which is itself
//     one call into `RequireActiveAsync` — precisely so there is no second
//     path to get that order wrong.
//   • The Cosmos reads and writes around these rules, same as every other
//     test in this project.
public class AdminTests
{
    private static PropertyDoc Listing(string status, string? hostId = "host-1") =>
        new() { Id = "p1", Status = status, HostId = hostId };

    private static ClientPrincipal User(string userId) =>
        new() { UserId = userId, UserRoles = ["anonymous", "authenticated"] };

    private static ClientPrincipal Admin(string userId = "admin-1") =>
        new() { UserId = userId, UserRoles = ["anonymous", "authenticated", "admin"] };

    // A principal SWA never mints, and the one this rule must not trust: the
    // role is there, "authenticated" is not.
    private static ClientPrincipal AdminNotSignedIn() =>
        new() { UserId = "admin-1", UserRoles = ["anonymous", "admin"] };

    // ---- who may write a listing --------------------------------------

    [Fact]
    public void OwnerMayWriteTheirOwn() =>
        Assert.True(ListingVisibility.MayWrite(Listing("published"), User("host-1")));

    [Fact]
    public void StrangerMayNotWrite() =>
        Assert.False(ListingVisibility.MayWrite(Listing("published"), User("host-2")));

    [Fact]
    public void AnonymousMayNotWrite() =>
        Assert.False(ListingVisibility.MayWrite(Listing("published"), null));

    [Fact]
    public void AdminMayWriteAnybodys() =>
        Assert.True(ListingVisibility.MayWrite(Listing("published"), Admin()));

    [Fact]
    public void AdminMayWriteADraftTheyDoNotOwn() =>
        Assert.True(ListingVisibility.MayWrite(Listing("draft"), Admin()));

    // The role alone proves nothing: `userRoles` must carry "authenticated"
    // too, or a forged header with one string in it would be an admin.
    [Fact]
    public void AdminRoleWithoutASessionMayNotWrite() =>
        Assert.False(ListingVisibility.MayWrite(Listing("published"), AdminNotSignedIn()));

    // ---- what a content save does to `status` -------------------------

    // `closed` is here for the same reason `published` is: it is public. An
    // owner is normally write-blocked while their account closes, but the
    // fan-out writes listings first and the flag last, so any failure in the
    // middle leaves a writable owner holding a `closed`, public listing — and
    // an edit there must go back to the queue like any other.
    [Theory]
    [InlineData("published")]
    [InlineData("paused")]
    [InlineData("closed")]
    public void OwnerEditOfALiveListingReEntersReview(string status) =>
        Assert.True(ListingVisibility.ReEntersReview(Listing(status), User("host-1")));

    [Theory]
    [InlineData("draft")]
    [InlineData("pending_review")]
    [InlineData("rejected")]
    public void OwnerEditOfAnUnpublishedListingDoesNot(string status) =>
        Assert.False(ListingVisibility.ReEntersReview(Listing(status), User("host-1")));

    // The §4.5 exception, and the whole reason admin editing is safe to offer:
    // fixing a typo must not drop a live home out of search.
    [Theory]
    [InlineData("published")]
    [InlineData("paused")]
    [InlineData("pending_review")]
    [InlineData("closed")]
    public void AdminEditOfSomebodyElsesListingNeverReEntersReview(string status) =>
        Assert.False(ListingVisibility.ReEntersReview(Listing(status), Admin()));

    // ...but the privilege belongs to moderating someone else's home, not to
    // the person. An admin editing their OWN published listing is an owner
    // editing a listing, and it goes back in the queue like anyone's.
    [Fact]
    public void AdminEditingTheirOwnListingIsStillAnOwner() =>
        Assert.True(ListingVisibility.ReEntersReview(
            Listing("published", "admin-1"), Admin()));

    // ---- approve ------------------------------------------------------

    // The band preconditions this rule also carries live in BandGatingTests —
    // here it is held at arm's length with a band present and confirmed, so
    // these cases stay about the SUBMISSION and nothing else.
    private static PropertyDoc Reviewable(string status)
    {
        var doc = Listing(status);
        doc.Band = new StreetBand(
            [new BandPoint(41.65, -0.9), new BandPoint(41.651, -0.9)],
            41.6505, -0.9,
            new BandPoint(41.65, -0.9), new BandPoint(41.651, -0.9),
            "Calle de Prueba", "2026-08-08T00:00:00Z");
        return doc;
    }

    [Fact]
    public void ApproveNeedsASubmission() =>
        Assert.Null(AdminValidation.CheckApprove(
            Reviewable("pending_review"), bandConfirmed: true));

    [Theory]
    [InlineData("draft")]
    [InlineData("published")]
    [InlineData("paused")]
    [InlineData("rejected")]
    [InlineData("closed")]
    public void ApproveRefusesAnythingElse(string status) =>
        Assert.Equal("not_in_review", AdminValidation.CheckApprove(
            Reviewable(status), bandConfirmed: true));

    // ---- reject -------------------------------------------------------

    [Fact]
    public void RejectNeedsANote() =>
        Assert.Equal("note_required",
            AdminValidation.CheckReject(null, Listing("pending_review")));

    [Fact]
    public void RejectRefusesABlankNote() =>
        Assert.Equal("note_required",
            AdminValidation.CheckReject("   \n ", Listing("pending_review")));

    [Fact]
    public void RejectAcceptsANote() =>
        Assert.Null(AdminValidation.CheckReject(
            "The photos are of a different flat.", Listing("pending_review")));

    [Fact]
    public void RejectRefusesAnEssay() =>
        Assert.Equal("note_too_long", AdminValidation.CheckReject(
            new string('x', AdminValidation.MaxNoteLength + 1), Listing("pending_review")));

    // Taking a live listing down is the same act from a different status, and
    // it leaves the owner the same note.
    //
    // `closed` is in the list because it is PUBLIC (design 2026-08-08). A
    // takedown — fraud, a legal request — does not become impossible because
    // the owner has asked to leave, and until this was allowed a `closed`
    // listing was reachable by no moderation endpoint at all.
    [Theory]
    [InlineData("published")]
    [InlineData("paused")]
    [InlineData("closed")]
    public void ATakedownIsARejection(string status) =>
        Assert.Null(AdminValidation.CheckReject("Not a home.", Listing(status)));

    [Theory]
    [InlineData("draft")]
    [InlineData("rejected")]
    public void RejectRefusesWhatIsNotUnderReview(string status) =>
        Assert.Equal("not_reviewable",
            AdminValidation.CheckReject("Anything.", Listing(status)));

    // ---- status -------------------------------------------------------

    [Fact]
    public void PausingALiveListingIsAllowed() =>
        Assert.Null(AdminValidation.CheckStatus("paused", Listing("published")));

    [Fact]
    public void ReopeningAPausedListingIsAllowed() =>
        Assert.Null(AdminValidation.CheckStatus("published", Listing("paused")));

    // The one exit from `closed` that does not belong to the departing owner.
    //
    // Without it the state was a trap: `closed` is public, the owner is
    // write-blocked while their account closes, and their own
    // `DELETE /api/account/closure` stops answering the moment an admin
    // deactivates them — which is the only action the users tab offers. A live
    // listing with an absent owner and no endpoint able to move it needed a
    // hand edit in Cosmos to fix.
    [Fact]
    public void PausingAClosedListingIsAllowed() =>
        Assert.Null(AdminValidation.CheckStatus("paused", Listing("closed")));

    // The back door ADR-030 closed on the owner side stays closed on this one:
    // nothing gets published without a reviewer having read it.
    //
    // `closed` is in this list on purpose, and it is the asymmetry that makes
    // the rule above safe: a `closed` listing may be paused, never republished
    // in one move. Putting a departing owner's home back into search is a
    // second, deliberate act from `paused`.
    [Theory]
    [InlineData("draft")]
    [InlineData("pending_review")]
    [InlineData("rejected")]
    [InlineData("closed")]
    public void PublishingSomethingUnreviewedIsRefused(string status) =>
        Assert.Equal("not_reviewed", AdminValidation.CheckStatus("published", Listing(status)));

    // `closed` is deliberately NOT in this list — see PausingAClosedListing.
    [Theory]
    [InlineData("draft")]
    [InlineData("pending_review")]
    [InlineData("rejected")]
    [InlineData("paused")]
    public void PausingWhatIsNotLiveIsRefused(string status) =>
        Assert.Equal("not_published", AdminValidation.CheckStatus("paused", Listing(status)));

    // Including `closed`, which only the closure fan-out writes: an admin may
    // take a closing owner's listing DOWN, never put one into that state by
    // hand.
    [Theory]
    [InlineData("rejected")]
    [InlineData("draft")]
    [InlineData("pending_review")]
    [InlineData("deleted")]
    [InlineData("closed")]
    [InlineData(null)]
    public void OnlyTwoStatusesAreSettable(string? status) =>
        Assert.Equal("status_invalid", AdminValidation.CheckStatus(status, Listing("published")));

    // ---- projections --------------------------------------------------

    private static PropertyPhoto Photo(
        string url, bool floorplan = false, bool hidden = false,
        double? lat = null, double? lng = null, int sort = 0) =>
        new(url, floorplan, sort, hidden, null, null, lat, lng, null);

    [Fact]
    public void TheQueueCountsOnlyLocatedPhotos()
    {
        var doc = Listing("pending_review");
        doc.Photos = [Photo("a.jpg", lat: 41.65, lng: -0.89), Photo("b.jpg"),
            Photo("c.jpg", lat: 41.66, lng: -0.88)];

        Assert.Equal(2, AdminProjection.ToQueueItem(doc, null).LocatedPhotos);
    }

    // Absent coordinates are the common case, not a signal — and a queue that
    // counted a photo with half a fix would be counting a number it cannot
    // place on a map.
    [Fact]
    public void HalfACoordinateIsNotALocatedPhoto()
    {
        var doc = Listing("pending_review");
        doc.Photos = [Photo("a.jpg", lat: 41.65)];

        Assert.Equal(0, AdminProjection.ToQueueItem(doc, null).LocatedPhotos);
    }

    [Fact]
    public void TheQueueSaysWhetherThereIsACatastroCheckToRun()
    {
        var without = Listing("pending_review");
        var with = Listing("pending_review");
        with.CadastralRef = "9872023VH5797S0001WX";

        Assert.False(AdminProjection.ToQueueItem(without, null).HasCadastralRef);
        Assert.True(AdminProjection.ToQueueItem(with, null).HasCadastralRef);
    }

    // Same cover rule as every other surface: a floor plan is not a cover, and
    // neither is a photo the owner kept out of the gallery.
    [Fact]
    public void TheCoverSkipsFloorplansAndHiddenPhotos()
    {
        var doc = Listing("published");
        doc.Photos = [Photo("plan.jpg", floorplan: true, sort: 0),
            Photo("hidden.jpg", hidden: true, sort: 1), Photo("real.jpg", sort: 2)];

        Assert.Equal("real.jpg", AdminProjection.ToRow(doc, null).CoverUrl);
    }

    // The one projection allowed to carry them (ADR-019 amendment): if this
    // ever returns null coordinates for a located photo, the review signal has
    // silently gone blank rather than loudly broken.
    [Fact]
    public void TheAdminPhotoCarriesTheCaptureCoordinates()
    {
        var doc = Listing("pending_review");
        doc.Photos = [Photo("a.jpg", lat: 41.6488, lng: -0.8891)];

        var photo = Assert.Single(AdminProjection.ToPhotos(doc));
        Assert.Equal(41.6488, photo.CapturedLat);
        Assert.Equal(-0.8891, photo.CapturedLng);
    }

    [Fact]
    public void AdminPhotosComeBackInGalleryOrder()
    {
        var doc = Listing("pending_review");
        doc.Photos = [Photo("third.jpg", sort: 3), Photo("first.jpg", sort: 1),
            Photo("second.jpg", sort: 2)];

        Assert.Equal(
            ["first.jpg", "second.jpg", "third.jpg"],
            AdminProjection.ToPhotos(doc).Select(p => p.Url));
    }
}

// The gate itself, in the one place it can be run here: the step that answers
// BEFORE any profile is read. `ProfileService` is built with NO database on
// purpose — a null `Database` throws the moment a guard touches Cosmos, so
// these tests fail loudly if the anonymous refusal ever moves behind the read.
//
// Everything after that step needs a profile document and so needs a Cosmos
// account; the rules it applies are pinned as pure predicates instead
// (`AccountClosure.BlocksWrites` here and in AccountClosureTests).
public class AdminGuardTests
{
    private static readonly ProfileService Guard = new(null!);

    // A principal SWA never mints, and the one the gate must not trust: the
    // admin role is there, "authenticated" is not.
    private static ClientPrincipal AdminNotSignedIn() =>
        new() { UserId = "admin-1", UserRoles = ["anonymous", "admin"] };

    [Fact]
    public async Task NoPrincipalIs401BeforeAnyRead()
    {
        var (profile, error) = await Guard.RequireAdminAsync(null);

        Assert.IsType<UnauthorizedResult>(error);
        Assert.Null(profile);
    }

    [Fact]
    public async Task AnAdminRoleWithoutASessionIs401BeforeAnyRead()
    {
        var (profile, error) = await Guard.RequireAdminAsync(AdminNotSignedIn());

        Assert.IsType<UnauthorizedResult>(error);
        Assert.Null(profile);
    }

    // The other two guards answer the same way at the same point — asserted
    // here because RequireAdminAsync now reaches the anonymous refusal THROUGH
    // RequireWritableAsync, so all three share one path and one order.
    [Fact]
    public async Task TheWriteAndActiveGuardsRefuseAnonymousTheSameWay()
    {
        Assert.IsType<UnauthorizedResult>((await Guard.RequireWritableAsync(null)).error);
        Assert.IsType<UnauthorizedResult>((await Guard.RequireActiveAsync(null)).error);
    }
}

// "Closed is closed" (product decision, 2026-08-08): a staff member who has
// asked to close their own account keeps no admin power at all.
//
// `RequireAdminAsync` layers on `RequireWritableAsync`, and this predicate is
// the whole of what that layer adds — so a profile with a closure request on
// it is refused `deletion_requested` by all nine /api/staff/* endpoints,
// including the four reads (review queue, users, properties, one property),
// before the role is ever looked at.
//
// The asymmetry with the owner case is deliberate: a closing OWNER keeps their
// reads, because their portfolio and the page that cancels the closure are
// theirs. The admin console is other people's homes and other people's
// accounts.
public class ClosingAdminTests
{
    private static ProfileDoc Staff(string? requestedAt = null) =>
        new() { Id = "admin-1", DeletionRequestedAt = requestedAt };

    [Fact]
    public void AnAdminWhoIsNotClosingKeepsTheAdminSurface() =>
        Assert.False(AccountClosure.BlocksWrites(Staff()));

    [Fact]
    public void AClosingAdminLosesIt() =>
        Assert.True(AccountClosure.BlocksWrites(Staff("2026-08-08T10:00:00.0000000+00:00")));

    // The way back, and the reason the decision above is safe to take.
    // `AccountFunctions` guards BOTH /api/account/closure verbs with
    // `RequireActiveAsync`, which does not consult this predicate — so a
    // closing admin can still cancel, and cancelling writes exactly the field
    // asserted here. Guard that endpoint with the writable or the admin check
    // instead and the closure becomes irreversible: the admin locks themselves
    // out of the only surface that could undo it. That is the surprise the
    // decision exists to prevent, so it is pinned rather than assumed.
    [Fact]
    public void CancellingGivesTheAdminSurfaceBack()
    {
        var staff = Staff("2026-08-08T10:00:00.0000000+00:00");
        Assert.True(AccountClosure.BlocksWrites(staff));

        // What `DELETE /api/account/closure` writes to the profile.
        staff.DeletionRequestedAt = null;

        Assert.False(AccountClosure.BlocksWrites(staff));
    }
}

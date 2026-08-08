using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

// The closure flag is a timestamp, not a boolean: it is the audit record the
// admin users tab reads as well as the gate every write endpoint checks.
public class ProfileClosureTests
{
    [Fact]
    public void A_fresh_profile_has_no_closure_request()
    {
        var doc = new ProfileDoc { Id = "u1" };
        Assert.Null(doc.DeletionRequestedAt);
    }

    [Fact]
    public void A_closure_request_is_an_iso_timestamp()
    {
        var doc = new ProfileDoc { Id = "u1", DeletionRequestedAt = "2026-08-08T10:00:00.0000000+00:00" };
        Assert.True(DateTimeOffset.TryParse(doc.DeletionRequestedAt, out _));
    }

    // The guard's whole decision, as a pure function. RequireWritableAsync
    // needs a Cosmos account to exercise; this does not, so the rule that
    // actually stops the writes is tested rather than the plumbing around it.
    [Fact]
    public void An_open_account_may_write()
        => Assert.False(AccountClosure.BlocksWrites(new ProfileDoc { Id = "u1" }));

    [Fact]
    public void A_closing_account_may_not_write()
        => Assert.True(AccountClosure.BlocksWrites(
            new ProfileDoc { Id = "u1", DeletionRequestedAt = "2026-08-08T10:00:00.0000000+00:00" }));
}

// The §4 transition table of the 2026-08-08 design, one test per state.
// Null means "leave this listing alone" — and that is the load-bearing half:
// restoring only what actually moved is what stops a `draft` reaching
// `paused`, from where an owner could reopen to `published` a listing no
// reviewer ever saw (02-data-model.md:300).
public class AccountClosureMapTests
{
    [Fact]
    public void Request_closes_a_published_listing()
        => Assert.Equal("closed", AccountClosure.OnRequest("published"));

    [Fact]
    public void Request_withdraws_a_listing_awaiting_review()
        => Assert.Equal("draft", AccountClosure.OnRequest("pending_review"));

    [Theory]
    [InlineData("paused")]
    [InlineData("draft")]
    [InlineData("rejected")]
    public void Request_leaves_every_non_public_state_alone(string status)
        => Assert.Null(AccountClosure.OnRequest(status));

    [Fact]
    public void Cancel_parks_a_closed_listing_in_paused()
        => Assert.Equal("paused", AccountClosure.OnCancel("closed"));

    [Theory]
    [InlineData("published")]
    [InlineData("pending_review")]
    [InlineData("paused")]
    [InlineData("draft")]
    [InlineData("rejected")]
    public void Cancel_touches_nothing_that_did_not_move(string status)
        => Assert.Null(AccountClosure.OnCancel(status));

    // Re-running a half-finished fan-out must be safe: the writes are not
    // atomic across documents, so this is the property the endpoint relies on.
    [Fact]
    public void Request_is_idempotent()
    {
        var once = AccountClosure.OnRequest("published");
        Assert.Equal("closed", once);
        Assert.Null(AccountClosure.OnRequest(once!));
    }

    [Fact]
    public void Cancel_is_idempotent()
    {
        var once = AccountClosure.OnCancel("closed");
        Assert.Equal("paused", once);
        Assert.Null(AccountClosure.OnCancel(once!));
    }
}

// The fan-out is a loop over the owner's listings applying the Task 2 map.
// These tests pin the loop's decisions without a Cosmos account: given a set
// of listings, which ones get written and to what.
public class AccountClosureApplyTests
{
    private static PropertyDoc Listing(string id, string status) =>
        new() { Id = id, HostId = "u1", Status = status };

    [Fact]
    public void Request_writes_only_the_listings_that_change()
    {
        PropertyDoc[] listings =
        [
            Listing("a", "published"),
            Listing("b", "pending_review"),
            Listing("c", "paused"),
            Listing("d", "draft"),
        ];

        var writes = AccountClosure.ApplyRequest(listings).ToArray();

        Assert.Equal(2, writes.Length);
        Assert.Equal(("a", "closed"), (writes[0].Id, writes[0].Status));
        Assert.Equal(("b", "draft"), (writes[1].Id, writes[1].Status));
    }

    [Fact]
    public void Cancel_writes_only_the_closed_listings()
    {
        PropertyDoc[] listings =
        [
            Listing("a", "closed"),
            Listing("b", "draft"),
            Listing("c", "paused"),
        ];

        var writes = AccountClosure.ApplyCancel(listings).ToArray();

        Assert.Single(writes);
        Assert.Equal(("a", "paused"), (writes[0].Id, writes[0].Status));
    }

    [Fact]
    public void Re_running_a_finished_request_writes_nothing()
    {
        PropertyDoc[] listings = [Listing("a", "closed"), Listing("b", "draft")];
        Assert.Empty(AccountClosure.ApplyRequest(listings));
    }
}

// The endpoint's answer. The fan-out SKIPS a document it cannot deserialize
// rather than failing the whole request over one of them, so "200 OK" on its
// own does not mean every listing moved: a legacy ADR-032 document stays
// `published` and in search while its owner, now write-blocked, cannot pause
// it. The count is how a caller tells the two apart.
public class AccountClosureStateTests
{
    [Fact]
    public void A_clean_closure_reports_nothing_left_behind()
        => Assert.Equal(0, new AccountClosureState("2026-08-08T10:00:00Z").UnreadableListings);

    [Fact]
    public void A_partial_closure_says_how_many_listings_it_could_not_read()
    {
        var state = new AccountClosureState("2026-08-08T10:00:00Z", 2);

        Assert.Equal("2026-08-08T10:00:00Z", state.DeletionRequestedAt);
        Assert.Equal(2, state.UnreadableListings);
    }

    // Cancelling clears the flag; the count still travels, because a cancel
    // can leave a `closed` listing behind for exactly the same reason.
    [Fact]
    public void Cancelling_reports_the_same_way()
        => Assert.Equal(1, new AccountClosureState(null, 1).UnreadableListings);
}

// One predicate, two call sites. A `closed` listing is still public — its
// owner is leaving, but a guest mid-stay should not watch the page vanish.
public class PublicStatusTests
{
    [Theory]
    [InlineData("published")]
    [InlineData("closed")]
    public void The_public_sees_these(string status)
        => Assert.True(PublicStatus.IsPublic(status));

    [Theory]
    [InlineData("draft")]
    [InlineData("pending_review")]
    [InlineData("rejected")]
    [InlineData("paused")]
    public void And_never_these(string status)
        => Assert.False(PublicStatus.IsPublic(status));
}

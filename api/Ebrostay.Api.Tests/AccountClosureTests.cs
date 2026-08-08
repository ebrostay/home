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

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

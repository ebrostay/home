namespace Ebrostay.Api.Models;

/// Owner-initiated account closure (design 2026-08-08). Pure and Cosmos-free
/// like `AdminValidation`, so every rule here is testable without a database.
public static class AccountClosure
{
    /// The whole of what `RequireWritableAsync` decides. A closing account may
    /// still READ — its owner needs to see the portfolio that is closing, and
    /// to reach the page that cancels the request — but may not create or edit.
    public static bool BlocksWrites(ProfileDoc profile) =>
        profile.DeletionRequestedAt is not null;
}

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

    // What an owner's closure request does to each of their listings, and what
    // cancelling undoes.
    //
    // Both directions return `null` for "leave this listing untouched", which
    // is also what makes them idempotent: re-applying the map to an
    // already-moved listing is a no-op, so a fan-out that failed halfway is
    // safe to repeat.

    /// `published` is the only state the public can see, so it is the only one
    /// that has to change. `pending_review` is withdrawn to `draft` so no
    /// reviewer can approve a home for a departing owner. `paused`, `draft`
    /// and `rejected` are already invisible — moving `paused` to `closed`
    /// would make it MORE visible, not less.
    public static string? OnRequest(string status) => status switch
    {
        "published" => "closed",
        "pending_review" => "draft",
        _ => null,
    };

    /// Only what moved, moves back — and it lands in `paused`, not
    /// `published`: nothing returns to search without the owner reopening it
    /// deliberately.
    ///
    /// A withdrawn `pending_review` listing is NOT resubmitted here. It stays
    /// a draft and the owner resubmits, because submitting runs the
    /// completeness checks (`HostValidation.CheckStatus`) that this endpoint
    /// has no business bypassing.
    public static string? OnCancel(string status) => status switch
    {
        "closed" => "paused",
        _ => null,
    };

    /// The listings a closure request must write, and their new status. Kept
    /// separate from the endpoint so the fan-out's decisions are testable
    /// without a Cosmos account — the endpoint only loops and saves.
    public static IEnumerable<PropertyDoc> ApplyRequest(IEnumerable<PropertyDoc> listings) =>
        Plan(listings, OnRequest);

    public static IEnumerable<PropertyDoc> ApplyCancel(IEnumerable<PropertyDoc> listings) =>
        Plan(listings, OnCancel);

    private static IEnumerable<PropertyDoc> Plan(
        IEnumerable<PropertyDoc> listings, Func<string, string?> map)
    {
        foreach (var doc in listings)
        {
            var next = map(doc.Status);
            if (next is null) continue;
            doc.Status = next;
            yield return doc;
        }
    }
}

/// The request body is empty — the account being closed is always the caller's
/// own, read from `x-ms-client-principal` (§3.4). The type exists so the
/// endpoint's response has a shape.
public record AccountClosureState(string? DeletionRequestedAt);

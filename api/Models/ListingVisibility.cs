namespace Ebrostay.Api.Models;

/// What a caller may be shown of one listing.
public enum ListingView
{
    /// 404 — and deliberately not 401 or 403. A stranger walking ids must not
    /// be able to tell an unpublished listing from one that never existed.
    Hidden,

    /// Anyone may have it, and a shared cache may keep it.
    Public,

    /// The owner previewing their own listing (ADR-029). The body is
    /// owner-only on a URL that is otherwise public, so nothing between the
    /// function and the browser may store it: every caller answering this must
    /// say `no-store`.
    OwnerPreview,
}

/// Who may see a listing that is not published — ONE definition, because the
/// two public surfaces had drifted apart and the drift was a bug: the detail
/// endpoint granted the owner their preview while the route endpoints under
/// the same page 404'd every place on it (2026-08-01).
///
/// Note the surfaces still differ in WHICH statuses are public, and that is
/// intentional, not more drift: `PropertiesFunctions.Get` (via
/// `PublicStatus.IsPublic`) serves `published` and `closed`, while the route
/// surface also serves a `paused` listing — see `ForRoutes`. What they share
/// is the owner rule below.
public static class ListingVisibility
{
    /// The principal owns this listing. `UserRoles` is the only authorization
    /// input (spec §3.4), so an unauthenticated principal owns nothing however
    /// its userId compares.
    public static bool IsOwnedBy(PropertyDoc doc, ClientPrincipal? principal) =>
        principal is { IsAuthenticated: true }
        && doc.HostId is not null
        && string.Equals(doc.HostId, principal.UserId, StringComparison.Ordinal);

    /// Who may WRITE this listing (spec §4.5, design 2026-08-08): its owner,
    /// or an admin on anybody's.
    ///
    /// Admin editing exists so that the one editor is the only editor — a
    /// second admin-only form would be a second validation of the same fields,
    /// and two validations of one field is how they come to disagree. The
    /// role, as everywhere, comes from the principal and never from the data
    /// (§3.4).
    public static bool MayWrite(PropertyDoc doc, ClientPrincipal? principal) =>
        IsOwnedBy(doc, principal) || principal is { IsAuthenticated: true, IsAdmin: true };

    /// Who may READ one listing in full through the owner surface —
    /// `GET /api/host/properties/{id}`, the Manage page, which serves the exact
    /// address, the cadastral reference, the pin, the pricing, the reviewer's
    /// note and the booking-request log.
    ///
    /// `MayWrite` alone was the bug. That endpoint is a read, so it sits on
    /// `RequireActiveAsync` rather than `RequireWritableAsync` — and a closing
    /// ADMIN, refused by all nine /api/staff/* endpoints and by every write
    /// here, could still open `/host/manage?id=<any id off a public URL>` and
    /// be handed a stranger's listing in full. "Closed is closed" (ADR-042,
    /// product owner 2026-08-08); §3.4, the decision log and the panel the
    /// browser now shows in both languages all state that a closing admin
    /// loses reads as well. This predicate is what makes that true.
    ///
    /// The owner's half is deliberately untouched, and the asymmetry is the
    /// same one `RequireWritableAsync` draws: a closing owner keeps their own
    /// portfolio and their own listings, because those are theirs to see on the
    /// way out. ADR-042's rule, in one line — your own things, yes; other
    /// people's, no.
    ///
    /// The caller answers a refusal with 404, not 403: a listing this caller
    /// must not learn exists is one that does not exist for them (§3.4), which
    /// is the same answer `LoadWritableAsync` already gives a stranger.
    public static bool MayRead(PropertyDoc doc, ClientPrincipal? principal, ProfileDoc profile) =>
        IsOwnedBy(doc, principal)
        || (MayWrite(doc, principal) && !AccountClosure.BlocksWrites(profile));

    /// Whether saving CONTENT sends this listing back to the review queue.
    ///
    /// The owner's rule is §2.2.1: a published or paused listing re-enters
    /// review, because what it claims about the home has changed and nobody
    /// has read the new claim. An ADMIN's edit is the exception §4.5 grants —
    /// "direct edit (no re-review)" — and the exception is load-bearing twice
    /// over: an admin fixing a typo on a live listing must not drop it out of
    /// search, and a reviewer correcting a listing they are about to approve
    /// must not send it to the back of their own queue.
    ///
    /// An admin editing their OWN listing is treated as the owner they are.
    /// The privilege belongs to the act of moderating someone else's home, not
    /// to the person; using it on your own listing would be a way to publish
    /// changes to your own home that nobody reviewed.
    ///
    /// `closed` is in the set for the same reason `published` is: it is a
    /// PUBLIC state (design 2026-08-08). An owner normally cannot reach this
    /// at all — `RequireWritableAsync` refuses a closing account — but the
    /// closure fan-out writes listings first and the profile flag last, so
    /// (listings `closed`, flag unset) is what ANY failure in the middle
    /// leaves behind, and in that state the owner is fully writable and holds
    /// a live listing. Leaving `closed` out would let them edit it without
    /// re-entering review: the ADR-025/ADR-030 back door, reopened.
    public static bool ReEntersReview(PropertyDoc doc, ClientPrincipal? principal) =>
        (doc.Status is "published" or "paused" or "closed") && IsOwnedBy(doc, principal);

    /// The route surface (`PropertyNearbyRoute`, `PropertyPlaceRoute`).
    ///
    /// A `paused` listing routes for everyone: a guest who already has the
    /// link — or a map tile fetched moments before the owner paused it —
    /// should not watch its routes break. A `closed` listing routes for
    /// everyone for the same reason `PublicStatus.IsPublic` keeps it public
    /// (2026-08-08 closure design): the page itself still renders for a
    /// guest mid-stay, and its routes must not 404 out from under it. This
    /// set is deliberately BROADER than `PublicStatus.IsPublic` — `paused`
    /// belongs here but not there — so the two are not, and must not become,
    /// the same call. Anything else has never been public and stays
    /// invisible, except to the owner previewing it.
    public static ListingView ForRoutes(PropertyDoc doc, ClientPrincipal? principal) =>
        doc.Status is "published" or "paused" or "closed" ? ListingView.Public
        : IsOwnedBy(doc, principal) ? ListingView.OwnerPreview
        : ListingView.Hidden;
}

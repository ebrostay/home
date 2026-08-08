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

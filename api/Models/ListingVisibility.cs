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
/// intentional, not more drift: `PropertiesFunctions.Get` serves `published`
/// only, while the route surface serves a `paused` listing too — see
/// `ForRoutes`. What they share is the owner rule below.
public static class ListingVisibility
{
    /// The principal owns this listing. `UserRoles` is the only authorization
    /// input (spec §3.4), so an unauthenticated principal owns nothing however
    /// its userId compares.
    public static bool IsOwnedBy(PropertyDoc doc, ClientPrincipal? principal) =>
        principal is { IsAuthenticated: true }
        && doc.HostId is not null
        && string.Equals(doc.HostId, principal.UserId, StringComparison.Ordinal);

    /// The route surface (`PropertyNearbyRoute`, `PropertyPlaceRoute`).
    ///
    /// A `paused` listing routes for everyone: a guest who already has the
    /// link — or a map tile fetched moments before the owner paused it —
    /// should not watch its routes break. Anything else has never been public
    /// and stays invisible, except to the owner previewing it.
    public static ListingView ForRoutes(PropertyDoc doc, ClientPrincipal? principal) =>
        doc.Status is "published" or "paused" ? ListingView.Public
        : IsOwnedBy(doc, principal) ? ListingView.OwnerPreview
        : ListingView.Hidden;
}

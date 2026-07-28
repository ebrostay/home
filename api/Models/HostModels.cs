namespace Ebrostay.Api.Models;

// Owner projection — what a host sees of their OWN listings (spec-v2 §4.4).
// Wider than the public one: it keeps `status`, `reviewNote` and the
// availability notes, because those are the three things the portfolio page
// exists to show. It is still a projection, not the raw document: `hostId`
// never travels back to a client that already proved who it is.

/// RAW, unlike the public shape: the owner gets the block as stored plus the
/// per-stay override, and the client derives the turnaround window from the
/// listing's TurnoverDays. Folding the buffer in here would leave the owner
/// unable to tell a booking from the days after it — and unable to edit the
/// block without editing the buffer with it.
public record HostAvailabilityRange(
    string Start, string End, string? Status, string? Note, int? TurnoverDaysOverride);

public record HostProperty(
    string Id,
    string Status, // draft | pending_review | published | rejected | paused
    string? ReviewNote,
    string? Reference,
    string Name,
    string? Address,
    Bilingual? Area,
    int Bedrooms,
    int Bathrooms,
    int SizeM2,
    int PriceNumber,
    string? CoverUrl,
    int PhotoCount,
    // How much of the listing is filled in — the draft progress bar. Computed
    // here so the bar and the submit-for-review validation can never drift.
    int SectionsDone,
    int SectionsTotal,
    int RequestCount,
    string? OldestRequestAt,
    string? AvailableFrom,
    string? UpdatedAt,
    HostAvailabilityRange[] Availability);

// ---------------------------------------------------------------------------
// The single-listing surface ("Manage property", spec-v2 §4.4). The portfolio
// row answers "what is this home doing"; this answers "is it priced right, is
// it full, and what is owed" — so it carries the pricing block and the
// booking-interest log that the list projection has no use for.
// ---------------------------------------------------------------------------

/// The six fields the owner may edit from Manage. Separated from the rest of
/// the document because ADR-025 hangs off exactly this boundary: these apply
/// immediately and keep a listing published, everything else re-enters review.
public record HostPricing(
    int PriceNumber,
    int? DepositAmount,
    string BillsPolicy, // included | capped | excluded
    int? UtilitiesCapEur,
    int MinStayMonths,
    int MaxStayMonths,
    int TurnoverDays,
    string CleaningBy, // host | platform
    int? CleaningFeeEur,
    /// What Ebrostay charges when it does the turnaround. Read-only here —
    /// the owner needs to see the alternative to their own number, not set it.
    int PlatformCleaningFeeEur);

/// One photo as the editor sees it. `SortOrder` travels so the owner's list
/// and the guest's gallery are demonstrably the same order; the editor sends
/// position back implicitly, as the order of the array.
/// `CardUrl`/`DetailUrl` are the derived sizes (§2.2.2) — the editor's grid
/// draws the card one, since there is no reason for an owner managing twelve
/// photos to download twelve full-size masters. Null on photos that predate
/// the upload pipeline; every consumer falls back to `Url`.
///
/// `Captured*` is NOT here. It is admin-only, and the owner's own surface is
/// not an admin surface — the review queue reads it off the document.
public record HostPhoto(
    string Url,
    string? CardUrl,
    string? DetailUrl,
    bool IsFloorplan,
    int SortOrder);

/// Everything the listing editor edits — the half of the document that changes
/// once or twice a year, and the half whose change is a new claim about the
/// home (ADR-025). Kept apart from HostPricing for exactly that reason: saving
/// one of these re-enters review, saving one of those does not.
public record HostListing(
    string Name,
    string Type, // apartment | room | home
    string? Address,
    string? Postcode,
    string? CadastralRef,
    double Lat,
    double Lng,
    Bilingual? Area,
    Bilingual? Copy,
    bool CopyEnApproved,
    Bilingual? Details,
    Bilingual? Beds,
    int Guests,
    int Bedrooms,
    int Bathrooms,
    int SizeM2,
    int? FloorNumber,
    string? EnergyRating,
    string[] Amenities,
    bool PetsAllowed,
    bool SmokingAllowed,
    bool CouplesAllowed,
    bool SelfCheckin,
    HostPhoto[] Photos,
    // Raw, unlike the public projection: the owner sees `needsCheck` — the
    // flag that says a saved entry is farther than its group's radius allows
    // and wants a second look — which is exactly why PublicNearby has no such
    // field.
    NearbyEntry[] Nearby);

/// One logged booking request. Deliberately narrower than the stored document:
/// `userId` and `userName` are NOT projected. Ebrostay owns the tenant
/// relationship (§4.3 — the owner never contacts anyone), so the owner surface
/// has no use for a tenant identity and should not be able to leak one.
public record HostRequestRow(
    string Id,
    string? StartDate,
    string? EndDate,
    int Months,
    string Status, // new | contacted | confirmed | declined
    string? Channel,
    string? CreatedAt);

/// `Declined` sits BESIDE `Listing`, not inside it, and that placement is the
/// decision (§2.2.4). Inside, it would join the editor's diff, and dismissing a
/// suggestion would show up as an unsaved change — then travel with the content
/// save, and pull a published listing back into review.
public record HostPropertyDetail(
    HostProperty Property,
    HostPricing Pricing,
    HostListing Listing,
    DeclinedSuggestion[] Declined,
    HostRequestRow[] Requests);

/// What a content save answers with. The listing, so the editor can rebase its
/// baseline, and the property row, because a save may have moved `status` back
/// to `pending_review` and the page has a status pill on screen saying it did
/// not.
public record HostListingSaved(HostProperty Property, HostListing Listing);

public static class HostProjection
{
    // The eleven things a listing needs before it can be submitted (§4.4:
    // required fields in BOTH locales, at least one photo). Order is the order
    // the editor will ask for them.
    private static readonly Func<PropertyDoc, bool>[] Sections =
    [
        p => !string.IsNullOrWhiteSpace(p.Name),
        p => !string.IsNullOrWhiteSpace(p.Address) && p.Lat != 0 && p.Lng != 0,
        p => Both(p.Area),
        p => Both(p.Copy),
        p => Both(p.Details),
        p => Both(p.Beds),
        p => p.Guests > 0 && p.Bedrooms > 0 && p.Bathrooms > 0 && p.SizeM2 > 0,
        p => p.Amenities.Length > 0,
        p => p.PriceNumber > 0,
        p => p.DepositAmount is > 0 &&
             (p.BillsPolicy != "capped" || p.UtilitiesCapEur is > 0),
        p => p.Photos.Length > 0,
    ];

    public static int SectionsTotal => Sections.Length;

    private static bool Both(Bilingual? b) =>
        !string.IsNullOrWhiteSpace(b?.Es) && !string.IsNullOrWhiteSpace(b?.En);

    // Same blocking rule as the public projection (§2.2.3) — an expired hold
    // is not a block, and an owner should not see their own calendar as
    // fuller than a guest does.
    private static bool Blocks(AvailabilityRange r, DateTimeOffset now) =>
        r.Status != "hold" ||
        (r.HoldExpiresAt is not null &&
         DateTimeOffset.TryParse(r.HoldExpiresAt, out var exp) &&
         exp > now);

    public static HostProperty ToHostProperty(
        PropertyDoc p, DateTimeOffset now, int requestCount, string? oldestRequestAt)
        => new(
            p.Id,
            p.Status,
            p.ReviewNote,
            p.Reference,
            p.Name,
            p.Address,
            p.Area,
            p.Bedrooms,
            p.Bathrooms,
            p.SizeM2,
            p.PriceNumber,
            p.Photos
                .Where(ph => !ph.IsFloorplan)
                .OrderBy(ph => ph.SortOrder)
                .Select(ph => ph.Url)
                .FirstOrDefault(),
            p.Photos.Length,
            Sections.Count(check => check(p)),
            Sections.Length,
            requestCount,
            oldestRequestAt,
            p.AvailableFrom,
            p.UpdatedAt,
            p.Availability
                .Where(r => Blocks(r, now))
                .Select(r => new HostAvailabilityRange(
                    r.Start, r.End, r.Status, r.Note, r.TurnoverDaysOverride))
                .OrderBy(r => r.Start, StringComparer.Ordinal)
                .ToArray());

    public static HostListing ToListing(PropertyDoc p) => new(
        p.Name,
        p.Type,
        p.Address,
        p.Postcode,
        p.CadastralRef,
        p.Lat,
        p.Lng,
        p.Area,
        p.Copy,
        p.CopyEnApproved,
        p.Details,
        p.Beds,
        p.Guests,
        p.Bedrooms,
        p.Bathrooms,
        p.SizeM2,
        p.FloorNumber,
        p.EnergyRating,
        p.Amenities,
        p.PetsAllowed,
        p.SmokingAllowed,
        p.CouplesAllowed,
        p.SelfCheckin,
        // Sorted here so the editor never has to: the gallery is an ordered
        // thing, and two surfaces sorting it independently is how the cover
        // photo ends up differing between them.
        [.. p.Photos
            .OrderBy(ph => ph.SortOrder)
            .Select(ph => new HostPhoto(
                ph.Url, ph.CardUrl, ph.DetailUrl, ph.IsFloorplan, ph.SortOrder))],
        p.Nearby);

    public static HostPricing ToPricing(PropertyDoc p, int platformFee) => new(
        p.PriceNumber,
        p.DepositAmount,
        p.BillsPolicy,
        p.UtilitiesCapEur,
        p.MinStayMonths,
        p.MaxStayMonths,
        p.TurnoverDays,
        p.CleaningBy,
        p.CleaningFeeEur,
        platformFee);
}

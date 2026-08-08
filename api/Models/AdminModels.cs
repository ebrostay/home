namespace Ebrostay.Api.Models;

// The admin projections (spec §4.5, design 2026-08-08). Wider than the host
// ones on purpose, and only here: this is the single projection allowed to
// carry a photo's capture coordinates and another person's `hostId`.
//
// Everything an admin surface shows about a listing still goes through a
// projection rather than the document. `PropertyDoc` carries server-only
// fields — the street band's routing samples, the hold internals — and a
// reviewer has no use for any of them.

/// One listing waiting in the queue. Lean by design: this is a table the
/// reviewer scans, and the listing itself opens behind it.
public record AdminQueueItem(
    string Id,
    string? Reference,
    string Name,
    string? Address,
    Bilingual? Area,
    string? HostId,
    string? HostName,
    /// The document's last write. For a listing sitting in `pending_review`
    /// that IS the submission: every content save re-enters review and every
    /// status change rewrites `updatedAt`, so nothing can be waiting here
    /// with an older timestamp than the act that put it here. Not a stored
    /// `submittedAt` field, because a second timestamp would be a second
    /// truth to keep in step.
    string? SubmittedAt,
    string? CoverUrl,
    int PhotoCount,
    int PriceNumber,
    int Bedrooms,
    int SizeM2,
    /// Whether the review view will have a Catastro comparison to show
    /// (ADR-027) — so the queue can say which rows carry one before they are
    /// opened. The reference itself is not projected into the list.
    bool HasCadastralRef,
    /// How many photos carry capture coordinates (ADR-019 amendment). Zero is
    /// the common case and is NOT a warning — see the review panel.
    int LocatedPhotos);

/// One row of the all-properties table: every listing, any status.
public record AdminPropertyRow(
    string Id,
    string? Reference,
    string Status,
    string Name,
    string? Address,
    Bilingual? Area,
    string? HostId,
    string? HostName,
    int PriceNumber,
    int Bedrooms,
    int SizeM2,
    string? CoverUrl,
    int PhotoCount,
    string? ReviewNote,
    string? AvailableFrom,
    string? CreatedAt,
    string? UpdatedAt);

/// Who owns the listing under review. The name comes from the `profiles`
/// document, which is the only place we hold one — there is no email: it
/// arrives as a claim and is never stored (§3.4, and the users tab says so).
public record AdminOwner(
    string? Id,
    string? Name,
    string? Provider,
    bool IsDeactivated);

/// A photo as ONLY an admin may see it: with the coordinates the camera wrote,
/// read off the file during the upload re-encode that strips EXIF from the
/// published image (ADR-019 amendment, §2.2.2).
///
/// This is the one projection in the codebase carrying these fields. They are
/// location data about a real person — an owner who uploads a photo taken in
/// their own home has told us where they live — so `PublicPhoto` and
/// `HostPhoto` both deliberately omit them, and adding them to either is a
/// privacy regression, not a convenience.
public record AdminPhoto(
    string Url,
    string? CardUrl,
    string? DetailUrl,
    bool IsFloorplan,
    int SortOrder,
    bool HiddenFromGallery,
    double? CapturedLat,
    double? CapturedLng,
    string? CapturedAt);

/// Everything the review view needs about one listing.
public record AdminPropertyDetail(
    HostProperty Property,
    HostPricing Pricing,
    HostListing Listing,
    /// Outside answers the owner has already ruled on (§2.2.4). Context for
    /// the reviewer, never a resolution and never evidence: it is
    /// host-writable, so a queue that weighed it would let a listing argue its
    /// own review.
    DeclinedSuggestion[] Declined,
    AdminOwner Owner,
    AdminPhoto[] Photos,
    string? CreatedAt);

/// One person, as the users tab lists them (§3.7). No email — the profile
/// document has never held one.
public record AdminUser(
    string Id,
    string Provider,
    string Name,
    string? CreatedAt,
    string? LastSeenAt,
    bool IsDeactivated,
    int ListingCount,
    int PublishedCount);

public record AdminStatusUpdate(string? Status);

public record AdminRejection(string? Note);

public record AdminDeactivation(bool IsDeactivated);

/// The admin write rules, kept pure so the negative matrix can be tested
/// without a Cosmos account behind it.
public static class AdminValidation
{
    /// A reviewer's note is the whole content of a rejection: it is what the
    /// owner reads in their portfolio and the only thing telling them what to
    /// change. A blank one turns "rejected" into a silent refusal.
    public const int MaxNoteLength = 2000;

    /// Statuses `PUT /status` may set. Publishing is NOT here — approving has
    /// a precondition about where the listing came from (`CheckApprove`), and
    /// a general setter that also published would let a reviewer publish a
    /// draft nobody ever submitted.
    private static readonly string[] Settable = ["published", "paused"];

    /// Which statuses may be rejected FROM. A draft is not under review and a
    /// rejected listing is already rejected — in both cases the note would
    /// answer a question the owner has not asked.
    private static readonly string[] Rejectable = ["pending_review", "published", "paused"];

    /// The pair, and only the pair: a live listing may be paused, and a paused
    /// one may go live again. `published` from anywhere else would publish
    /// something no reviewer has read — the back door ADR-030 closed on the
    /// owner side — and pausing a draft or a rejection means nothing, since
    /// neither is open to requests to begin with.
    public static string? CheckStatus(string? status, PropertyDoc doc) =>
        !Settable.Contains(status) ? "status_invalid"
        : status == "paused" && doc.Status != "published" ? "not_published"
        : status == "published" && doc.Status != "paused" ? "not_reviewed"
        : null;

    /// `pending_review` and nothing else: approve is the answer to a
    /// submission, so there has to be one.
    public static string? CheckApprove(PropertyDoc doc) =>
        doc.Status == "pending_review" ? null : "not_in_review";

    public static string? CheckReject(string? note, PropertyDoc doc)
    {
        if (!Rejectable.Contains(doc.Status)) return "not_reviewable";
        var trimmed = note?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return "note_required";
        return trimmed.Length > MaxNoteLength ? "note_too_long" : null;
    }
}

public static class AdminProjection
{
    public static AdminQueueItem ToQueueItem(PropertyDoc p, string? hostName) => new(
        p.Id,
        p.Reference,
        p.Name,
        p.Address,
        p.Area,
        p.HostId,
        hostName,
        p.UpdatedAt,
        Cover(p),
        p.Photos.Length,
        p.PriceNumber,
        p.Bedrooms,
        p.SizeM2,
        !string.IsNullOrWhiteSpace(p.CadastralRef),
        p.Photos.Count(ph => ph.CapturedLat is not null && ph.CapturedLng is not null));

    public static AdminPropertyRow ToRow(PropertyDoc p, string? hostName) => new(
        p.Id,
        p.Reference,
        p.Status,
        p.Name,
        p.Address,
        p.Area,
        p.HostId,
        hostName,
        p.PriceNumber,
        p.Bedrooms,
        p.SizeM2,
        Cover(p),
        p.Photos.Length,
        p.ReviewNote,
        p.AvailableFrom,
        p.CreatedAt,
        p.UpdatedAt);

    public static AdminPhoto[] ToPhotos(PropertyDoc p) =>
    [
        .. p.Photos
            .OrderBy(ph => ph.SortOrder)
            .Select(ph => new AdminPhoto(
                ph.Url, ph.CardUrl, ph.DetailUrl, ph.IsFloorplan, ph.SortOrder,
                ph.HiddenFromGallery, ph.CapturedLat, ph.CapturedLng, ph.CapturedAt)),
    ];

    /// Same cover rule as every other surface: a floor plan is not a cover,
    /// and neither is a photo the owner kept out of the gallery.
    private static string? Cover(PropertyDoc p) => p.Photos
        .Where(ph => !ph.IsFloorplan && !ph.HiddenFromGallery)
        .OrderBy(ph => ph.SortOrder)
        .Select(ph => ph.Url)
        .FirstOrDefault();
}

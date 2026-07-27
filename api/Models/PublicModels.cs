namespace Ebrostay.Api.Models;

// Public (anonymous) projections — spec-v2 §2.2 "Public projection":
// published docs only; hostId, reviewNote, availability notes/hold internals
// are stripped. Public availability = blocking {start, end} ranges only,
// with EXPIRED holds excluded (spec-v2 §2.2.3 / v1 open decision #2).

public record PublicRange(string Start, string End);

public record PropertySummary(
    string Id,
    string City,
    string Type,
    string Name,
    Bilingual? Area,
    double Lat,
    double Lng,
    int Guests,
    int Bedrooms,
    int Bathrooms,
    int SizeM2,
    int PriceNumber,
    string BillsPolicy,
    string[] Amenities,
    bool IsNew,
    bool Checked,
    bool DepositProtected,
    string? AvailableFrom,
    string? CoverUrl,
    PublicRange[] Availability);

public record PropertyDetail(
    string Id,
    string City,
    string Type,
    string Name,
    string? Address,
    double Lat,
    double Lng,
    Bilingual? Area,
    Bilingual? Copy,
    Bilingual? Details,
    Bilingual? Beds,
    Bilingual? PriceNote,
    int Guests,
    int Bedrooms,
    int Bathrooms,
    int SizeM2,
    int? FloorNumber,
    string[] Amenities,
    string? EnergyRating,
    bool PetsAllowed,
    bool SmokingAllowed,
    bool CouplesAllowed,
    bool SelfCheckin,
    string? VideoUrl,
    int PriceNumber,
    int? DepositAmount,
    int? UpfrontRentEur,
    string BillsPolicy,
    int? UtilitiesCapEur,
    int MinStayMonths,
    int MaxStayMonths,
    /// One-off turnover charge at move-in, already RESOLVED from the listing's
    /// `cleaningBy` and the platform rate (ADR-026). A visitor is quoted a
    /// number; who arranges the clean is not their concern and not their
    /// business to know.
    int CleaningFeeEur,
    string[] StayTerms,
    bool IsNew,
    bool Checked,
    bool DepositProtected,
    string? AvailableFrom,
    PropertyPhoto[] Photos,
    PublicRange[] Availability);

public static class PublicProjection
{
    /// The fee a stay actually carries. One place, because the owner's page,
    /// the visitor's estimate and (later) the booking recompute must never
    /// disagree about it.
    public static int CleaningFee(PropertyDoc p, int platformFee) =>
        p.CleaningBy == "host" ? (p.CleaningFeeEur ?? 0) : platformFee;

    // A range blocks when it is a real block or an unexpired hold.
    public static bool Blocks(AvailabilityRange r, DateTimeOffset now) =>
        r.Status != "hold" ||
        (r.HoldExpiresAt is not null &&
         DateTimeOffset.TryParse(r.HoldExpiresAt, out var exp) &&
         exp > now);

    /// How many days after this range the home still cannot be let (ADR-026).
    public static int Turnover(AvailabilityRange r, int listingDays) =>
        Math.Max(0, r.TurnoverDaysOverride ?? listingDays);

    /// The public availability shape: blocking ranges with the turnover buffer
    /// already folded in. Extending the range HERE rather than at each consumer
    /// is the whole point — the search grid, the detail calendar, the estimate
    /// conflict check and the band all read this one list, so they cannot
    /// disagree about whether a home is free the day after a stay ends. It is
    /// also why guests never learn *why* a day is unavailable: they get dates,
    /// not reasons.
    public static PublicRange[] BlockingRanges(
        IEnumerable<AvailabilityRange> ranges, DateTimeOffset now, int turnoverDays = 0)
        => ranges
            .Where(r => Blocks(r, now))
            .Select(r => new PublicRange(r.Start, AddDays(r.End, Turnover(r, turnoverDays))))
            .OrderBy(r => r.Start, StringComparer.Ordinal)
            .ToArray();

    /// ISO day arithmetic. Ordinal string comparison IS date comparison for
    /// these, which is why the whole system stores dates this way.
    public static string AddDays(string iso, int days) =>
        days == 0
            ? iso
            : DateOnly.ParseExact(iso, "yyyy-MM-dd").AddDays(days).ToString("yyyy-MM-dd");

    public static PropertySummary ToSummary(PropertyDoc p, DateTimeOffset now)
        => new(
            p.Id, p.City, p.Type, p.Name, p.Area, p.Lat, p.Lng,
            p.Guests, p.Bedrooms, p.Bathrooms, p.SizeM2,
            p.PriceNumber, p.BillsPolicy, p.Amenities, p.IsNew,
            p.Checked, p.DepositProtected, p.AvailableFrom,
            p.Photos
                .Where(ph => !ph.IsFloorplan)
                .OrderBy(ph => ph.SortOrder)
                .Select(ph => ph.Url)
                .FirstOrDefault(),
            BlockingRanges(p.Availability, now, p.TurnoverDays));

    public static PropertyDetail ToDetail(PropertyDoc p, DateTimeOffset now, int platformFee)
        => new(
            p.Id, p.City, p.Type, p.Name, p.Address, p.Lat, p.Lng,
            p.Area, p.Copy, p.Details, p.Beds, p.PriceNote,
            p.Guests, p.Bedrooms, p.Bathrooms, p.SizeM2, p.FloorNumber,
            p.Amenities, p.EnergyRating, p.PetsAllowed, p.SmokingAllowed,
            p.CouplesAllowed, p.SelfCheckin, p.VideoUrl,
            p.PriceNumber, p.DepositAmount, p.UpfrontRentEur,
            p.BillsPolicy, p.UtilitiesCapEur, p.MinStayMonths, p.MaxStayMonths,
            CleaningFee(p, platformFee),
            p.StayTerms, p.IsNew, p.Checked, p.DepositProtected, p.AvailableFrom,
            p.Photos.OrderBy(ph => ph.SortOrder).ToArray(),
            BlockingRanges(p.Availability, now, p.TurnoverDays));
}

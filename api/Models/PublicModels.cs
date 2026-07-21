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
    double? Rating,
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
    double? Rating,
    bool IsNew,
    bool Checked,
    bool DepositProtected,
    string? AvailableFrom,
    PropertyPhoto[] Photos,
    PublicRange[] Availability);

public static class PublicProjection
{
    // A range blocks when it is a real block or an unexpired hold.
    public static PublicRange[] BlockingRanges(
        IEnumerable<AvailabilityRange> ranges, DateTimeOffset now)
        => ranges
            .Where(r =>
                r.Status != "hold" ||
                (r.HoldExpiresAt is not null &&
                 DateTimeOffset.TryParse(r.HoldExpiresAt, out var exp) &&
                 exp > now))
            .Select(r => new PublicRange(r.Start, r.End))
            .OrderBy(r => r.Start, StringComparer.Ordinal)
            .ToArray();

    public static PropertySummary ToSummary(PropertyDoc p, DateTimeOffset now)
        => new(
            p.Id, p.City, p.Type, p.Name, p.Area, p.Lat, p.Lng,
            p.Guests, p.Bedrooms, p.Bathrooms, p.SizeM2,
            p.PriceNumber, p.BillsPolicy, p.Amenities, p.Rating, p.IsNew,
            p.Checked, p.DepositProtected, p.AvailableFrom,
            p.Photos
                .Where(ph => !ph.IsFloorplan)
                .OrderBy(ph => ph.SortOrder)
                .Select(ph => ph.Url)
                .FirstOrDefault(),
            BlockingRanges(p.Availability, now));

    public static PropertyDetail ToDetail(PropertyDoc p, DateTimeOffset now)
        => new(
            p.Id, p.City, p.Type, p.Name, p.Address, p.Lat, p.Lng,
            p.Area, p.Copy, p.Details, p.Beds, p.PriceNote,
            p.Guests, p.Bedrooms, p.Bathrooms, p.SizeM2, p.FloorNumber,
            p.Amenities, p.EnergyRating, p.PetsAllowed, p.SmokingAllowed,
            p.CouplesAllowed, p.SelfCheckin, p.VideoUrl,
            p.PriceNumber, p.DepositAmount, p.UpfrontRentEur,
            p.BillsPolicy, p.UtilitiesCapEur, p.MinStayMonths, p.MaxStayMonths,
            p.Rating, p.IsNew, p.Checked, p.DepositProtected, p.AvailableFrom,
            p.Photos.OrderBy(ph => ph.SortOrder).ToArray(),
            BlockingRanges(p.Availability, now));
}

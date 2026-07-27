namespace Ebrostay.Api.Models;

// The `properties` container document — docs/spec-v2/02-data-model.md §2.2.
// Serialized camelCase via CosmosClientOptions (Program.cs).

public record Bilingual(string? Es, string? En);

public record PropertyPhoto(string Url, bool IsFloorplan, int SortOrder);

public record AvailabilityRange(
    string Start,
    string End, // exclusive
    string? Status,
    string? Note,
    string? HoldExpiresAt,
    /// Admin-set, for the stay whose turnaround cannot be staffed in the
    /// listing's usual window. Null means "use the listing's TurnoverDays".
    int? TurnoverDaysOverride = null);

public class PropertyDoc
{
    public string Id { get; set; } = "";
    public string Status { get; set; } = "draft";
    public string? ReviewNote { get; set; }
    public string? HostId { get; set; }

    // Human-quotable listing reference (EBR-P-0141), shown to the owner and
    // usable in support threads. Not the key — `Id` is. Nullable: listings
    // created before references existed simply have none.
    public string? Reference { get; set; }

    public string City { get; set; } = "zaragoza";
    public string Type { get; set; } = "apartment";
    public string Name { get; set; } = "";
    public string? AddressKey { get; set; }
    public string? Address { get; set; }
    public string? Postcode { get; set; }

    // The Catastro reference, stored exactly as the owner typed it. Nothing
    // checks it against the Catastro yet, which is why no surface renders a
    // "matched" badge next to it (ADR-027) — a badge would claim a
    // verification that never ran.
    public string? CadastralRef { get; set; }

    public double Lat { get; set; }
    public double Lng { get; set; }

    public Bilingual? Area { get; set; }
    public Bilingual? Copy { get; set; }
    public Bilingual? Details { get; set; }
    public Bilingual? Beds { get; set; }
    public Bilingual? PriceNote { get; set; }

    // The owner has read the English description and stands behind it
    // (ADR-027). Only `Copy` carries the gate: it is the one paragraph a
    // guest reads as the owner's own voice, and the only one long enough for
    // a bad translation to mislead. Area, details and beds are short labels
    // whose meaning survives a literal rendering.
    public bool CopyEnApproved { get; set; }

    public int Guests { get; set; }
    public int Bedrooms { get; set; }
    public int Bathrooms { get; set; }
    public int SizeM2 { get; set; }
    public int? FloorNumber { get; set; }
    public string[] Amenities { get; set; } = [];
    public string? EnergyRating { get; set; }
    public bool PetsAllowed { get; set; }
    public bool SmokingAllowed { get; set; }
    public bool CouplesAllowed { get; set; }
    public bool SelfCheckin { get; set; }
    public string? VideoUrl { get; set; }

    public int PriceNumber { get; set; }
    public string? PriceLabel { get; set; }
    public int? DepositAmount { get; set; }
    public int? UpfrontRentEur { get; set; }
    public string BillsPolicy { get; set; } = "excluded";
    public int? UtilitiesCapEur { get; set; }
    public int MinStayMonths { get; set; } = 1;
    public int MaxStayMonths { get; set; } = 11;

    // Turnover (ADR-026). A stay measured in months ends in an inspection, a
    // meter reading and a deep clean — not a housekeeping pass between two
    // hotel nights. Who does that work decides where the fee comes from:
    //   "host"     — the owner arranges it and sets CleaningFeeEur.
    //   "platform" — Ebrostay arranges it at the platform rate, which lives in
    //                app settings so it can be repriced without a migration.
    public string CleaningBy { get; set; } = "platform";
    public int? CleaningFeeEur { get; set; }

    // Days shut after every stay so that work can happen. DERIVED into the
    // overlap predicate, never written to Availability: a stored buffer is a
    // second copy of a rule and goes stale the moment the rule or the stay
    // moves (§2.2.3).
    public int TurnoverDays { get; set; } = DefaultTurnoverDays;

    public const int DefaultTurnoverDays = 3;

    // Which optional stay terms the OWNER has confirmed apply to this home
    // (ADR-023). Terms the document already implies are NOT listed here —
    // bills come from BillsPolicy/UtilitiesCapEur and the deposit term from
    // DepositAmount, so a listing cannot promise one thing in its terms and
    // another in its conditions table.
    public string[] StayTerms { get; set; } = [];

    public bool IsNew { get; set; }
    public bool Checked { get; set; }
    public bool DepositProtected { get; set; }
    public string? AvailableFrom { get; set; }

    public PropertyPhoto[] Photos { get; set; } = [];
    public AvailabilityRange[] Availability { get; set; } = [];

    public string? CreatedAt { get; set; }
    public string? UpdatedAt { get; set; }
}

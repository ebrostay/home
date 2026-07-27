using System.Globalization;

namespace Ebrostay.Api.Models;

// What the owner may send from "Manage property", and the rules that make each
// payload safe to apply. Validation lives here rather than in the function so
// the rules read as one list and the function reads as one flow.
//
// ADR-025 draws the line these two payloads sit on: pricing and availability
// apply immediately and leave `status` alone; content edits (copy, photos,
// address, capacity) go through the editor and re-enter review. Neither DTO
// below can express a content change or a status change, so the boundary is
// structural — it cannot be bypassed by a well-formed request.

public record PricingUpdate(
    int PriceNumber,
    int? DepositAmount,
    string? BillsPolicy,
    int? UtilitiesCapEur,
    int MinStayMonths,
    string? CleaningBy,
    int? CleaningFeeEur);

/// One owner-authored block. `end` is EXCLUSIVE (§2.2.3). No status field:
/// everything the owner writes here is `confirmed` — holds belong to the
/// booking flow and are preserved untouched across a write.
public record AvailabilityWrite(string? Start, string? End, string? Note);

public record AvailabilityUpdate(AvailabilityWrite[]? Blocks);

public static class HostValidation
{
    /// A listing carries a small, bounded calendar (§2.2.3 "tens, not
    /// thousands"). The cap is what keeps that true when the writer is a form.
    public const int MaxBlocks = 60;

    public const int MaxPrice = 50_000;
    public const int MaxDeposit = 100_000;
    public const int MaxCap = 2_000;
    public const int MaxCleaningFee = 1_000;
    private const int MaxNoteLength = 120;

    private static readonly string[] BillsPolicies = ["included", "capped", "excluded"];
    private static readonly string[] CleaningParties = ["host", "platform"];

    /// Returns an error code, or null when the payload is applicable. Codes are
    /// stable strings the client maps to bilingual copy — never prose.
    public static string? CheckPricing(PricingUpdate u, int maxStayMonths)
    {
        if (u.PriceNumber < 1 || u.PriceNumber > MaxPrice) return "price_out_of_range";
        if (u.DepositAmount is < 0 or > MaxDeposit) return "deposit_out_of_range";

        var policy = u.BillsPolicy ?? "excluded";
        if (!BillsPolicies.Contains(policy)) return "bills_policy_invalid";
        // A cap is the whole content of the "capped" policy: without a number
        // the listing would promise a ceiling it does not name.
        if (policy == "capped" && u.UtilitiesCapEur is not (> 0 and <= MaxCap))
            return "cap_required";

        if (u.MinStayMonths < 1 || u.MinStayMonths > maxStayMonths)
            return "min_stay_out_of_range";

        var cleaning = u.CleaningBy ?? "platform";
        if (!CleaningParties.Contains(cleaning)) return "cleaning_by_invalid";
        // Only meaningful when the owner is the one doing the turnaround. The
        // platform's rate is policy, and a listing cannot quote its own.
        if (cleaning == "host" && u.CleaningFeeEur is not (>= 0 and <= MaxCleaningFee))
            return "cleaning_fee_out_of_range";

        return null;
    }

    /// Blocks must be well-formed, non-overlapping among themselves, and must
    /// not collide with a hold the booking flow is still holding. The overlap
    /// predicate is the one from §2.2.3 — half-open, strict `<` on both sides.
    public static string? CheckAvailability(
        AvailabilityWrite[] blocks, IEnumerable<AvailabilityRange> survivingHolds)
    {
        if (blocks.Length > MaxBlocks) return "too_many_blocks";

        foreach (var b in blocks)
        {
            if (!IsIsoDay(b.Start) || !IsIsoDay(b.End)) return "date_invalid";
            // Ordinal string comparison IS date comparison for ISO days, which
            // is why the whole system stores them this way.
            if (string.CompareOrdinal(b.End, b.Start) <= 0) return "date_range_empty";
            if (b.Note is not null && b.Note.Length > MaxNoteLength) return "note_too_long";
        }

        for (var i = 0; i < blocks.Length; i++)
        {
            for (var j = i + 1; j < blocks.Length; j++)
                if (Overlaps(blocks[i].Start!, blocks[i].End!, blocks[j].Start!, blocks[j].End!))
                    return "blocks_overlap";

            foreach (var hold in survivingHolds)
                if (Overlaps(blocks[i].Start!, blocks[i].End!, hold.Start, hold.End))
                    return "hold_conflict";
        }

        return null;
    }

    public static bool Overlaps(string aStart, string aEnd, string bStart, string bEnd) =>
        string.CompareOrdinal(aStart, bEnd) < 0 && string.CompareOrdinal(bStart, aEnd) < 0;

    private static bool IsIsoDay(string? value) =>
        value is { Length: 10 } &&
        DateOnly.TryParseExact(
            value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
}

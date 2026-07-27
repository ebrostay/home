using System.Globalization;

namespace Ebrostay.Api.Services;

// Platform-wide commercial numbers that are policy rather than per-listing
// data (ADR-026). They live in app settings so they can be repriced without
// touching every property document, and they are read once at startup — a
// price that changes mid-request would produce two different quotes for one
// stay.
//
// These are NOT secrets: they are published to every visitor inside the
// estimate. They sit in app settings for the deploy-free edit, not for
// concealment.
public class PlatformSettings
{
    /// <summary>
    /// What Ebrostay charges to turn a home around when the owner has not
    /// taken it on themselves. PLACEHOLDER until real cost data exists —
    /// a deep clean of an 80–90 m² flat after a months-long stay is a
    /// different job from a short-let turnover, and this number should come
    /// from invoices, not from a guess in a constructor.
    /// </summary>
    public int CleaningFeeEur { get; } = ReadInt("PLATFORM_CLEANING_FEE_EUR", 120);

    private static int ReadInt(string key, int fallback)
    {
        var raw = Environment.GetEnvironmentVariable(key);
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v)
            && v >= 0
            ? v
            : fallback;
    }
}

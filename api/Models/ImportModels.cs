namespace Ebrostay.Api.Models;

// The AI-assisted import (ADR-033). Nothing here does I/O.

/// One source we will read, and how its host is recognised. `AnyTld` exists
/// for the two international sites: Airbnb and Booking answer on dozens of
/// TLDs and an owner will paste whichever one their browser gave them.
public record ImportSourceDef(string Key, string[] Domains, bool AnyTld);

public static class ImportSources
{
    /// The closed list. Named on screen BEFORE anything is pasted, because an
    /// unmapped page puts values in the wrong fields and a wrong field the
    /// owner did not notice is worse than an empty form.
    public static readonly ImportSourceDef[] All =
    [
        new("idealista",  ["idealista.com"],  false),
        new("fotocasa",   ["fotocasa.es"],    false),
        new("habitaclia", ["habitaclia.com"], false),
        new("pisos",      ["pisos.com"],      false),
        new("airbnb",     ["airbnb"],         true),
        new("booking",    ["booking"],        true),
    ];

    public static bool IsKnown(string? key) =>
        key is not null && All.Any(s => s.Key == key);

    /// The pasted URL → one of the six, or null. Deliberately strict: this is
    /// the only thing standing between an owner's paste and a fetch, and a
    /// host we do not map yields values in the wrong fields.
    public static string? Match(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return null;

        var host = uri.Host.ToLowerInvariant();
        if (host.StartsWith("www.", StringComparison.Ordinal)) host = host[4..];

        foreach (var source in All)
        {
            foreach (var domain in source.Domains)
            {
                if (source.AnyTld)
                {
                    // Airbnb and Booking answer on dozens of TLDs. Match the
                    // brand label, then require that everything AFTER it is
                    // TLD-shaped (<= 3 chars) — so airbnb.co.uk matches and
                    // airbnb.evil.com does not.
                    var labels = host.Split('.');
                    var at = Array.IndexOf(labels, domain);
                    if (at >= 0 && at < labels.Length - 1 &&
                        labels.Skip(at + 1).All(l => l.Length is > 0 and <= 3))
                        return source.Key;
                }
                else if (host == domain || host.EndsWith("." + domain, StringComparison.Ordinal))
                {
                    return source.Key;
                }
            }
        }
        return null;
    }
}

/// Every field an import may claim to have filled. The client's copy is
/// `IMPORT_KEYS` in app/lib/import.ts and the two must stay equal — this list
/// is what the mark renderer iterates and what the callback validates, so a
/// drift is either an unmarked field or a rejected callback.
///
/// Grouped controls carry ONE key for the group, not one per option: `type`,
/// `energyRating`, `amenities`, `billsPolicy`, `minStayMonths` and each house
/// rule. A portal's feature list mapping to nine of fifteen amenities is still
/// one answer to one question.
public static class ImportKeys
{
    public static readonly HashSet<string> All = new(StringComparer.Ordinal)
    {
        "address", "postcode", "pin", "area", "cadastralRef",
        "name", "type", "sizeM2", "bedrooms", "bathrooms", "guests",
        "floorNumber", "energyRating",
        "copy", "details", "beds",
        "amenities",
        "price", "billsPolicy", "utilitiesCapEur", "depositAmount", "minStayMonths",
        "petsAllowed", "smokingAllowed", "couplesAllowed", "selfCheckin",
    };

    /// 26 keys exist; the cap is what keeps that true when the writer is not a
    /// correct client. Same reasoning as MaxDeclined in HostValidation.
    public const int MaxKeys = 32;
}

public static class ImportStage
{
    public const string Queued = "queued";
    public const string Fetching = "fetching";
    public const string Reading = "reading";
    public const string Matching = "matching";
    public const string Done = "done";
    public const string Failed = "failed";
    public const string Cancelled = "cancelled";

    /// The running stages, in order. Rank exists so an out-of-order report
    /// from a pipeline that retried a step cannot walk the owner's status
    /// line backwards.
    public static readonly string[] Order = [Queued, Fetching, Reading, Matching];

    public static readonly string[] All =
        [Queued, Fetching, Reading, Matching, Done, Failed, Cancelled];

    public static bool IsTerminal(string stage) =>
        stage is Done or Failed or Cancelled;

    public static int Rank(string stage) => Array.IndexOf(Order, stage);
}

public record ImportError(string Code)
{
    /// A closed set, so both locales can name every one of them. Failure
    /// LAYOUT is still to be designed (OD-8); these are the codes it will
    /// have to render.
    public static readonly string[] Codes =
        ["login_wall", "not_found", "withdrawn", "unreadable", "timeout", "pipeline_error"];
}

/// What was pointed at. A discriminated union from day one so the document
/// flow (`kind: "document"`, OD-7) is additive and does not version the
/// pipeline contract.
public record ImportJobSource(string Kind, string Host, string? Url);

/// The `importJobs` container document. Partitioned on /id because the only
/// access pattern is a point read by job id — which is what makes a 2-second
/// poll cost 1 RU.
public record ImportJobDoc(
    string Id,
    string OwnerId,
    ImportJobSource Source,
    string Stage,
    string CreatedAt,
    string UpdatedAt,
    /// CreatedAt + 5 minutes. A poll that finds a running job past this fails
    /// it — which is why this feature needs no timer trigger, the same lazy
    /// pattern RouteCache uses for stale geometry.
    string DeadlineAt,
    /// NEVER projected to the client. Per-job rather than a shared secret, so
    /// a leak is scoped to one job and dies with it.
    string CallbackToken,
    ImportResult? Result,
    ImportError? Error,
    int Ttl);

/// The job as the owner is allowed to see it. The token is absent by
/// construction, not by remembering to remove it.
public record ImportJobView(
    string JobId,
    string Kind,
    string Host,
    string Stage,
    string CreatedAt,
    ImportResult? Result,
    ImportError? Error);

public record ImportQueueMessage(
    string JobId,
    ImportJobSource Source,
    string CallbackUrl,
    string CallbackToken,
    string DeadlineAt);

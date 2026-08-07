using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using Ebrostay.Api.Models;
using Microsoft.Extensions.Logging;

namespace Ebrostay.Api.Services;

public record GeoPoint(double Lat, double Lng);
public record OrsRoute(string Polyline, int Metres, int Seconds);

public sealed class OrsUnavailableException(string reason) : Exception(reason);

/// The ONLY class that knows OpenRouteService exists.
///
/// Server-side is forced three times over: the key cannot go in the client;
/// ORS requires a real User-Agent, which a browser will not let us set; and a
/// rate promise can only be kept from a place that sees all the traffic.
///
/// The terms may change "effective immediately upon posting", so the seam is
/// deliberate — self-hosting OSRM or ORS speaks the same request shape.
public sealed class OrsClient(
    IHttpClientFactory factory,
    OrsBudget budget,
    ILogger<OrsClient> log)
{
    private const string Base = "https://api.openrouteservice.org";

    /// Set ORS_FIXTURES=1 locally to answer from canned data. Required, not a
    /// nicety: there is no ORS emulator, so without it the failure paths cannot
    /// be exercised at all and every UI iteration burns production quota.
    /// Checked BEFORE any budget consumption or network call, in both public
    /// methods, so fixture-mode UI work never costs quota or depends on ORS
    /// being reachable.
    ///
    /// Under ORS_FIXTURES=1 ALONE, every destination in a matrix comes back
    /// routable — this is the well-trodden path, and it must stay boring: an
    /// owner adding two or more places and saving once is ordinary use, and
    /// the server always re-measures every new/moved entry together (see
    /// HostFunctions), so if any one of them came back unroutable by default
    /// the save would be refused every time under fixtures, for no reason a
    /// real host would ever hit.
    ///
    /// Set ORS_FIXTURES_UNROUTABLE=1 as well to deliberately exercise the path
    /// real ORS data rarely produces: with more than one destination in a
    /// matrix, the LAST one comes back null, the same shape ORS uses for a POI
    /// it cannot route to. That is what lets NearbyLookup's foot-less-candidate
    /// filter and HostFunctions' `nearby_unroutable` refusal be tested on
    /// purpose, on demand — without also breaking the ordinary multi-entry
    /// save every other fixture-mode session relies on.
    private static bool Fixtures =>
        Environment.GetEnvironmentVariable("ORS_FIXTURES") == "1";

    private static bool FixturesUnroutable =>
        Environment.GetEnvironmentVariable("ORS_FIXTURES_UNROUTABLE") == "1";

    /// The one canned fixture route. Exposed so `RouteCache.ComputeBandAsync`'s
    /// own band-fixture short-circuit — which must return without calling ORS
    /// (even the fixture path here) so the three-route merge stays boring and
    /// deterministic — builds its trunk from the same polyline this method
    /// answers with under `ORS_FIXTURES=1`, rather than a second copy that
    /// could drift from this one.
    internal const string FixtureRoutePolyline = "cse}Fbq_DcBwB{@kCkCcBoAkC";

    public async Task<NearbyReach?[]> MatrixAsync(
        GeoPoint origin, IReadOnlyList<GeoPoint> destinations, string profile,
        CancellationToken ct)
    {
        var matrix = await MatrixAsync([origin], destinations, profile, ct);
        return matrix.Length == 0 ? [] : matrix[0];
    }

    /// Multi-origin matrix: one ORS call carries several sources at no extra
    /// cost (ADR-041) — used to measure the door AND the two inset street-band
    /// samples together, so the public reach figure can become a door-safe
    /// range instead of exposing the exact pin. Result indexed [origin][destination].
    public async Task<NearbyReach?[][]> MatrixAsync(
        IReadOnlyList<GeoPoint> origins, IReadOnlyList<GeoPoint> destinations, string profile,
        CancellationToken ct)
    {
        if (destinations.Count == 0 || origins.Count == 0) return [];
        if (Fixtures)
        {
            log.LogWarning(
                "ORS_FIXTURES=1: serving canned matrix data, not calling ORS. " +
                "This must never be set outside local development.");
            // Every destination routable by default (see the comment on
            // `Fixtures`/`FixturesUnroutable` above) — this is the path an
            // ordinary multi-entry add-and-save exercises, and it must not be
            // refused by fixture data alone. Only with ORS_FIXTURES_UNROUTABLE
            // also set, and only with more than one destination (a single one
            // is a route preview, and stays non-null so that flow still works
            // locally), does the LAST destination in the batch come back null
            // — "unroutable", the same shape ORS uses for one POI it cannot
            // reach — so the foot-less-candidate filter and the save path's
            // `nearby_unroutable` refusal can be exercised on purpose. That
            // rule is per origin: only origin 0 (the door) ever nulls its last
            // destination — the band samples (origins 1/2) stay fully
            // routable so the range logic always has real figures to bound.
            // Per-origin variation (Minutes + originIndex) is what lets the
            // range logic — MinMinutes vs MaxMinutes — be exercised at all;
            // identical figures for every origin would always collapse to a
            // single-width band.
            var result = new NearbyReach?[origins.Count][];
            for (var o = 0; o < origins.Count; o++)
            {
                if (destinations.Count == 1 || !FixturesUnroutable || o != 0)
                {
                    result[o] = [.. destinations.Select((_, i) =>
                        new NearbyReach(200 + i * 90, 3 + i + o))];
                }
                else
                {
                    var fixtureReach = new NearbyReach?[destinations.Count];
                    for (var i = 0; i < destinations.Count; i++)
                        fixtureReach[i] = i == destinations.Count - 1
                            ? null
                            : new NearbyReach(200 + i * 90, 3 + i + o);
                    result[o] = fixtureReach;
                }
            }
            return result;
        }

        if (!await budget.TryConsumeAsync(1, ct))
            throw new OrsUnavailableException("budget");

        var coords = new List<double[]>(origins.Select(o => new[] { o.Lng, o.Lat }));
        coords.AddRange(destinations.Select(d => new[] { d.Lng, d.Lat }));

        var body = JsonSerializer.Serialize(new
        {
            locations = coords,
            sources = Enumerable.Range(0, origins.Count).ToArray(),
            metrics = new[] { "distance", "duration" },
        });

        using var res = await SendAsync(
            $"{Base}/v2/matrix/{NearbyGroups.OrsProfile(profile)}", body, ct);

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        var distances = doc.RootElement.GetProperty("distances");
        var durations = doc.RootElement.GetProperty("durations");

        var matrix = new NearbyReach?[origins.Count][];
        for (var o = 0; o < origins.Count; o++)
        {
            var distRow = distances[o];
            var durRow = durations[o];
            var reach = new NearbyReach?[destinations.Count];
            for (var i = 0; i < destinations.Count; i++)
            {
                // Destinations start right after the origins in the shared
                // `locations` list, so index `origins.Count + i`.
                var m = distRow[origins.Count + i];
                var s = durRow[origins.Count + i];
                // ORS returns null per-destination for anything it cannot route to
                // (no mapped footpath, an uncrossable road) — not an outage, just
                // that one destination. Leave it null and let the caller drop it
                // rather than aborting the whole category over one bad POI.
                if (m.ValueKind == JsonValueKind.Null || s.ValueKind == JsonValueKind.Null)
                {
                    reach[i] = null;
                    continue;
                }
                reach[i] = new NearbyReach(
                    (int)Math.Round(m.GetDouble()),
                    Math.Max(1, (int)Math.Round(s.GetDouble() / 60.0)));
            }
            matrix[o] = reach;
        }
        return matrix;
    }

    public async Task<OrsRoute> RouteAsync(
        GeoPoint from, GeoPoint to, string profile, CancellationToken ct,
        bool simplify = true)
    {
        if (Fixtures)
        {
            log.LogWarning(
                "ORS_FIXTURES=1: serving canned route data, not calling ORS. " +
                "This must never be set outside local development.");
            // A short, bent walk near Movera, Zaragoza — NOT the canonical
            // Google reference polyline ("_p~iF~ps|U..."), which decodes to
            // California, ~9,000 km from any listing, and made fixture-mode
            // map UI work look broken. `app/lib/nearby.test.ts` decodes the
            // ORIGINAL reference vector on purpose, as a decoder correctness
            // test, and is untouched.
            return new OrsRoute(FixtureRoutePolyline, 340, 260);
        }

        if (!await budget.TryConsumeAsync(1, ct))
            throw new OrsUnavailableException("budget");

        var body = JsonSerializer.Serialize(new
        {
            coordinates = new[]
            {
                new[] { from.Lng, from.Lat },
                new[] { to.Lng, to.Lat },
            },
            // Encoded polyline rather than GeoJSON: an order of magnitude
            // smaller, and these are stored per entry per profile. Band
            // boundary routes pass simplify: false — a simplified geometry
            // can drop the exact vertex the two boundary routes converge at,
            // and RouteSplitter needs their tails to match point-for-point.
            geometry_simplify = simplify,
        });

        using var res = await SendAsync(
            $"{Base}/v2/directions/{NearbyGroups.OrsProfile(profile)}", body, ct);

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        var route = doc.RootElement.GetProperty("routes")[0];
        var summary = route.GetProperty("summary");

        return new OrsRoute(
            route.GetProperty("geometry").GetString()
                ?? throw new OrsUnavailableException("no_geometry"),
            (int)Math.Round(summary.GetProperty("distance").GetDouble()),
            (int)Math.Round(summary.GetProperty("duration").GetDouble()));
    }

    /// ONE retry on a 429, honouring Retry-After. Never a loop: repeatedly
    /// exceeding the quota can disable the account without notice, which makes
    /// an aggressive retry the most dangerous thing this feature could contain.
    private async Task<HttpResponseMessage> SendAsync(
        string url, string body, CancellationToken ct)
    {
        var http = factory.CreateClient("ors");

        for (var attempt = 0; attempt < 2; attempt++)
        {
            HttpResponseMessage res;
            try
            {
                res = await http.PostAsync(url,
                    new StringContent(body, Encoding.UTF8, "application/json"), ct);
            }
            catch (HttpRequestException e)
            {
                // DNS, connection refused, TLS — a transport failure, never an
                // ORS answer. Same shape as OverpassClient's own timeout guard:
                // this must become the same OrsUnavailableException a bad HTTP
                // status does, not an unhandled 500.
                log.LogWarning(e, "ORS transport failure for {Url}", url);
                throw new OrsUnavailableException("ors_unavailable");
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                // The HttpClient's own Timeout fired, not the caller's token —
                // a caller-initiated cancellation (ct.IsCancellationRequested)
                // is deliberately NOT caught here and propagates untouched.
                log.LogWarning("ORS request to {Url} timed out", url);
                throw new OrsUnavailableException("ors_unavailable");
            }

            if (res.IsSuccessStatusCode) return res;

            if (res.StatusCode == HttpStatusCode.TooManyRequests && attempt == 0)
            {
                var wait = res.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(2);
                res.Dispose();
                await Task.Delay(wait > TimeSpan.FromSeconds(10)
                    ? TimeSpan.FromSeconds(10) : wait, ct);
                continue;
            }

            log.LogWarning("ORS {Status} for {Url}", res.StatusCode, url);
            res.Dispose();
            throw new OrsUnavailableException(
                $"ors_{((int)res.StatusCode).ToString(CultureInfo.InvariantCulture)}");
        }
        throw new OrsUnavailableException("ors_429");
    }
}

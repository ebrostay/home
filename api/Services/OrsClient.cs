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

    public async Task<NearbyReach?[]> MatrixAsync(
        GeoPoint origin, IReadOnlyList<GeoPoint> destinations, string profile,
        CancellationToken ct)
    {
        if (destinations.Count == 0) return [];
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
            // `nearby_unroutable` refusal can be exercised on purpose.
            if (destinations.Count == 1 || !FixturesUnroutable)
                return [.. destinations.Select((_, i) => new NearbyReach(200 + i * 90, 3 + i))];
            var fixtureReach = new NearbyReach?[destinations.Count];
            for (var i = 0; i < destinations.Count; i++)
                fixtureReach[i] = i == destinations.Count - 1
                    ? null
                    : new NearbyReach(200 + i * 90, 3 + i);
            return fixtureReach;
        }

        if (!await budget.TryConsumeAsync(1, ct))
            throw new OrsUnavailableException("budget");

        var coords = new List<double[]> { new[] { origin.Lng, origin.Lat } };
        coords.AddRange(destinations.Select(d => new[] { d.Lng, d.Lat }));

        var body = JsonSerializer.Serialize(new
        {
            locations = coords,
            sources = new[] { 0 },
            metrics = new[] { "distance", "duration" },
        });

        using var res = await SendAsync(
            $"{Base}/v2/matrix/{NearbyGroups.OrsProfile(profile)}", body, ct);

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        var distances = doc.RootElement.GetProperty("distances")[0];
        var durations = doc.RootElement.GetProperty("durations")[0];

        var reach = new NearbyReach?[destinations.Count];
        for (var i = 0; i < destinations.Count; i++)
        {
            // Index 0 is the origin to itself.
            var m = distances[i + 1];
            var s = durations[i + 1];
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
        return reach;
    }

    public async Task<OrsRoute> RouteAsync(
        GeoPoint from, GeoPoint to, string profile, CancellationToken ct)
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
            return new OrsRoute("cse}Fbq_DcBwB{@kCkCcBoAkC", 340, 260);
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
            // smaller, and these are stored per entry per profile.
            geometry_simplify = true,
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

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
    private static bool Fixtures =>
        Environment.GetEnvironmentVariable("ORS_FIXTURES") == "1";

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
            // A single destination is a route preview: keep it non-null so
            // that flow still works locally. With more than one destination,
            // exercise the nullable-reach contract for real — a fully
            // populated fixture array meant NearbyLookup's foot-less-candidate
            // filter and the save path's `nearby_unroutable` refusal never
            // ran during local work. The LAST destination in the batch is
            // "unroutable", same as ORS returning null for one POI it cannot
            // reach.
            if (destinations.Count == 1) return [new NearbyReach(200, 3)];
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

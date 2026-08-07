using System.Security.Cryptography;
using System.Text;

namespace Ebrostay.Api.Services;

/// Pure geometry for the ADR-041 street band. Nothing here does IO.
public static class BandGeometry
{
    public static double Length(IReadOnlyList<GeoPoint> line)
    {
        double m = 0;
        for (var i = 1; i < line.Count; i++)
            m += OverpassClient.Haversine(
                line[i - 1].Lat, line[i - 1].Lng, line[i].Lat, line[i].Lng);
        return m;
    }

    public static GeoPoint MoveAlong(IReadOnlyList<GeoPoint> line, double metres)
    {
        var remaining = metres;
        for (var i = 1; i < line.Count; i++)
        {
            var seg = OverpassClient.Haversine(
                line[i - 1].Lat, line[i - 1].Lng, line[i].Lat, line[i].Lng);
            if (seg >= remaining && seg > 0)
            {
                var f = remaining / seg;
                return new GeoPoint(
                    line[i - 1].Lat + (line[i].Lat - line[i - 1].Lat) * f,
                    line[i - 1].Lng + (line[i].Lng - line[i - 1].Lng) * f);
            }
            remaining -= seg;
        }
        return line[^1];
    }

    public static List<GeoPoint> Slice(
        IReadOnlyList<GeoPoint> line, double fromM, double toM)
    {
        var result = new List<GeoPoint> { MoveAlong(line, fromM) };
        double walked = 0;
        for (var i = 1; i < line.Count; i++)
        {
            walked += OverpassClient.Haversine(
                line[i - 1].Lat, line[i - 1].Lng, line[i].Lat, line[i].Lng);
            if (walked > fromM && walked < toM) result.Add(line[i]);
        }
        result.Add(MoveAlong(line, toM));
        return result;
    }

    public static double ProjectArc(IReadOnlyList<GeoPoint> line, GeoPoint p)
    {
        double best = double.MaxValue, bestArc = 0, walked = 0;
        for (var i = 1; i < line.Count; i++)
        {
            var a = line[i - 1];
            var b = line[i];
            var segLen = OverpassClient.Haversine(a.Lat, a.Lng, b.Lat, b.Lng);
            // Project p onto segment a→b in a local flat frame.
            var cos = Math.Cos(a.Lat * Math.PI / 180);
            double ax = 0, ay = 0;
            double bx = (b.Lng - a.Lng) * cos, by = b.Lat - a.Lat;
            double px = (p.Lng - a.Lng) * cos, py = p.Lat - a.Lat;
            var len2 = bx * bx + by * by;
            var t = len2 == 0 ? 0 : Math.Clamp((px * bx + py * by) / len2, 0, 1);
            var dx = px - (ax + bx * t);
            var dy = py - (ay + by * t);
            var dist = Math.Sqrt(dx * dx + dy * dy);
            if (dist < best)
            {
                best = dist;
                bestArc = walked + segLen * t;
            }
            walked += segLen;
        }
        return bestArc;
    }

    /// Stable per listing, never in the middle band — an averaged segment
    /// midpoint must not converge on the door (ADR-041 point 2).
    public static double OffsetFraction(string listingId)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(listingId));
        var unit = BitConverter.ToUInt32(hash, 0) / (double)uint.MaxValue;
        // Map [0,1) onto [0.15,0.42] ∪ [0.58,0.85] (two 0.27-wide halves).
        return unit < 0.5
            ? 0.15 + unit * 2 * 0.27
            : 0.58 + (unit - 0.5) * 2 * 0.27;
    }

    public static (double FromM, double ToM) CutSegment(
        double streetLen, double homeArc, double fraction,
        double[] junctionArcs, double maxLen = 250, double wholeStreetTolerance = 300)
    {
        if (streetLen <= wholeStreetTolerance) return (0, streetLen);

        var from = Math.Clamp(homeArc - fraction * maxLen, 0, streetLen - maxLen);
        var to = from + maxLen;

        // Expand outward to whole blocks: nearest junction at-or-before `from`,
        // nearest at-or-after `to`; the street ends serve where no junction does.
        var snappedFrom = junctionArcs.Where(j => j <= from).DefaultIfEmpty(0).Max();
        var snappedTo = junctionArcs.Where(j => j >= to).DefaultIfEmpty(streetLen).Min();
        return (snappedFrom, snappedTo);
    }
}

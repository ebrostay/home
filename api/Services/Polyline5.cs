namespace Ebrostay.Api.Services;

/// Google encoded polyline, precision 5 — what ORS returns and what the band
/// route endpoints ship. C# twin of app/lib/nearby.ts decodePolyline.
public static class Polyline5
{
    public static List<GeoPoint> Decode(string encoded)
    {
        var points = new List<GeoPoint>();
        int index = 0, lat = 0, lng = 0;
        while (index < encoded.Length)
        {
            lat += Next(encoded, ref index);
            lng += Next(encoded, ref index);
            points.Add(new GeoPoint(lat / 1e5, lng / 1e5));
        }
        return points;
    }

    public static string Encode(IReadOnlyList<GeoPoint> points)
    {
        var sb = new System.Text.StringBuilder();
        int prevLat = 0, prevLng = 0;
        foreach (var p in points)
        {
            var lat = (int)Math.Round(p.Lat * 1e5);
            var lng = (int)Math.Round(p.Lng * 1e5);
            Write(sb, lat - prevLat);
            Write(sb, lng - prevLng);
            prevLat = lat; prevLng = lng;
        }
        return sb.ToString();
    }

    private static int Next(string s, ref int index)
    {
        int result = 0, shift = 0, b;
        do
        {
            b = s[index++] - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        return (result & 1) != 0 ? ~(result >> 1) : result >> 1;
    }

    private static void Write(System.Text.StringBuilder sb, int value)
    {
        var v = value < 0 ? ~(value << 1) : value << 1;
        while (v >= 0x20)
        {
            sb.Append((char)((0x20 | (v & 0x1f)) + 63));
            v >>= 5;
        }
        sb.Append((char)(v + 63));
    }
}
